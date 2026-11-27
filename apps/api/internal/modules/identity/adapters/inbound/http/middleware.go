package http

import (
	"errors"
	"net/url"
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
	if site := c.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" {
		return apperror.Forbidden
	}
	if origin := c.Get("Origin"); origin != "" {
		if !sameWriteOrigin(origin, h.origin, false) {
			return apperror.Forbidden
		}
	} else if referer := c.Get("Referer"); referer != "" {
		if !sameWriteOrigin(referer, h.origin, true) {
			return apperror.Forbidden
		}
	} else if c.Cookies(sessionCookie) != "" {
		return apperror.Forbidden
	}
	return c.Next()
}

func sameWriteOrigin(value, appOrigin string, referer bool) bool {
	candidate, err := url.Parse(value)
	if err != nil || candidate.User != nil || candidate.Hostname() == "" || candidate.Fragment != "" {
		return false
	}
	if !referer && (candidate.Path != "" || candidate.ForceQuery || candidate.RawQuery != "") {
		return false
	}
	expected, err := url.Parse(appOrigin)
	return err == nil && candidate.Scheme == expected.Scheme &&
		strings.EqualFold(candidate.Hostname(), expected.Hostname()) &&
		originPort(candidate) == originPort(expected)
}

func originPort(u *url.URL) string {
	if port := u.Port(); port != "" {
		return port
	}
	if u.Scheme == "https" {
		return "443"
	}
	return "80"
}
