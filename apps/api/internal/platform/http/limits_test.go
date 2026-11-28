package http

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
)

func assertPayloadTooLarge(t *testing.T, res *http.Response) {
	t.Helper()
	defer func() { _ = res.Body.Close() }()
	var data struct {
		Error struct{ Code, RequestID string }
	}
	err := json.NewDecoder(res.Body).Decode(&data)
	if err != nil || res.StatusCode != 413 || data.Error.Code != "PAYLOAD_TOO_LARGE" ||
		data.Error.RequestID == "" || res.Header.Get("X-Request-Id") != data.Error.RequestID {
		t.Fatalf("payload-too-large response: %d %+v decode=%v", res.StatusCode, data, err)
	}
}

func TestDecodeJSONSizeLimit(t *testing.T) {
	app := NewServer(nil, nil)
	app.Post("/api/v1/example", func(c fiber.Ctx) error {
		var body string
		if err := DecodeJSON(c, &body); err != nil {
			return err
		}
		return c.SendStatus(204)
	})
	atLimit := "\"" + strings.Repeat("x", maxJSONBytes-2) + "\""
	valid := httptest.NewRequest(http.MethodPost, "/api/v1/example", strings.NewReader(atLimit))
	valid.Header.Set("Content-Type", "application/json")
	res, err := app.Test(valid)
	if err != nil {
		t.Fatal(err)
	}
	if err := res.Body.Close(); err != nil || res.StatusCode != 204 {
		t.Fatalf("JSON at limit: %d %v", res.StatusCode, err)
	}
	for _, compressed := range []bool{false, true} {
		data := atLimit + " "
		var body io.Reader = strings.NewReader(data)
		if compressed {
			var buf bytes.Buffer
			writer := gzip.NewWriter(&buf)
			if _, err := io.WriteString(writer, data); err != nil {
				t.Fatal(err)
			}
			if err := writer.Close(); err != nil {
				t.Fatal(err)
			}
			body = &buf
		}
		req := httptest.NewRequest(http.MethodPost, "/api/v1/example", body)
		req.Header.Set("Content-Type", "application/json")
		if compressed {
			req.Header.Set("Content-Encoding", "gzip")
		}
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		assertPayloadTooLarge(t, res)
	}
}

func TestTransportBodyLimitOnListener(t *testing.T) {
	app := NewServer(nil, nil)
	app.Post("/api/v1/media/report-images", func(c fiber.Ctx) error { return c.SendStatus(204) })
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		done <- app.Listener(listener, fiber.ListenConfig{DisableStartupMessage: true})
	}()
	t.Cleanup(func() {
		// Closing the listener also stops a server that fails before its first request.
		_ = listener.Close()
		if err := <-done; err != nil && !errors.Is(err, net.ErrClosed) {
			t.Error(err)
		}
	})
	for _, chunked := range []bool{false, true} {
		t.Run(fmt.Sprintf("chunked=%t", chunked), func(t *testing.T) {
			conn, err := net.DialTimeout("tcp", listener.Addr().String(), 5*time.Second)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = conn.Close() }()
			if err := conn.SetDeadline(time.Now().Add(5 * time.Second)); err != nil {
				t.Fatal(err)
			}
			const headers = "POST /api/v1/media/report-images HTTP/1.1\r\nHost: localhost\r\n" +
				"Content-Type: multipart/form-data; boundary=oversized\r\nX-Request-Id: oversized\r\n"
			overflow := app.Config().BodyLimit + 1
			if chunked {
				_, err = fmt.Fprintf(conn, "%sTransfer-Encoding: chunked\r\n\r\n%x\r\n", headers, overflow)
			} else {
				_, err = fmt.Fprintf(conn, "%sContent-Length: %d\r\n\r\n", headers, overflow)
			}
			if err != nil {
				t.Fatal(err)
			}
			res, err := http.ReadResponse(bufio.NewReader(conn), nil)
			if err != nil {
				t.Fatal(err)
			}
			assertPayloadTooLarge(t, res)
		})
	}
}
