package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/adapters/inbound/http"
	actor "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	platform "github.com/thg1rb/ku-spot/apps/api/internal/platform/http"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
)

type category struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	IsActive    bool   `json:"isActive"`
}

type department struct {
	ID                  string `json:"id"`
	Name                string `json:"name"`
	ResponsibilityScope string `json:"responsibilityScope"`
	IsActive            bool   `json:"isActive"`
}

type adminDepartment struct {
	department
	StaffUsernames []string `json:"staffUsernames"`
}

type location struct {
	ID       string              `json:"id"`
	Name     string              `json:"name"`
	Type     domain.LocationType `json:"type"`
	Lat      float64             `json:"lat"`
	Lng      float64             `json:"lng"`
	IsActive bool                `json:"isActive"`
}

type field[T any] struct{ value *T }

func (f *field[T]) UnmarshalJSON(raw []byte) error {
	if bytes.Equal(raw, []byte("null")) {
		return apperror.Invalid
	}
	return json.Unmarshal(raw, &f.value)
}

func (f field[T]) apply(target *T) {
	if f.value != nil {
		*target = *f.value
	}
}

type categoryFields struct {
	Name        field[string] `json:"name"`
	Description field[string] `json:"description"`
}

func (f categoryFields) empty() bool { return f.Name.value == nil && f.Description.value == nil }
func (f categoryFields) apply(c *domain.Category) {
	f.Name.apply(&c.Name)
	f.Description.apply(&c.Description)
}

type departmentFields struct {
	Name  field[string] `json:"name"`
	Scope field[string] `json:"responsibilityScope"`
}

func (f departmentFields) empty() bool { return f.Name.value == nil && f.Scope.value == nil }
func (f departmentFields) apply(d *domain.Department) {
	f.Name.apply(&d.Name)
	f.Scope.apply(&d.ResponsibilityScope)
}

type locationFields struct {
	Name field[string]              `json:"name"`
	Type field[domain.LocationType] `json:"type"`
	Lat  field[float64]             `json:"lat"`
	Lng  field[float64]             `json:"lng"`
}

func (f locationFields) empty() bool {
	return f.Name.value == nil && f.Type.value == nil && f.Lat.value == nil && f.Lng.value == nil
}
func (f locationFields) apply(l *domain.CampusLocation) {
	f.Name.apply(&l.Name)
	f.Type.apply(&l.Type)
	f.Lat.apply(&l.Lat)
	f.Lng.apply(&l.Lng)
}

type fields[T any] interface {
	empty() bool
	apply(*T)
}

type activeField struct {
	IsActive field[bool] `json:"isActive"`
}

func (f activeField) active() field[bool] { return f.IsActive }

type categoryPatch struct {
	categoryFields
	activeField
}

type departmentPatch struct {
	departmentFields
	activeField
}

type locationPatch struct {
	locationFields
	activeField
}

type patchFields[T any] interface {
	fields[T]
	active() field[bool]
}

type actorMiddleware interface {
	OptionalAuth(fiber.Ctx) error
	CheckWriteOrigin(fiber.Ctx) error
}

func Register(router fiber.Router, service *application.Service, auth actorMiddleware) {
	asCategory := func(c domain.Category) category { return category(c) }
	asDepartment := func(d domain.Department) department {
		return department{ID: d.ID, Name: d.Name, ResponsibilityScope: d.ResponsibilityScope, IsActive: d.IsActive}
	}
	asLocation := func(l domain.CampusLocation) location { return location(l) }
	router.Get("/public/master-data", func(c fiber.Ctx) error {
		result, err := service.GetPublicMasterData(c.Context())
		if err != nil {
			return err
		}
		return c.JSON(struct {
			Categories  []category   `json:"categories"`
			Departments []department `json:"departments"`
			Locations   []location   `json:"locations"`
		}{project(result.Categories, asCategory), project(result.Departments, asDepartment), project(result.Locations, asLocation)})
	})
	admin := router.Group("/admin")
	registerResource(admin, "/categories", auth, operations[domain.Category]{service.ListCategories, service.CreateCategory, service.UpdateCategory}, func(c fiber.Ctx) (categoryFields, error) {
		return decode[categoryFields](c)
	}, decode[categoryPatch], func(c *domain.Category) *bool { return &c.IsActive }, asCategory, asCategory)
	registerResource(admin, "/departments", auth, operations[domain.Department]{service.ListDepartments, service.CreateDepartment, service.UpdateDepartment}, func(c fiber.Ctx) (departmentFields, error) {
		return decode[departmentFields](c)
	}, decode[departmentPatch], func(d *domain.Department) *bool { return &d.IsActive }, func(d domain.Department) adminDepartment {
		return adminDepartment{asDepartment(d), d.StaffUsernames}
	}, asDepartment)
	registerResource(admin, "/locations", auth, operations[domain.CampusLocation]{service.ListLocations, service.CreateLocation, service.UpdateLocation}, func(c fiber.Ctx) (locationFields, error) {
		input, err := decode[locationFields](c)
		if err == nil && (input.Lat.value == nil || input.Lng.value == nil) {
			err = apperror.New(422, "VALIDATION_ERROR", "Latitude and longitude are required.")
		}
		return input, err
	}, decode[locationPatch], func(l *domain.CampusLocation) *bool { return &l.IsActive }, asLocation, asLocation)
}

