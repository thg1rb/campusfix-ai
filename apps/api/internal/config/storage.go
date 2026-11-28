package config

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Storage struct {
	Endpoint         string
	Region           string
	Bucket           string
	AccessKeyID      string
	SecretAccessKey  string
	UsePathStyle     bool
	AutoCreateBucket bool
	CleanupInterval  time.Duration
}

func (s Storage) Enabled() bool { return s.Endpoint != "" }

func loadStorage() (Storage, error) {
	s := Storage{
		Endpoint:        strings.TrimSpace(os.Getenv("S3_ENDPOINT")),
		Region:          envDefault("S3_REGION", "us-east-1"),
		Bucket:          strings.TrimSpace(os.Getenv("S3_BUCKET")),
		AccessKeyID:     os.Getenv("S3_ACCESS_KEY_ID"),
		SecretAccessKey: os.Getenv("S3_SECRET_ACCESS_KEY"),
		UsePathStyle:    true,
	}
	interval, err := time.ParseDuration(envDefault("MEDIA_CLEANUP_INTERVAL", "1h"))
	if err != nil || interval <= 0 {
		return Storage{}, errors.New("MEDIA_CLEANUP_INTERVAL must be a positive duration")
	}
	s.CleanupInterval = interval
	for name, field := range map[string]*bool{
		"S3_USE_PATH_STYLE": &s.UsePathStyle, "S3_AUTO_CREATE_BUCKET": &s.AutoCreateBucket,
	} {
		if value := os.Getenv(name); value != "" {
			*field, err = strconv.ParseBool(value)
			if err != nil {
				return Storage{}, fmt.Errorf("%s must be a boolean", name)
			}
		}
	}
	configured := s.Enabled() || s.Bucket != "" || s.AccessKeyID != "" || s.SecretAccessKey != "" ||
		os.Getenv("S3_REGION") != "" || os.Getenv("S3_USE_PATH_STYLE") != "" || os.Getenv("S3_AUTO_CREATE_BUCKET") != ""
	if !configured {
		return s, nil
	}
	if s.Endpoint == "" || s.Bucket == "" || strings.TrimSpace(s.AccessKeyID) == "" || strings.TrimSpace(s.SecretAccessKey) == "" {
		return Storage{}, errors.New("S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required together")
	}
	endpoint, err := url.Parse(s.Endpoint)
	if err != nil || endpoint.Hostname() == "" || endpoint.User != nil || endpoint.ForceQuery ||
		endpoint.RawQuery != "" || strings.Contains(s.Endpoint, "#") ||
		(endpoint.Path != "" && endpoint.Path != "/") || (endpoint.Scheme != "http" && endpoint.Scheme != "https") {
		return Storage{}, errors.New("S3_ENDPOINT must be an HTTP(S) origin")
	}
	if port := endpoint.Port(); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return Storage{}, errors.New("S3_ENDPOINT port must be between 1 and 65535")
		}
	}
	host := strings.ToLower(endpoint.Hostname())
	if endpoint.Scheme == "http" && host != "minio" && host != "localhost" && !net.ParseIP(host).IsLoopback() {
		return Storage{}, errors.New("S3_ENDPOINT requires HTTPS outside localhost and the MinIO Compose service")
	}
	s.Endpoint = endpoint.Scheme + "://" + endpoint.Host
	return s, nil
}
