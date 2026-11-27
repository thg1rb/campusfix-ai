package http

import (
	"errors"
	"slices"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
)

type actorKey struct{}

func Actor(c fiber.Ctx) (domain.User, bool) {
	user, ok := c.Locals(actorKey{}).(domain.User)
	return user, ok
}

func (h *Handler) OptionalAuth(c fiber.Ctx) error {
	token := h.cookies.read(c, sessionCookie)
	if token == "" {
		return c.Next()
	}
	actor, err := h.service.GetMe(c.Context(), token)
	if errors.Is(err, apperror.Unauthenticated) {
		return c.Next()
	}
	if err != nil {
		return err
	}
	c.Locals(actorKey{}, actor)
	return c.Next()
}

func RequireAuth(c fiber.Ctx) error {
	if _, ok := Actor(c); !ok {
		return apperror.Unauthenticated
	}
	return c.Next()
}

func RequireRoles(roles ...domain.Role) fiber.Handler {
	return func(c fiber.Ctx) error {
		actor, ok := Actor(c)
		if !ok {
			return apperror.Unauthenticated
		}
		for _, role := range roles {
			if slices.Contains(actor.Roles, role) {
				return c.Next()
			}
		}
		return apperror.Forbidden
	}
}

func RequireExclusiveAdmin(c fiber.Ctx) error {
	actor, ok := Actor(c)
	if !ok {
		return apperror.Unauthenticated
	}
	if !actor.IsExclusiveAdmin() {
		return apperror.Forbidden
	}
	return c.Next()
}

func RejectAdminOperational(c fiber.Ctx) error {
	actor, ok := Actor(c)
	if !ok {
		return apperror.Unauthenticated
	}
	if slices.Contains(actor.Roles, domain.Administrator) {
		return apperror.New(403, "ADMIN_NON_OPERATIONAL", "Administrators cannot perform operational actions.")
	}
	return c.Next()
}

func (h *Handler) checkWriteOrigin(c fiber.Ctx) error {
	origin := c.Get("Origin")
	site := c.Get("Sec-Fetch-Site")
	if (origin != "" && !strings.EqualFold(origin, h.origin)) ||
		(origin == "" && site != "" && site != "same-origin") {
		return apperror.Forbidden
	}
	return c.Next()
}
