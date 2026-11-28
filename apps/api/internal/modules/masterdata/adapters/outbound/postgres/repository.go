package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/database"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type categoryRow struct {
	UpdatedAt   time.Time
	ID          string `gorm:"default:gen_random_uuid()"`
	Name        string
	Description string
	IsActive    bool
}

type departmentRow struct {
	UpdatedAt           time.Time
	ID                  string `gorm:"default:gen_random_uuid()"`
	Name                string
	ResponsibilityScope string
	IsActive            bool
}

type locationRow struct {
	UpdatedAt time.Time
	ID        string `gorm:"default:gen_random_uuid()"`
	Name      string
	Type      domain.LocationType
	Lat, Lng  float64
	IsActive  bool
}

type repository[T, Row any] struct {
	db       *database.Connection
	table    string
	search   string
	toDomain func(Row) T
	toRow    func(T) Row
	id       func(T) string
}

func Categories(db *database.Connection) application.Repository[domain.Category] {
	return repository[domain.Category, categoryRow]{
		db, "categories", " OR strpos(lower(description), lower(@needle)) > 0",
		func(c categoryRow) domain.Category {
			return domain.Category{ID: c.ID, Name: c.Name, Description: c.Description, IsActive: c.IsActive}
		},
		func(c domain.Category) categoryRow {
			return categoryRow{ID: c.ID, Name: c.Name, Description: c.Description, IsActive: c.IsActive}
		},
		func(c domain.Category) string { return c.ID },
	}
}

func Locations(db *database.Connection) application.Repository[domain.CampusLocation] {
	return repository[domain.CampusLocation, locationRow]{
		db, "campus_locations", "",
		func(l locationRow) domain.CampusLocation {
			return domain.CampusLocation{ID: l.ID, Name: l.Name, Type: l.Type, Lat: l.Lat, Lng: l.Lng, IsActive: l.IsActive}
		},
		func(l domain.CampusLocation) locationRow {
			return locationRow{ID: l.ID, Name: l.Name, Type: l.Type, Lat: l.Lat, Lng: l.Lng, IsActive: l.IsActive}
		},
		func(l domain.CampusLocation) string { return l.ID },
	}
}

type departments struct {
	repository[domain.Department, departmentRow]
}

func Departments(db *database.Connection) application.Repository[domain.Department] {
	return departments{repository[domain.Department, departmentRow]{
		db, "departments", " OR strpos(lower(responsibility_scope), lower(@needle)) > 0",
		func(d departmentRow) domain.Department {
			return domain.Department{ID: d.ID, Name: d.Name, ResponsibilityScope: d.ResponsibilityScope, IsActive: d.IsActive}
		},
		func(d domain.Department) departmentRow {
			return departmentRow{ID: d.ID, Name: d.Name, ResponsibilityScope: d.ResponsibilityScope, IsActive: d.IsActive}
		},
		func(d domain.Department) string { return d.ID },
	}}
}

func (r repository[T, Row]) query(ctx context.Context) *gorm.DB {
	return r.db.DB(ctx).Table(r.table)
}

func (r repository[T, Row]) rows(query *gorm.DB) ([]T, error) {
	var rows []Row
	if err := query.Order("lower(name), id").Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]T, 0, len(rows))
	for _, row := range rows {
		items = append(items, r.toDomain(row))
	}
	return items, nil
}

func (r repository[T, Row]) Active(ctx context.Context) ([]T, error) {
	return r.rows(r.query(ctx).Where("is_active = true"))
}

func (r repository[T, Row]) List(ctx context.Context, filter application.Filter, page pagination.Query) ([]T, int64, error) {
	query := r.query(ctx)
	if filter.IsActive != nil {
		query = query.Where("is_active = ?", *filter.IsActive)
	}
	if filter.Type != "" {
		query = query.Where("type = ?", filter.Type)
	}
	if filter.Search != "" {
		query = query.Where("(strpos(lower(name), lower(@needle)) > 0"+r.search+")", map[string]any{"needle": filter.Search})
	}
	var total int64
	if err := query.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items, err := r.rows(query.Limit(page.Size).Offset(page.Offset()))
	return items, total, err
}

func (r departments) List(ctx context.Context, filter application.Filter, page pagination.Query) ([]domain.Department, int64, error) {
	items, total, err := r.repository.List(ctx, filter, page)
	if err != nil || len(items) == 0 {
		return items, total, err
	}
	positions := make(map[string]int, len(items))
	ids := make([]string, 0, len(items))
	for i := range items {
		id := items[i].ID
		positions[id] = i
		ids = append(ids, id)
		items[i].StaffUsernames = []string{}
	}
	var staff []struct{ DepartmentID, Username string }
	err = r.db.DB(ctx).Table("users u").Select("u.department_id, u.username").
		Joins("JOIN user_roles r ON r.user_id = u.id AND r.role = ?", "DEPARTMENT_STAFF").
		Where("u.is_active AND u.department_id IN ?", ids).
		Order("lower(u.username), u.id").Scan(&staff).Error
	if err != nil {
		return nil, 0, err
	}
	for _, user := range staff {
		i := positions[user.DepartmentID]
		items[i].StaffUsernames = append(items[i].StaffUsernames, user.Username)
	}
	return items, total, nil
}

func (r repository[T, Row]) Lock(ctx context.Context, id string) (T, error) {
	var row Row
	err := r.query(ctx).Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = domain.ErrNotFound
	}
	return r.toDomain(row), err
}

func (r repository[T, Row]) Insert(ctx context.Context, value T) (T, error) {
	row := r.toRow(value)
	err := r.query(ctx).Create(&row).Error
	return r.toDomain(row), r.nameError(err)
}

func (r repository[T, Row]) Update(ctx context.Context, value T) error {
	row := r.toRow(value)
	query := r.query(ctx).Where("id = ?", r.id(value))
	return r.nameError(query.Select("*").Omit("id").Updates(&row).Error)
}

func (r repository[T, Row]) nameError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == r.table+"_name_key" {
		return domain.ErrNameTaken
	}
	return err
}
