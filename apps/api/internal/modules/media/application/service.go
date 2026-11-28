package application

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"github.com/google/uuid"
	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/media/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
)

var (
	ErrObjectNotFound     = errors.New("storage object not found")
	ErrStorageUnavailable = errors.New("media storage unavailable")
	ErrAdminOperational   = errors.New("administrators cannot perform operational actions")
)

type ObjectStore interface {
	Put(ctx context.Context, key, contentType string, data []byte) error
	Get(ctx context.Context, key string) ([]byte, error)
	Delete(ctx context.Context, key string) error
	EnsureBucket(ctx context.Context) error
}

type Repository interface {
	Insert(ctx context.Context, img domain.ReportImage) error
	ByID(ctx context.Context, id string) (domain.ReportImage, error)
	LockForBinding(ctx context.Context, reportID string, ids []string) ([]domain.ReportImage, error)
	Bind(ctx context.Context, reportID, id string, sortOrder int) error
	DeleteAttachments(ctx context.Context, reportID string, ids []string) error
	DeleteExpired(ctx context.Context, cutoff time.Time, limit int) ([]string, error)
}

type Transaction interface {
	WithTx(context.Context, func(context.Context) error) error
}

type ReportVisibilityResolver interface {
	ResolveReportVisibility(ctx context.Context, reportID string) (domain.Visibility, error)
}

type Service struct {
	repo    Repository
	store   ObjectStore
	tx      Transaction
	reports ReportVisibilityResolver
	now     func() time.Time
}

func New(
	repo Repository,
	store ObjectStore,
	tx Transaction,
	reports ReportVisibilityResolver,
	now func() time.Time,
) *Service {
	return &Service{repo: repo, store: store, tx: tx, reports: reports, now: now}
}

func (s *Service) StageReportImage(
	ctx context.Context,
	actor identity.User,
	fileName string,
	raw []byte,
) (domain.ReportImage, error) {
	if slices.Contains(actor.Roles, identity.Administrator) {
		return domain.ReportImage{}, ErrAdminOperational
	}
	if s.store == nil {
		return domain.ReportImage{}, ErrStorageUnavailable
	}
	data, contentType, err := domain.Sanitize(raw)
	if err != nil {
		return domain.ReportImage{}, err
	}
	if err := ctx.Err(); err != nil {
		return domain.ReportImage{}, err
	}
	now := s.now().UTC()
	expiry := now.Add(domain.StageLifetime)
	id := uuid.NewString()
	key := fmt.Sprintf("reports/%s/%s%s", now.Format("2006/01"), id, domain.Extension(contentType))
	img := domain.ReportImage{
		ID:           id,
		UploadedBy:   actor.ID,
		StorageKey:   key,
		FileName:     domain.SanitizeFileName(fileName, contentType),
		MIMEType:     contentType,
		SizeBytes:    len(data),
		EXIFStripped: true,
		ExpiresAt:    &expiry,
		CreatedAt:    now,
	}
	if err := s.store.Put(ctx, key, contentType, data); err != nil {
		return domain.ReportImage{}, fmt.Errorf("%w: %w", ErrStorageUnavailable, err)
	}
	if err := s.repo.Insert(ctx, img); err != nil {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
		defer cancel()
		if cleanupErr := s.store.Delete(cleanupCtx, key); cleanupErr != nil {
			slog.Error("delete image after failed staged insert", "error", apperror.Diagnostic(cleanupErr))
		}
		return domain.ReportImage{}, fmt.Errorf("insert staged image: %w", err)
	}
	return img, nil
}

type ImageContent struct {
	Data     []byte
	MIMEType string
	FileName string
	IsPublic bool
}

