package application_test

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/png"
	"testing"
	"time"

	"github.com/thg1rb/ku-spot/apps/api/internal/adapters/storage"
	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/media/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/media/domain"
)

type imageRepository struct {
	application.Repository
	image domain.ReportImage
	err   error
}

func (r *imageRepository) Insert(_ context.Context, img domain.ReportImage) error {
	r.image = img
	return r.err
}

func (r *imageRepository) ByID(context.Context, string) (domain.ReportImage, error) {
	return r.image, r.err
}

type visibilityResolver func(context.Context, string) (domain.Visibility, error)

func (r visibilityResolver) ResolveReportVisibility(ctx context.Context, id string) (domain.Visibility, error) {
	return r(ctx, id)
}

func TestStagedInsertFailureCompensatesObject(t *testing.T) {
	dbErr := errors.New("insert failed")
	objects := storage.NewMemory()
	repo := &imageRepository{err: dbErr}
	service := application.New(repo, objects, nil, nil, time.Now)
	var original bytes.Buffer
	if err := png.Encode(&original, image.NewGray(image.Rect(0, 0, 3, 3))); err != nil {
		t.Fatal(err)
	}
	owner := identity.User{ID: "uploader", IsActive: true}
	if _, err := service.StageReportImage(t.Context(), owner, "image.png", original.Bytes()); !errors.Is(err, dbErr) {
		t.Fatalf("stage: %v", err)
	}
	if repo.image.StorageKey == "" {
		t.Fatal("object key was never generated")
	}
	if _, err := objects.Get(t.Context(), repo.image.StorageKey); !errors.Is(err, storage.ErrObjectNotFound) {
		t.Fatalf("object survived failed insert: %v", err)
	}
	owner.Roles = []identity.Role{identity.Administrator}
	if _, err := service.StageReportImage(t.Context(), owner, "image.png", original.Bytes()); !errors.Is(err, application.ErrAdminOperational) {
		t.Fatalf("admin staged an image: %v", err)
	}
}

func TestAttachedPublicPreviewUsesGeneratedFilename(t *testing.T) {
	ctx := t.Context()
	objects := storage.NewMemory()
	id := "report"
	img := domain.ReportImage{
		ID: "image-id", ReportID: &id, FileName: "private-uploader-name.png",
		MIMEType: domain.MIMEPNG, StorageKey: "reports/image-id.png",
	}
	data := []byte{0x89, 'P', 'N', 'G'}
	if err := objects.Put(ctx, img.StorageKey, img.MIMEType, data); err != nil {
		t.Fatal(err)
	}
	for _, status := range []domain.ReportStatus{domain.Draft, domain.Confirmed} {
		resolver := visibilityResolver(func(_ context.Context, id string) (domain.Visibility, error) {
			if id != "report" {
				t.Errorf("unexpected report ID %q", id)
			}
			return domain.Visibility{OwnerID: "owner", Status: status}, nil
		})
		service := application.New(&imageRepository{image: img}, objects, nil, resolver, time.Now)
		got, err := service.GetReportImage(ctx, nil, img.ID)
		if status == domain.Draft {
			if !errors.Is(err, domain.ErrNotFound) {
				t.Fatalf("anonymous Draft read: %v", err)
			}
			continue
		}
		if err != nil || !got.IsPublic || got.FileName != "image-id.png" || !bytes.Equal(got.Data, data) {
			t.Fatalf("public image: %+v %v", got, err)
		}
	}
}
