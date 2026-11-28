package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/thg1rb/ku-spot/apps/api/internal/modules/reports/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/reports/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/database"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct{ db *database.Connection }

func New(db *database.Connection) *Repository { return &Repository{db: db} }

type row struct {
	ID, ReporterID                                                                   string
	ReportNumber                                                                     *string
	Status                                                                           domain.Status
	Version                                                                          int
	Description                                                                      string
	LocationID, LocationName, LocationDetailNote                                     *string
	Lat, Lng                                                                         *float64
	AIGeneratedTitle, RequestedTargetTicketID, TicketID, RejectionReason, ReviewedBy *string
	ReviewedAt, SubmittedAt, CancelledAt                                             *time.Time
	CreatedAt, UpdatedAt                                                             time.Time
}

func (r row) report() domain.Report {
	return domain.Report{ID: r.ID, ReporterID: r.ReporterID, ReportNumber: r.ReportNumber, Status: r.Status,
		Version: r.Version, Description: r.Description, Location: domain.Location{ID: r.LocationID, Name: r.LocationName, DetailNote: r.LocationDetailNote, Lat: r.Lat, Lng: r.Lng},
		AIGeneratedTitle: r.AIGeneratedTitle, RequestedTargetTicketID: r.RequestedTargetTicketID,
		TicketID: r.TicketID, RejectionReason: r.RejectionReason, ReviewedBy: r.ReviewedBy, ReviewedAt: r.ReviewedAt,
		SubmittedAt: r.SubmittedAt, CancelledAt: r.CancelledAt, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt}
}

func (r *Repository) query(ctx context.Context) *gorm.DB { return r.db.DB(ctx).Table("reports") }

func (r *Repository) Insert(ctx context.Context, report domain.Report) error {
	return r.query(ctx).Create(map[string]any{
		"id": report.ID, "reporter_id": report.ReporterID, "report_number": report.ReportNumber,
		"status": report.Status, "version": report.Version, "description": report.Description,
		"location_id": report.Location.ID, "location_name": report.Location.Name, "location_detail_note": report.Location.DetailNote,
		"lat": report.Location.Lat, "lng": report.Location.Lng, "created_at": report.CreatedAt,
		"updated_at": report.UpdatedAt, "submitted_at": report.SubmittedAt,
	}).Error
}

func (r *Repository) Update(ctx context.Context, report domain.Report) error {
	return r.query(ctx).Where("id = ?", report.ID).Updates(map[string]any{
		"report_number": report.ReportNumber, "status": report.Status, "version": report.Version, "description": report.Description,
		"location_id": report.Location.ID, "location_name": report.Location.Name, "location_detail_note": report.Location.DetailNote,
		"lat": report.Location.Lat, "lng": report.Location.Lng, "updated_at": report.UpdatedAt,
		"submitted_at": report.SubmittedAt, "cancelled_at": report.CancelledAt,
	}).Error
}

func (r *Repository) Find(ctx context.Context, id string, lock bool) (domain.Report, error) {
	var record row
	query := r.query(ctx).Where("id = ?", id)
	if lock {
		query = query.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	err := query.Take(&record).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = domain.ErrNotFound
	}
	return record.report(), err
}

func (r *Repository) List(ctx context.Context, owner string, filter application.Filter, page pagination.Query) ([]domain.Report, int64, error) {
	query := r.query(ctx).Where("reporter_id = ?", owner)
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.ReportNumber != "" {
		query = query.Where("report_number = ?", filter.ReportNumber)
	}
	if filter.Search != "" {
		query = query.Where("strpos(lower(concat_ws(' ',report_number,ai_generated_title,description,location_name,location_detail_note)),lower(?)) > 0", filter.Search)
	}
	var total int64
	if err := query.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []row
	if err := query.Order("updated_at DESC, id DESC").Limit(page.Size).Offset(page.Offset()).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	items := make([]domain.Report, 0, len(rows))
	for _, record := range rows {
		items = append(items, record.report())
	}
	return items, total, nil
}

func (r *Repository) Counts(ctx context.Context, owner string) (domain.ReportCounts, error) {
	var counts domain.ReportCounts
	err := r.query(ctx).Where("reporter_id = ?", owner).Select(`
		count(*) AS total,
		count(*) FILTER (WHERE status = 'DRAFT') AS draft,
		count(*) FILTER (WHERE status = 'PENDING_REVIEW') AS pending_review,
		count(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed,
		count(*) FILTER (WHERE status = 'REJECTED') AS rejected,
		count(*) FILTER (WHERE status = 'CANCELLED') AS cancelled
	`).Scan(&counts).Error
	return counts, err
}

func (r *Repository) LockExpired(ctx context.Context, cutoff time.Time, limit int) ([]application.ExpiredReport, error) {
	var rows []application.ExpiredReport
	err := r.db.DB(ctx).Raw(`
		SELECT id, status FROM reports
		WHERE (status = 'DRAFT' AND created_at <= ?) OR (status = 'CANCELLED' AND cancelled_at <= ?)
		ORDER BY CASE WHEN status = 'DRAFT' THEN created_at ELSE cancelled_at END, id
		LIMIT ? FOR UPDATE SKIP LOCKED`, cutoff, cutoff, limit).Scan(&rows).Error
	return rows, err
}

func (r *Repository) Delete(ctx context.Context, ids []string) error {
	return r.db.DB(ctx).Exec("DELETE FROM reports WHERE id IN ?", ids).Error
}
