package application

import (
	"context"
	"errors"
	"maps"

	audit "github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	data "github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
)

type Filter struct {
	Search   string
	IsActive *bool
	Type     data.LocationType
}

type Repository[T any] interface {
	List(context.Context, Filter, pagination.Query) ([]T, int64, error)
	Active(context.Context) ([]T, error)
	Lock(context.Context, string) (T, error)
	Insert(context.Context, T) (T, error)
	Update(context.Context, T) error
}

type TxManager interface {
	WithTx(context.Context, func(context.Context) error) error
}

type AuditRecorder interface {
	Record(context.Context, audit.Entry) error
}

type resource[T any] struct {
	repo      Repository[T]
	normalize func(*T) error
	snapshot  func(T) map[string]any
	id        func(T) string
	entity    string
	tx        TxManager
	audit     AuditRecorder
}

type Service struct {
	categories  resource[data.Category]
	departments resource[data.Department]
	locations   resource[data.CampusLocation]
}

func New(categories Repository[data.Category], departments Repository[data.Department], locations Repository[data.CampusLocation], tx TxManager, recorder AuditRecorder) *Service {
	return &Service{
		categories: resource[data.Category]{categories, (*data.Category).Normalize, func(c data.Category) map[string]any {
			return map[string]any{"name": c.Name, "description": c.Description, "isActive": c.IsActive}
		}, func(c data.Category) string { return c.ID }, "CATEGORY", tx, recorder},
		departments: resource[data.Department]{departments, (*data.Department).Normalize, func(d data.Department) map[string]any {
			return map[string]any{"name": d.Name, "responsibilityScope": d.ResponsibilityScope, "isActive": d.IsActive}
		}, func(d data.Department) string { return d.ID }, "DEPARTMENT", tx, recorder},
		locations: resource[data.CampusLocation]{locations, (*data.CampusLocation).Normalize, func(l data.CampusLocation) map[string]any {
			return map[string]any{"name": l.Name, "type": l.Type, "lat": l.Lat, "lng": l.Lng, "isActive": l.IsActive}
		}, func(l data.CampusLocation) string { return l.ID }, "LOCATION", tx, recorder},
	}
}

type PublicMasterData struct {
	Categories  []data.Category
	Departments []data.Department
	Locations   []data.CampusLocation
}

func (s *Service) GetPublicMasterData(ctx context.Context) (PublicMasterData, error) {
	var result PublicMasterData
	var err error
	if result.Categories, err = s.categories.repo.Active(ctx); err != nil {
		return result, err
	}
	if result.Departments, err = s.departments.repo.Active(ctx); err != nil {
		return result, err
	}
	result.Locations, err = s.locations.repo.Active(ctx)
	return result, err
}

func (r resource[T]) list(ctx context.Context, actor domain.User, filter Filter, page pagination.Query) (pagination.Result[T], error) {
	if !actor.IsExclusiveAdmin() {
		return pagination.Result[T]{}, apperror.Forbidden
	}
	items, total, err := r.repo.List(ctx, filter, page)
	return pagination.New(page, items, total), err
}

func (r resource[T]) create(ctx context.Context, actor domain.User, value T) (T, error) {
	if !actor.IsExclusiveAdmin() {
		return value, apperror.Forbidden
	}
	if err := r.normalize(&value); err != nil {
		return value, err
	}
	var result T
	err := r.tx.WithTx(ctx, func(ctx context.Context) error {
		var err error
		result, err = r.repo.Insert(ctx, value)
		if err != nil {
			return err
		}
		return r.record(ctx, actor, "CREATE", nil, result)
	})
	return result, err
}

func (r resource[T]) update(ctx context.Context, actor domain.User, id string, apply func(*T)) (T, error) {
	var result T
	if !actor.IsExclusiveAdmin() {
		return result, apperror.Forbidden
	}
	err := r.tx.WithTx(ctx, func(ctx context.Context) error {
		current, err := r.repo.Lock(ctx, id)
		if err != nil {
			return err
		}
		before := r.snapshot(current)
		apply(&current)
		if r.id(current) != id {
			return apperror.Invalid
		}
		if err := r.normalize(&current); err != nil {
			return err
		}
		if maps.Equal(before, r.snapshot(current)) {
			result = current
			return nil
		}
		if err := r.repo.Update(ctx, current); err != nil {
			return err
		}
		result = current
		return r.record(ctx, actor, "UPDATE", before, result)
	})
	return result, err
}

func (r resource[T]) record(ctx context.Context, actor domain.User, action string, before map[string]any, after T) error {
	return r.audit.Record(ctx, audit.Entry{
		EntityType: r.entity, EntityID: r.id(after), Action: action + "_" + r.entity,
		ActorType: "USER", ActorUserID: &actor.ID, ActorRoles: []string{string(domain.Administrator)},
		Details: map[string]any{"before": before, "after": r.snapshot(after)},
	})
}

func (s *Service) ListCategories(ctx context.Context, actor domain.User, filter Filter, page pagination.Query) (pagination.Result[data.Category], error) {
	return s.categories.list(ctx, actor, filter, page)
}

func (s *Service) CreateCategory(ctx context.Context, actor domain.User, value data.Category) (data.Category, error) {
	value.ID = ""
	value.IsActive = true
	return s.categories.create(ctx, actor, value)
}

func (s *Service) UpdateCategory(ctx context.Context, actor domain.User, id string, apply func(*data.Category)) (data.Category, error) {
	return s.categories.update(ctx, actor, id, apply)
}

func (s *Service) ListDepartments(ctx context.Context, actor domain.User, filter Filter, page pagination.Query) (pagination.Result[data.Department], error) {
	return s.departments.list(ctx, actor, filter, page)
}

func (s *Service) CreateDepartment(ctx context.Context, actor domain.User, value data.Department) (data.Department, error) {
	value.ID = ""
	value.IsActive = true
	return s.departments.create(ctx, actor, value)
}

func (s *Service) UpdateDepartment(ctx context.Context, actor domain.User, id string, apply func(*data.Department)) (data.Department, error) {
	return s.departments.update(ctx, actor, id, apply)
}

func (s *Service) ListLocations(ctx context.Context, actor domain.User, filter Filter, page pagination.Query) (pagination.Result[data.CampusLocation], error) {
	return s.locations.list(ctx, actor, filter, page)
}

func (s *Service) CreateLocation(ctx context.Context, actor domain.User, value data.CampusLocation) (data.CampusLocation, error) {
	value.ID = ""
	value.IsActive = true
	return s.locations.create(ctx, actor, value)
}

func (s *Service) UpdateLocation(ctx context.Context, actor domain.User, id string, apply func(*data.CampusLocation)) (data.CampusLocation, error) {
	return s.locations.update(ctx, actor, id, apply)
}

// IsActiveLocation checks and locks the location for the caller's write transaction.
func (s *Service) IsActiveLocation(ctx context.Context, id string) (bool, error) {
	location, err := s.locations.repo.Lock(ctx, id)
	if errors.Is(err, data.ErrNotFound) {
		return false, nil
	}
	return location.IsActive, err
}
