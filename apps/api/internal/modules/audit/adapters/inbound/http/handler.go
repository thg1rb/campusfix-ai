package http

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
)

func List(service *application.Service) fiber.Handler {
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
		result, err := service.List(c.Context(), filter, page)
		if err != nil {
			return err
		}
		return c.JSON(result)
	}
}
