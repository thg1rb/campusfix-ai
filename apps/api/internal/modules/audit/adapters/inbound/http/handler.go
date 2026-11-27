package http

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
	"time"
)

type entryResponse struct {
	ID           string         `json:"id"`
	EntityType   string         `json:"entityType"`
	EntityID     string         `json:"entityId"`
	Action       string         `json:"action"`
	ActorType    string         `json:"actorType"`
	ActorUserID  *string        `json:"actorUserId"`
	ActorRoles   []string       `json:"actorRoles"`
	DepartmentID *string        `json:"departmentId"`
	Details      map[string]any `json:"details"`
	CreatedAt    time.Time      `json:"createdAt"`
}

func List(service *application.Service, actor func(fiber.Ctx) application.AdminActor) fiber.Handler {
	return func(c fiber.Ctx) error {
		page, err := pagination.Parse(c.Query("page"), c.Query("pageSize"))
		if err != nil {
			return err
		}
		filter := application.Filter{
			EntityType: c.Query("entityType"), Action: c.Query("action"), ActorUserID: c.Query("actorUserId"),
		}
		if filter.EntityType != "" && !domain.ValidEntityType(filter.EntityType) {
			return apperror.Invalid
		}
		if filter.ActorUserID != "" {
			id, err := uuid.Parse(filter.ActorUserID)
			if err != nil {
				return apperror.Invalid
			}
			filter.ActorUserID = id.String()
		}
		result, err := service.List(c.Context(), actor(c), filter, page)
		if err != nil {
			return err
		}
		items := make([]entryResponse, 0, len(result.Items))
		for _, item := range result.Items {
			items = append(items, entryResponse(item))
		}
		return c.JSON(pagination.Result[entryResponse]{Items: items, Pagination: result.Pagination})
	}
}