func (s *Service) GetReportImage(ctx context.Context, viewer *identity.User, id string) (ImageContent, error) {
	img, err := s.repo.ByID(ctx, id)
	if err != nil {
		return ImageContent{}, err
	}
	var visibility domain.Visibility
	if img.ReportID == nil {
		if img.ExpiresAt == nil || !img.ExpiresAt.After(s.now()) {
			return ImageContent{}, domain.ErrNotFound
		}
	} else {
		if s.reports == nil {
			return ImageContent{}, domain.ErrNotFound
		}
		visibility, err = s.reports.ResolveReportVisibility(ctx, *img.ReportID)
		if err != nil {
			return ImageContent{}, err
		}
	}
	if !domain.CanRead(img, visibility, viewer) {
		return ImageContent{}, domain.ErrNotFound
	}
	if s.store == nil {
		return ImageContent{}, ErrStorageUnavailable
	}
	data, err := s.store.Get(ctx, img.StorageKey)
	switch {
	case errors.Is(err, ErrObjectNotFound):
		return ImageContent{}, domain.ErrNotFound
	case err != nil:
		return ImageContent{}, fmt.Errorf("%w: %w", ErrStorageUnavailable, err)
	}
	fileName := img.FileName
	isPublic := img.ReportID != nil && visibility.Status == domain.Confirmed
	if isPublic {
		fileName = img.ID + domain.Extension(img.MIMEType)
	}
	return ImageContent{Data: data, MIMEType: img.MIMEType, FileName: fileName, IsPublic: isPublic}, nil
}

// BindToReport replaces the ordered image list. The caller must lock its parent Report
// in the outer transaction and delete returned objects only after that transaction commits.
func (s *Service) BindToReport(ctx context.Context, actorID, reportID string, imageIDs []string) ([]string, error) {
	if len(imageIDs) > domain.MaxImages {
		return nil, domain.ErrInvalidBinding
	}
	requested := make(map[string]struct{}, len(imageIDs))
	normalized := make([]string, 0, len(imageIDs))
	for _, id := range imageIDs {
		u, err := uuid.Parse(id)
		if err != nil || u == uuid.Nil {
			return nil, domain.ErrInvalidBinding
		}
		id = u.String()
		if _, exists := requested[id]; exists {
			return nil, domain.ErrInvalidBinding
		}
		requested[id] = struct{}{}
		normalized = append(normalized, id)
	}
	detached := []string{}
	err := s.tx.WithTx(ctx, func(ctx context.Context) error {
		images, err := s.repo.LockForBinding(ctx, reportID, normalized)
		if err != nil {
			return err
		}
		now := s.now()
		detachIDs := []string{}
		matched := 0
		for _, img := range images {
			if img.UploadedBy != actorID {
				return domain.ErrForbidden
			}
			if _, wanted := requested[img.ID]; !wanted {
				detachIDs = append(detachIDs, img.ID)
				detached = append(detached, img.StorageKey)
				continue
			}
			matched++
			if img.ReportID != nil {
				if *img.ReportID != reportID {
					return domain.ErrForbidden
				}
			} else if img.ExpiresAt == nil || !img.ExpiresAt.After(now) {
				return domain.ErrNotFound
			}
		}
		if matched != len(normalized) {
			return domain.ErrNotFound
		}
		if len(detachIDs) > 0 {
			if err := s.repo.DeleteAttachments(ctx, reportID, detachIDs); err != nil {
				return err
			}
		}
		for i, id := range normalized {
			if err := s.repo.Bind(ctx, reportID, id, i); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return detached, nil
}

func (s *Service) PurgeExpiredStagedImages(ctx context.Context) (int, error) {
	if s.store == nil {
		return 0, nil
	}
	const batchSize = 50
	total := 0
	cutoff := s.now()
	for {
		count := 0
		err := s.tx.WithTx(ctx, func(ctx context.Context) error {
			keys, err := s.repo.DeleteExpired(ctx, cutoff, batchSize)
			if err != nil {
				return err
			}
			for _, key := range keys {
				if err := s.store.Delete(ctx, key); err != nil {
					return fmt.Errorf("delete expired staged object: %w", err)
				}
			}
			count = len(keys)
			return nil
		})
		if err != nil {
			return total, err
		}
		total += count
		if count < batchSize {
			return total, nil
		}
	}
}