func project[T, DTO any](items []T, convert func(T) DTO) []DTO {
	result := make([]DTO, 0, len(items))
	for _, item := range items {
		result = append(result, convert(item))
	}
	return result
}

func decode[T any](c fiber.Ctx) (T, error) {
	var result *T
	var empty T
	if err := platform.DecodeJSON(c, &result); err != nil {
		return empty, err
	}
	if result == nil {
		return empty, apperror.Invalid
	}
	return *result, nil
}

type operations[T any] struct {
	list   func(context.Context, actor.User, application.Filter, pagination.Query) (pagination.Result[T], error)
	create func(context.Context, actor.User, T) (T, error)
	update func(context.Context, actor.User, string, func(*T)) (T, error)
}

func registerResource[T any, F fields[T], P patchFields[T], Row, DTO any](
	router fiber.Router, path string, auth actorMiddleware, resource operations[T],
	createInput func(fiber.Ctx) (F, error), patchInput func(fiber.Ctx) (P, error), active func(*T) *bool, listDTO func(T) Row, writeDTO func(T) DTO,
) {
	router.Get(path, auth.OptionalAuth, identity.RequireExclusiveAdmin, func(c fiber.Ctx) error {
		page, err := pagination.Parse(c.Query("page"), c.Query("pageSize"))
		if err != nil {
			return err
		}
		filter, err := parseFilter(c, path == "/locations")
		if err != nil {
			return err
		}
		actor, _ := identity.Actor(c)
		result, err := resource.list(c.Context(), actor, filter, page)
		if err != nil {
			return err
		}
		return c.JSON(pagination.Result[Row]{Items: project(result.Items, listDTO), Pagination: result.Pagination})
	})
	router.Post(path, auth.CheckWriteOrigin, auth.OptionalAuth, identity.RequireExclusiveAdmin, func(c fiber.Ctx) error {
		input, err := createInput(c)
		if err != nil {
			return err
		}
		var value T
		input.apply(&value)
		actor, _ := identity.Actor(c)
		result, err := resource.create(c.Context(), actor, value)
		if err != nil {
			return mapError(err)
		}
		return c.Status(fiber.StatusCreated).JSON(writeDTO(result))
	})
	router.Patch(path+"/:id", auth.CheckWriteOrigin, auth.OptionalAuth, identity.RequireExclusiveAdmin, func(c fiber.Ctx) error {
		id, err := uuid.Parse(c.Params("id"))
		if err != nil {
			return apperror.Invalid
		}
		input, err := patchInput(c)
		if err != nil {
			return err
		}
		on := input.active()
		if input.empty() && on.value == nil {
			return apperror.Invalid
		}
		actor, _ := identity.Actor(c)
		result, err := resource.update(c.Context(), actor, id.String(), func(value *T) {
			input.apply(value)
			on.apply(active(value))
		})
		if err != nil {
			return mapError(err)
		}
		return c.JSON(writeDTO(result))
	})
}

func parseFilter(c fiber.Ctx, locations bool) (application.Filter, error) {
	result := application.Filter{Search: strings.TrimSpace(c.Query("q"))}
	if strings.ContainsRune(result.Search, 0) {
		return result, apperror.Invalid
	}
	switch raw := c.Query("isActive"); raw {
	case "true", "false":
		active := raw == "true"
		result.IsActive = &active
	case "":
	default:
		return result, apperror.Invalid
	}
	if raw := c.Query("type"); raw != "" {
		result.Type = domain.LocationType(raw)
		if !locations || !result.Type.Valid() {
			return result, apperror.Invalid
		}
	}
	return result, nil
}

func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return apperror.NotFound
	case errors.Is(err, domain.ErrNameTaken):
		return apperror.New(409, "NAME_TAKEN", err.Error())
	case errors.Is(err, domain.ErrCoordinatesOutOfBounds):
		return apperror.New(422, "COORDINATES_OUT_OF_BOUNDS", err.Error())
	case errors.Is(err, domain.ErrNameRequired), errors.Is(err, domain.ErrNameTooLong), errors.Is(err, domain.ErrNameControl),
		errors.Is(err, domain.ErrLocationType), errors.Is(err, domain.ErrDetails):
		return apperror.New(422, "VALIDATION_ERROR", err.Error())
	default:
		return err
	}
}
