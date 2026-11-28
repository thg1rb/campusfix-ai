package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/thg1rb/ku-spot/apps/api/internal/config"
)

func TestKeyValidationAndS3Errors(t *testing.T) {
	store := NewMemory()
	for _, key := range []string{"", "/foo", "a/../b", "dot..gif", "a\x00", "a\\b", "a//b", "./x"} {
		if err := store.Put(t.Context(), key, "image/png", nil); !errors.Is(err, ErrInvalidKey) {
			t.Errorf("key %q: %v", key, err)
		}
	}
	for _, tc := range []struct {
		code    string
		status  int
		missing bool
	}{
		{"NoSuchKey", 404, true},
		{"", 404, true},
		{"NoSuchBucket", 404, false},
		{"AccessDenied", 403, false},
	} {
		err := fmt.Errorf("get object: %w", minio.ErrorResponse{Code: tc.code, StatusCode: tc.status})
		if errors.Is(objectError(err), ErrObjectNotFound) != tc.missing {
			t.Errorf("incorrect missing mapping for %v", err)
		}
	}
}

func TestBucketInitializationRecoversFromTransientFailure(t *testing.T) {
	var calls atomic.Int32
	endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodHead {
			t.Errorf("unexpected method %s", r.Method)
		}
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer endpoint.Close()
	store, err := NewS3(testSettings(endpoint.URL))
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Initialize(t.Context()); err != nil || calls.Load() != 2 {
		t.Fatalf("ensure after startup failure: attempts=%d error=%v", calls.Load(), err)
	}
}

func testSettings(endpoint string) config.Storage {
	setting := func(key, fallback string) string {
		if value := os.Getenv(key); value != "" {
			return value
		}
		return fallback
	}
	return config.Storage{
		Endpoint: endpoint, Region: setting("S3_REGION", "us-east-1"),
		Bucket: setting("S3_BUCKET", "ku-spot-media"), AccessKeyID: setting("S3_ACCESS_KEY_ID", "kuspot-minio"),
		SecretAccessKey: setting("S3_SECRET_ACCESS_KEY", "kuspot-minio-local"),
		UsePathStyle:    true, AutoCreateBucket: true,
	}
}

func TestLiveMinIORoundTrip(t *testing.T) {
	endpoint := os.Getenv("KU_SPOT_TEST_S3_ENDPOINT")
	if endpoint == "" {
		t.Skip("set KU_SPOT_TEST_S3_ENDPOINT to run the live MinIO test")
	}
	settings := testSettings(endpoint)
	store, err := NewS3(settings)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.EnsureBucket(t.Context()); err != nil {
		t.Fatal(err)
	}
	key := "integration/" + uuid.NewString() + ".png"
	t.Cleanup(func() {
		if err := store.Delete(context.Background(), key); err != nil {
			t.Error(err)
		}
	})
	data := []byte{0x89, 'P', 'N', 'G', 0xff, 0x00}
	if err := store.Put(t.Context(), key, "image/png", data); err != nil {
		t.Fatal(err)
	}
	got, err := store.Get(t.Context(), key)
	if err != nil || !bytes.Equal(got, data) {
		t.Fatalf("get: %v %v", got, err)
	}
	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, endpoint+"/"+settings.Bucket+"/"+key, nil)
	if err != nil {
		t.Fatal(err)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("unsigned object access returned %d: %s", res.StatusCode, body)
	}
	for range 2 {
		if err := store.Delete(t.Context(), key); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := store.Get(t.Context(), key); !errors.Is(err, ErrObjectNotFound) {
		t.Fatalf("deleted object: %v", err)
	}
}
