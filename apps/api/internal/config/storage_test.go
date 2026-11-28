package config

import (
	"testing"
	"time"
)

func TestStorageConfig(t *testing.T) {
	for _, key := range []string{"S3_ENDPOINT", "S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID",
		"S3_SECRET_ACCESS_KEY", "S3_USE_PATH_STYLE", "S3_AUTO_CREATE_BUCKET", "MEDIA_CLEANUP_INTERVAL"} {
		t.Setenv(key, "")
	}
	s, err := loadStorage()
	if err != nil || s.Enabled() || s.CleanupInterval != time.Hour || !s.UsePathStyle || s.AutoCreateBucket {
		t.Fatalf("defaults: enabled=%t interval=%v error=%v", s.Enabled(), s.CleanupInterval, err)
	}
	t.Setenv("S3_ENDPOINT", "http://minio:9000")
	if _, err := loadStorage(); err == nil {
		t.Fatal("incomplete storage config accepted")
	}
	t.Setenv("S3_BUCKET", "ku-spot-media")
	t.Setenv("S3_ACCESS_KEY_ID", "test")
	t.Setenv("S3_SECRET_ACCESS_KEY", "test-secret")
	t.Setenv("S3_AUTO_CREATE_BUCKET", "true")
	t.Setenv("MEDIA_CLEANUP_INTERVAL", "15m")
	for _, endpoint := range []string{"http://minio:9000", "http://127.0.0.1:9000", "http://localhost:9000/", "https://s3.example.test"} {
		t.Setenv("S3_ENDPOINT", endpoint)
		s, err := loadStorage()
		if err != nil || !s.Enabled() || !s.AutoCreateBucket || s.CleanupInterval != 15*time.Minute {
			t.Fatalf("endpoint %s: enabled=%t error=%v", endpoint, s.Enabled(), err)
		}
	}
	for _, endpoint := range []string{"http://s3.example.test", "https://minio:65536", "https://user@minio", "https://minio?", "https://minio#", "https://minio/path", "ftp://minio"} {
		t.Setenv("S3_ENDPOINT", endpoint)
		if _, err := loadStorage(); err == nil {
			t.Errorf("invalid endpoint accepted: %s", endpoint)
		}
	}
	t.Setenv("S3_ENDPOINT", "http://minio:9000")
	t.Setenv("MEDIA_CLEANUP_INTERVAL", "0s")
	if _, err := loadStorage(); err == nil {
		t.Error("invalid cleanup interval accepted")
	}
}
