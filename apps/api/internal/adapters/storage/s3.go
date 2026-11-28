package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/minio/minio-go/v7/pkg/s3utils"
	"github.com/thg1rb/ku-spot/apps/api/internal/config"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/media/domain"
)

type S3Store struct {
	client     *minio.Core
	bucket     string
	region     string
	autoCreate bool
}

func NewS3(settings config.Storage) (*S3Store, error) {
	endpoint, err := url.Parse(settings.Endpoint)
	if err != nil {
		return nil, errors.New("parse S3 endpoint")
	}
	if err := s3utils.CheckValidBucketNameStrict(settings.Bucket); err != nil {
		return nil, errors.New("S3_BUCKET must be a valid S3 bucket name")
	}
	lookup := minio.BucketLookupDNS
	if settings.UsePathStyle {
		lookup = minio.BucketLookupPath
	}
	client, err := minio.NewCore(endpoint.Host, &minio.Options{
		Creds:        credentials.NewStaticV4(settings.AccessKeyID, settings.SecretAccessKey, ""),
		Secure:       endpoint.Scheme == "https",
		Region:       settings.Region,
		BucketLookup: lookup,
		MaxRetries:   1,
	})
	if err != nil {
		return nil, fmt.Errorf("initialize S3 client: %w", err)
	}
	return &S3Store{client: client, bucket: settings.Bucket, region: settings.Region, autoCreate: settings.AutoCreateBucket}, nil
}

func (s *S3Store) Put(ctx context.Context, key, contentType string, data []byte) error {
	if err := validateKey(key); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	_, err := s.client.Client.PutObject(
		ctx, s.bucket, key, bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: contentType, DisableMultipart: true},
	)
	return err
}

func (s *S3Store) Get(ctx context.Context, key string) ([]byte, error) {
	if err := validateKey(key); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	body, _, _, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, objectError(err)
	}
	defer func() { _ = body.Close() }()
	data, err := io.ReadAll(io.LimitReader(body, domain.MaxImageBytes+1))
	if err != nil {
		return nil, objectError(err)
	}
	if len(data) > domain.MaxImageBytes {
		return nil, domain.ErrMediaTooLarge
	}
	return data, nil
}

func (s *S3Store) Delete(ctx context.Context, key string) error {
	if err := validateKey(key); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	err := objectError(s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{}))
	if errors.Is(err, ErrObjectNotFound) {
		return nil
	}
	return err
}

func objectError(err error) error {
	var response minio.ErrorResponse
	if errors.As(err, &response) && (response.Code == "NoSuchKey" ||
		response.StatusCode == 404 && response.Code != "NoSuchBucket") {
		return ErrObjectNotFound
	}
	return err
}

func (s *S3Store) EnsureBucket(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil || exists {
		return err
	}
	if !s.autoCreate {
		return errors.New("configured S3 bucket does not exist")
	}
	err = s.client.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{Region: s.region})
	switch minio.ToErrorResponse(err).Code {
	case "BucketAlreadyOwnedByYou", "BucketAlreadyExists":
		if exists, checkErr := s.client.BucketExists(ctx, s.bucket); checkErr == nil && exists {
			return nil
		}
	}
	return err
}

func (s *S3Store) Initialize(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	for delay := 250 * time.Millisecond; ; delay = min(2*delay, 2*time.Second) {
		err := s.EnsureBucket(ctx)
		if err == nil || !retryable(err) {
			return err
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return fmt.Errorf("initialize S3 bucket: %w", ctx.Err())
		case <-timer.C:
		}
	}
}

func retryable(err error) bool {
	var response minio.ErrorResponse
	if errors.As(err, &response) {
		return response.StatusCode >= 500 || response.Code == "XMinioServerNotInitialized" || response.Code == "OperationAborted"
	}
	var network *net.OpError
	return errors.Is(err, context.DeadlineExceeded) || errors.As(err, &network)
}
