package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/thg1rb/ku-spot/apps/api/internal/adapters/ai"
	"github.com/thg1rb/ku-spot/apps/api/internal/adapters/auth"
	"github.com/thg1rb/ku-spot/apps/api/internal/adapters/storage"
	"github.com/thg1rb/ku-spot/apps/api/internal/config"
	auditHTTP "github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/adapters/inbound/http"
	auditDB "github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/adapters/outbound/postgres"
	audit "github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/application"
	identityHTTP "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/adapters/inbound/http"
	identityDB "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/adapters/outbound/postgres"
	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/application"
	masterHTTP "github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/adapters/inbound/http"
	masterDB "github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/adapters/outbound/postgres"
	master "github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/application"
	mediaHTTP "github.com/thg1rb/ku-spot/apps/api/internal/modules/media/adapters/inbound/http"
	mediaDB "github.com/thg1rb/ku-spot/apps/api/internal/modules/media/adapters/outbound/postgres"
	media "github.com/thg1rb/ku-spot/apps/api/internal/modules/media/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/database"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/http"
)

type Application struct {
	Server      *fiber.App
	Database    *database.Connection
	maintenance maintenance
}

func New(ctx context.Context, settings config.Config) (*Application, error) {
	db, err := database.Open(settings.DatabaseURL)
	if err != nil {
		return nil, err
	}
	if !settings.Auth.GoogleEnabled() {
		slog.Info("Google OAuth is disabled because credentials are incomplete")
	}
	var objects media.ObjectStore
	if settings.Storage.Enabled() {
		s3, err := storage.NewS3(settings.Storage)
		if err == nil && settings.Storage.AutoCreateBucket {
			err = s3.Initialize(ctx)
		}
		if err != nil {
			return nil, errors.Join(fmt.Errorf("initialize media storage: %w", err), db.Close())
		}
		objects = s3
	}
	uploadTimeout := http.RouteTimeout{
		Method: fiber.MethodPost, Pattern: "/api/v1" + mediaHTTP.Path, Budget: 25 * time.Second,
	}
	app := http.NewServer(db, ai.NewClient(settings.AIURL), uploadTimeout)
	handler, identityService := registerIdentity(app, db, settings.Auth, auth.NewGoogle(settings.Auth), time.Now)
	mediaService := registerMedia(app, db, handler, objects, time.Now)
	if settings.SwaggerEnabled {
		http.RegisterSwagger(app)
	}
	interval := settings.Storage.CleanupInterval
	if interval <= 0 {
		interval = time.Hour
	}
	return &Application{
		Server: app, Database: db,
		maintenance: maintenance{interval: interval, media: mediaService, identity: identityService},
	}, nil
}

func registerIdentity(app *fiber.App, db *database.Connection, settings config.Auth, provider identity.AuthProvider, clock func() time.Time) (*identityHTTP.Handler, *identity.Service) {
	auditService := audit.New(auditDB.New(db), clock)
	identityService := identity.New(identityDB.New(db), db, auditService, settings.BootstrapAdminEmails, clock)
	handler := identityHTTP.New(identityService, provider, settings, clock)
	api := app.Group("/api/v1")
	handler.Register(api)
	masterService := master.New(masterDB.Categories(db), masterDB.Departments(db), masterDB.Locations(db), db, auditService)
	masterHTTP.Register(api, masterService, handler)
	api.Get("/admin/audit-logs", handler.OptionalAuth, identityHTTP.RequireExclusiveAdmin, auditHTTP.List(auditService, func(c fiber.Ctx) audit.AdminActor {
		actor, _ := identityHTTP.Actor(c)
		return actor
	}))
	return handler, identityService
}

func registerMedia(
	app *fiber.App,
	db *database.Connection,
	auth *identityHTTP.Handler,
	store media.ObjectStore,
	clock func() time.Time,
) *media.Service {
	service := media.New(mediaDB.New(db), store, db, nil, clock)
	mediaHTTP.Register(app.Group("/api/v1"), service, auth)
	return service
}
