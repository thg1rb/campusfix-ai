package postgres

import (
	"context"
	"time"

	"github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/database"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
)

type Repository struct{ db *database.Connection }

func New(db *database.Connection) *Repository { return &Repository{db: db} }

type entryRow struct {
	ID                                      string `gorm:"default:gen_random_uuid()"`
	EntityType, EntityID, Action, ActorType string
	ActorUserID, DepartmentID               *string
	ActorRoles                              []string       `gorm:"serializer:json;type:jsonb"`
	Details                                 map[string]any `gorm:"serializer:json;type:jsonb"`
	CreatedAt                               time.Time
}

func (r *Repository) Insert(ctx context.Context, e domain.Entry) error {
	row := entryRow{
		EntityType: e.EntityType, EntityID: e.EntityID, Action: e.Action, ActorType: e.ActorType,
		ActorUserID: e.ActorUserID, DepartmentID: e.DepartmentID, ActorRoles: e.ActorRoles,
		Details: e.Details, CreatedAt: e.CreatedAt,
	}
	return r.db.DB(ctx).Table("audit_logs").Create(&row).Error
}

func (r *Repository) List(ctx context.Context, f application.Filter, p pagination.Query) ([]domain.Entry, int64, error) {
	query := r.db.DB(ctx).Table("audit_logs")
	if f.EntityType != "" {
		query = query.Where("entity_type = ?", f.EntityType)
	}
	if f.Action != "" {
		query = query.Where("action = ?", f.Action)
	}
	if f.ActorUserID != "" {
		query = query.Where("actor_user_id = ?", f.ActorUserID)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []entryRow
	if err := query.Order("created_at DESC, id DESC").Offset(p.Offset()).Limit(p.Size).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	items := make([]domain.Entry, 0, len(rows))
	for _, row := range rows {
		items = append(items, domain.Entry{
			ID: row.ID, EntityType: row.EntityType, EntityID: row.EntityID, Action: row.Action,
			ActorType: row.ActorType, ActorUserID: row.ActorUserID, DepartmentID: row.DepartmentID,
			ActorRoles: row.ActorRoles, Details: row.Details, CreatedAt: row.CreatedAt.UTC(),
		})
	}
	return items, total, nil
}
