package http

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	platform "github.com/thg1rb/ku-spot/apps/api/internal/platform/http"
)

func assertStatus(t *testing.T, app *fiber.App, request *http.Request, want int) {
	t.Helper()
	res, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	if err := res.Body.Close(); err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != want {
		t.Fatalf("got %d, want %d", res.StatusCode, want)
	}
}

func testApp() *fiber.App {
	return fiber.New(fiber.Config{ErrorHandler: func(c fiber.Ctx, err error) error {
		var status *apperror.Error
		if !errors.As(err, &status) {
			return c.SendStatus(500)
		}
		return c.SendStatus(status.Status)
	}})
}

func TestCheckWriteOrigin(t *testing.T) {
	h := Handler{origin: "http://localhost:3000"}
	app := testApp()
	app.Post("/", h.CheckWriteOrigin, func(c fiber.Ctx) error { return c.SendStatus(204) })
	for _, tc := range []struct {
		name, origin, referer, site string
		cookie                      bool
		status                      int
	}{
		{"browser", h.origin, "", "same-origin", true, 204},
		{"referer fallback", "", h.origin + "/profile?q=x", "", true, 204},
		{"cross origin", "https://other.example", h.origin + "/profile", "same-origin", true, 403},
		{"conflicting fetch metadata", h.origin, "", "same-site", true, 403},
		{"null origin", "null", "", "", true, 403},
		{"origin is a URL with path", h.origin + "/profile", "", "", true, 403},
		{"foreign referer", "", "http://localhost:3001/profile", "", true, 403},
		{"relative referer", "", "/profile", "same-origin", true, 403},
		{"missing provenance", "", "", "same-origin", true, 403},
		{"guest without metadata", "", "", "", false, 204},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/", nil)
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Referer", tc.referer)
			req.Header.Set("Sec-Fetch-Site", tc.site)
			if tc.cookie {
				req.Header.Set("Cookie", sessionCookie+"=fixture")
			}
			assertStatus(t, app, req, tc.status)
		})
	}
}

func TestRBACMiddleware(t *testing.T) {
	dept := "department"
	reporter := &domain.User{IsActive: true, Roles: []domain.Role{domain.Reporter}}
	admin := &domain.User{IsActive: true, Roles: []domain.Role{domain.Administrator}}
	for _, tc := range []struct {
		name    string
		handler fiber.Handler
		actor   *domain.User
		status  int
	}{
		{"guest role", RequireRoles(domain.Reviewer), nil, 401},
		{"any listed role", RequireRoles(domain.Reviewer, domain.Reporter), reporter, 204},
		{"missing role", RequireRoles(domain.Reviewer), reporter, 403},
		{"exclusive admin", RequireExclusiveAdmin, admin, 204},
		{"guest admin", RequireExclusiveAdmin, nil, 401},
		{"reporter admin", RequireExclusiveAdmin, reporter, 403},
		{"mixed roles", RequireExclusiveAdmin, &domain.User{IsActive: true, Roles: []domain.Role{domain.Administrator, domain.Reporter}}, 403},
		{"admin department", RequireExclusiveAdmin, &domain.User{IsActive: true, Roles: admin.Roles, DepartmentID: &dept}, 403},
		{"inactive admin", RequireExclusiveAdmin, &domain.User{Roles: admin.Roles}, 403},
		{"admin operational", RejectAdminOperational, admin, 403},
		{"guest operational", RejectAdminOperational, nil, 401},
		{"reporter operational", RejectAdminOperational, reporter, 204},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app := testApp()
			app.Get("/", func(c fiber.Ctx) error {
				if tc.actor != nil {
					c.Locals(actorKey{}, *tc.actor)
				}
				return c.Next()
			}, tc.handler, func(c fiber.Ctx) error { return c.SendStatus(204) })
			assertStatus(t, app, httptest.NewRequest("GET", "/", nil), tc.status)
		})
	}
}

func TestDecodeMediaType(t *testing.T) {
	app := testApp()
	app.Patch("/", func(c fiber.Ctx) error {
		var input struct{ Username string }
		if err := platform.DecodeJSON(c, &input); err != nil {
			return err
		}
		return c.SendStatus(204)
	})
	for _, tc := range []struct {
		mediaType, body string
		status          int
	}{
		{"", `{"username":"name"}`, 415},
		{"text/plain", `{"username":"name"}`, 415},
		{"application/json; broken", `{"username":"name"}`, 415},
		{"application/json; charset=UTF-8", `{"username":"name"}`, 204},
		{"application/json", `{"username":`, 400},
	} {
		req := httptest.NewRequest("PATCH", "/", strings.NewReader(tc.body))
		if tc.mediaType != "" {
			req.Header.Set("Content-Type", tc.mediaType)
		}
		assertStatus(t, app, req, tc.status)
	}
}
