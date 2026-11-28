package http

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/thg1rb/ku-spot/apps/api/internal/config"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	platform "github.com/thg1rb/ku-spot/apps/api/internal/platform/http"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
)

type Handler struct {
	service  *application.Service
	provider application.AuthProvider
	cookies  cookies
	origin   string
	now      func() time.Time
}

func New(service *application.Service, provider application.AuthProvider, a config.Auth, clock func() time.Time) *Handler {
	return &Handler{
		service: service, provider: provider, cookies: newCookies(a.SessionSecret, a.CookieSecure, clock),
		origin: a.AppBaseURL, now: clock,
	}
}

func (h *Handler) Register(router fiber.Router) {
	router.Get("/auth/login", h.login)
	router.Get("/auth/callback", h.callback)
	router.Post("/auth/logout", h.CheckWriteOrigin, h.OptionalAuth, RequireAuth, h.logout)
	router.Get("/me", h.OptionalAuth, RequireAuth, h.me)
	router.Patch("/me/username", h.CheckWriteOrigin, h.OptionalAuth, RequireAuth, h.updateUsername)
	router.Get("/admin/users", h.OptionalAuth, RequireExclusiveAdmin, h.listUsers)
	router.Patch("/admin/users/:id", h.CheckWriteOrigin, h.OptionalAuth, RequireExclusiveAdmin, h.updateUser)
}

type profile struct {
	ID            string        `json:"id"`
	Username      string        `json:"username"`
	RealName      string        `json:"realName"`
	Email         string        `json:"email"`
	EmailVerified bool          `json:"emailVerified"`
	HostedDomain  *string       `json:"hostedDomain"`
	AvatarURL     *string       `json:"avatarUrl"`
	AuthProvider  string        `json:"authProvider"`
	Roles         []domain.Role `json:"roles"`
	DepartmentID  *string       `json:"departmentId"`
	IsActive      bool          `json:"isActive"`
	CreatedAt     time.Time     `json:"createdAt"`
}

func (h *Handler) logout(c fiber.Ctx) error {
	actor, _ := Actor(c)
	if err := h.service.Logout(c.Context(), actor, h.cookies.read(c, sessionCookie)); err != nil {
		return err
	}
	h.cookies.write(c, sessionCookie, sessionCookiePath, "", 0)
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handler) me(c fiber.Ctx) error {
	actor, _ := Actor(c)
	return c.JSON(profile(actor))
}

func (h *Handler) updateUsername(c fiber.Ctx) error {
	var input struct {
		Username string `json:"username"`
	}
	if err := platform.DecodeJSON(c, &input); err != nil {
		return err
	}
	actor, _ := Actor(c)
	user, err := h.service.UpdateMyUsername(c.Context(), actor, input.Username)
	if err != nil {
		return mapIdentityError(err)
	}
	return c.JSON(profile(user))
}

func (h *Handler) listUsers(c fiber.Ctx) error {
	page, err := pagination.Parse(c.Query("page"), c.Query("pageSize"))
	if err != nil {
		return err
	}
	filter := application.UserFilter{Search: strings.TrimSpace(c.Query("q")), Role: domain.Role(c.Query("role"))}
	if filter.Role != "" && !domain.ValidRole(filter.Role) {
		return apperror.Invalid
	}
	if raw := c.Query("isActive"); raw != "" {
		if raw != "true" && raw != "false" {
			return apperror.Invalid
		}
		active, _ := strconv.ParseBool(raw)
		filter.IsActive = &active
	}
	actor, _ := Actor(c)
	result, err := h.service.ListAdminUsers(c.Context(), actor, filter, page)
	if err != nil {
		return err
	}
	profiles := make([]profile, 0, len(result.Items))
	for _, user := range result.Items {
		profiles = append(profiles, profile(user))
	}
	return c.JSON(pagination.Result[profile]{Items: profiles, Pagination: result.Pagination})
}

func parsePatch(c fiber.Ctx) (application.UserPatch, error) {
	var patch application.UserPatch
	var input struct {
		Roles        json.RawMessage `json:"roles"`
		DepartmentID json.RawMessage `json:"departmentId"`
		IsActive     json.RawMessage `json:"isActive"`
	}
	if err := platform.DecodeJSON(c, &input); err != nil {
		return patch, err
	}
	if input.Roles != nil && (json.Unmarshal(input.Roles, &patch.Roles) != nil || patch.Roles == nil) {
		return patch, apperror.Invalid
	}
	if input.IsActive != nil && (json.Unmarshal(input.IsActive, &patch.IsActive) != nil || patch.IsActive == nil) {
		return patch, apperror.Invalid
	}
	if input.DepartmentID != nil {
		var department *string
		if json.Unmarshal(input.DepartmentID, &department) != nil {
			return patch, apperror.Invalid
		}
		if department != nil {
			id, err := uuid.Parse(*department)
			if err != nil {
				return patch, apperror.Invalid
			}
			normalized := id.String()
			department = &normalized
		}
		patch.DepartmentID = &department
	}
	if patch.Roles == nil && patch.DepartmentID == nil && patch.IsActive == nil {
		return patch, apperror.Invalid
	}
	return patch, nil
}

func (h *Handler) updateUser(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return apperror.Invalid
	}
	patch, err := parsePatch(c)
	if err != nil {
		return err
	}
	actor, _ := Actor(c)
	user, err := h.service.UpdateAdminUser(c.Context(), actor, id.String(), patch)
	if err != nil {
		return mapIdentityError(err)
	}
	return c.JSON(profile(user))
}

func mapIdentityError(err error) error {
	switch {
	case errors.Is(err, domain.ErrUsername), errors.Is(err, domain.ErrRoles):
		return apperror.New(422, "VALIDATION_ERROR", err.Error())
	case errors.Is(err, domain.ErrUsernameTaken):
		return apperror.New(409, "USERNAME_TAKEN", err.Error())
	case errors.Is(err, domain.ErrLastAdmin):
		return apperror.New(409, "LAST_ACTIVE_ADMIN", err.Error())
	case errors.Is(err, domain.ErrExclusiveAdmin):
		return apperror.New(422, "EXCLUSIVE_ADMIN_CONFLICT", err.Error())
	case errors.Is(err, domain.ErrSingleDepartment):
		return apperror.New(422, "SINGLE_DEPARTMENT_LIMIT", err.Error())
	case errors.Is(err, domain.ErrDepartmentRequired):
		return apperror.New(422, "DEPARTMENT_REQUIRED", err.Error())
	case errors.Is(err, domain.ErrDepartmentUnavailable):
		return apperror.New(422, "DEPARTMENT_UNAVAILABLE", err.Error())
	default:
		return err
	}
}
