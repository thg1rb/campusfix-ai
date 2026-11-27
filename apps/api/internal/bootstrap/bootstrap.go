package bootstrap

import (
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/thg1rb/ku-spot/apps/api/internal/adapters/ai"
	"github.com/thg1rb/ku-spot/apps/api/internal/adapters/auth"
	"github.com/thg1rb/ku-spot/apps/api/internal/config"
	auditHTTP "github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/adapters/inbound/http"
	auditDB "github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/adapters/outbound/postgres"
	audit "github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/application"
	identityHTTP "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/adapters/inbound/http"
	identityDB "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/adapters/outbound/postgres"
	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/database"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/http"
)

type Application struct {
	Server   *fiber.App
	Database *database.Connection
}

func New(settings config.Config) (*Application, error) {
	db, err := database.Open(settings.DatabaseURL)
	if err != nil {
		return nil, err
	}
	if !settings.Auth.GoogleEnabled() {
		slog.Info("Google OAuth is disabled because credentials are incomplete")
	}
	app := http.NewServer(db, ai.NewClient(settings.AIURL))
	registerIdentity(app, db, settings.Auth, auth.NewGoogle(settings.Auth), time.Now)
	return &Application{Server: app, Database: db}, nil
}

func registerIdentity(app *fiber.App, db *database.Connection, settings config.Auth, provider identity.AuthProvider, clock func() time.Time) {
	auditService := audit.New(auditDB.New(db), clock)
	identityService := identity.New(identityDB.New(db), db, auditService, settings.BootstrapAdminEmails, clock)
	handler := identityHTTP.New(identityService, provider, settings, clock)
	api := app.Group("/api/v1")
	handler.Register(api)
	api.Get("/admin/audit-logs", handler.OptionalAuth, identityHTTP.RequireExclusiveAdmin, auditHTTP.List(auditService, func(c fiber.Ctx) audit.AdminActor {
		actor, _ := identityHTTP.Actor(c)
		return actor
	}))
}
