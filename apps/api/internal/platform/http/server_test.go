package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"
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
