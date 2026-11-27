package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gofiber/fiber/v3"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type checkFunc func(context.Context) error

func (fn checkFunc) Check(ctx context.Context) error { return fn(ctx) }

func TestProbeAndAPIContracts(t *testing.T) {
	ok := checkFunc(func(context.Context) error { return nil })
	down := checkFunc(func(context.Context) error { return errors.New("unavailable") })
	for _, tc := range []struct {
		path   string
		check  Checker
		status int
		body   string
	}{
		{"/healthz", down, 200, `{"status":"ok"}`},
		{"/readyz", ok, 200, `{"status":"ok","checks":{"db":"ok","ai":"ok"}}`},
		{"/readyz", down, 503, `{"status":"unavailable","checks":{"db":"ok","ai":"unavailable"}}`},
		{"/api/v1/unknown", ok, 404, `{"error":{"code":"NOT_FOUND","message":"The requested resource was not found.","details":{},"requestId":"test-id"}}`},
	} {
		req := httptest.NewRequest("GET", tc.path, nil)
		req.Header.Set("X-Request-Id", "test-id")
		res, err := NewServer(ok, tc.check).Test(req)
		if err != nil {
			t.Fatal(err)
		}
		var actual any
		err = json.NewDecoder(res.Body).Decode(&actual)
		if closeErr := res.Body.Close(); closeErr != nil {
			t.Error(closeErr)
		}
		if err != nil {
			t.Fatal(err)
		}
		got, _ := json.Marshal(actual)
		var expected any
		if err := json.Unmarshal([]byte(tc.body), &expected); err != nil {
			t.Fatal(err)
		}
		want, _ := json.Marshal(expected)
		if res.StatusCode != tc.status || string(want) != string(got) || res.Header.Get("X-Request-Id") != "test-id" {
			t.Fatalf("%s: %d %s", tc.path, res.StatusCode, got)
		}
	}
}

func TestAPITimeoutOverride(t *testing.T) {
	app := NewServer(nil, nil, RouteTimeout{Method: "POST", Pattern: "/api/v1/upload/:id", Budget: 23 * time.Second})
	check := func(c fiber.Ctx) error {
		deadline, ok := c.Context().Deadline()
		want := defaultAPITimeout
		if c.Method() == "POST" {
			want = 23 * time.Second
		}
		if !ok || time.Until(deadline) < want-time.Second || time.Until(deadline) > want {
			t.Errorf("bad deadline for %s: %s", c.Method(), time.Until(deadline))
		}
		return c.SendStatus(204)
	}
	app.Get("/api/v1/upload/:id", check)
	app.Post("/api/v1/upload/:id", check)
	for _, method := range []string{"GET", "POST"} {
		res, err := app.Test(httptest.NewRequest(method, "/api/v1/upload/1", nil))
		if err != nil {
			t.Fatal(err)
		}
		if err := res.Body.Close(); err != nil {
			t.Fatal(err)
		}
		if res.StatusCode != 204 {
			t.Fatal(res.StatusCode)
		}
	}
}

func TestSafeErrorAndPanicDiagnostics(t *testing.T) {
	var logs bytes.Buffer
	original := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(original) })
	app := NewServer(nil, nil)
	private := "private test payload"
	app.Get("/api/v1/error", func(fiber.Ctx) error { return fmt.Errorf("%s: %w", private, context.DeadlineExceeded) })
	app.Get("/api/v1/panic", func(fiber.Ctx) error { panic(private) })
	for _, tc := range []struct {
		path   string
		status int
	}{{"/api/v1/error", 503}, {"/api/v1/panic", 500}} {
		req := httptest.NewRequest("GET", tc.path, nil)
		req.Header.Set("X-Request-Id", "test-request")
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(res.Body)
		if closeErr := res.Body.Close(); closeErr != nil {
			t.Fatal(closeErr)
		}
		if err != nil || res.StatusCode != tc.status || strings.Contains(string(body), private) {
			t.Fatalf("unexpected error response: %d %s %v", res.StatusCode, body, err)
		}
	}
	if strings.Contains(logs.String(), private) || !strings.Contains(logs.String(), `"reason":"deadline_exceeded"`) ||
		!strings.Contains(logs.String(), `"request_id":"test-request"`) || !strings.Contains(logs.String(), `"stack":`) {
		t.Fatalf("bad diagnostics: %s", logs.String())
	}
}
