package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/thg1rb/ku-spot/apps/api/internal/modules/media/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/database"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const table = "report_images"

type Repository struct{ db *database.Connection }

func New(db *database.Connection) *Repository { return &Repository{db: db} }

type imageRow struct {
	ID           string
	ReportID     *string
	UploadedBy   string
	StorageKey   string
	FileName     string
	MIMEType     string `gorm:"column:mime_type"`
	SizeBytes    int
	SortOrder    int
	EXIFStripped bool `gorm:"column:exif_stripped"`
	ExpiresAt    *time.Time
	CreatedAt    time.Time
}

func (r *Repository) Insert(ctx context.Context, img domain.ReportImage) error {
	row := imageRow(img)
	return r.db.DB(ctx).Table(table).Create(&row).Error
}

func (r *Repository) ByID(ctx context.Context, id string) (domain.ReportImage, error) {
	var row imageRow
	err := r.db.DB(ctx).Table(table).Where("id = ?", id).Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = domain.ErrNotFound
	}
	return domain.ReportImage(row), err
}

func (r *Repository) LockForBinding(ctx context.Context, reportID string, ids []string) ([]domain.ReportImage, error) {
	query := r.db.DB(ctx).Table(table).Where("report_id = ?", reportID)
	if len(ids) > 0 {
		query = query.Or("id IN ?", ids)
	}
	rows := []imageRow{}
	if err := query.Order("id").Clauses(clause.Locking{Strength: "UPDATE"}).Find(&rows).Error; err != nil {
		return nil, err
	}
	images := make([]domain.ReportImage, 0, len(rows))
	for _, row := range rows {
		images = append(images, domain.ReportImage(row))
	}
	return images, nil
}

func (r *Repository) Bind(ctx context.Context, reportID, id string, sortOrder int) error {
	return r.db.DB(ctx).Table(table).Where("id = ?", id).Updates(map[string]any{
		"report_id": reportID, "sort_order": sortOrder, "expires_at": nil,
	}).Error
}

func (r *Repository) DeleteAttachments(ctx context.Context, reportID string, ids []string) error {
	return r.db.DB(ctx).Exec("DELETE FROM report_images WHERE report_id = ? AND id IN ?", reportID, ids).Error
}

func (r *Repository) DeleteExpired(ctx context.Context, cutoff time.Time, limit int) ([]string, error) {
	keys := []string{}
	err := r.db.DB(ctx).Raw(`
		WITH expired AS (
			SELECT id FROM report_images
			WHERE report_id IS NULL AND expires_at <= ?
			ORDER BY expires_at, id LIMIT ? FOR UPDATE SKIP LOCKED
		)
		DELETE FROM report_images AS image USING expired
		WHERE image.id = expired.id
		RETURNING image.storage_key`, cutoff, limit).Scan(&keys).Error
	return keys, err
}

func (r *Repository) ListByReportIDs(ctx context.Context, reportIDs []string) ([]domain.ReportImage, error) {
	if len(reportIDs) == 0 {
		return nil, nil
	}
	var rows []imageRow
	if err := r.db.DB(ctx).Table(table).Where("report_id IN ?", reportIDs).
		Order("report_id, sort_order, id").Find(&rows).Error; err != nil {
		return nil, err
	}
	images := make([]domain.ReportImage, 0, len(rows))
	for _, row := range rows {
		images = append(images, domain.ReportImage(row))
	}
	return images, nil
}
