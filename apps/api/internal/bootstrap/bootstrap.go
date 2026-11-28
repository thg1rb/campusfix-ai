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
	mediaDomain "github.com/thg1rb/ku-spot/apps/api/internal/modules/media/domain"
	reportHTTP "github.com/thg1rb/ku-spot/apps/api/internal/modules/reports/adapters/inbound/http"
	reportDB "github.com/thg1rb/ku-spot/apps/api/internal/modules/reports/adapters/outbound/postgres"
	reports "github.com/thg1rb/ku-spot/apps/api/internal/modules/reports/application"
	reportDomain "github.com/thg1rb/ku-spot/apps/api/internal/modules/reports/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/database"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/http"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/numbering"
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
	handler, identityService, masterService, auditService := registerIdentity(app, db, settings.Auth, auth.NewGoogle(settings.Auth), time.Now)
	mediaService, reportService, err := registerReports(app, db, handler, objects, masterService, auditService, time.Now)
	if err != nil {
		return nil, errors.Join(err, db.Close())
	}
	if settings.SwaggerEnabled {
		http.RegisterSwagger(app)
	}
	interval := settings.Storage.CleanupInterval
	if interval <= 0 {
		interval = time.Hour
	}
	return &Application{
		Server: app, Database: db,
		maintenance: maintenance{interval: interval, media: mediaService, identity: identityService, reports: reportService},
	}, nil
}

func registerIdentity(app *fiber.App, db *database.Connection, settings config.Auth, provider identity.AuthProvider, clock func() time.Time) (*identityHTTP.Handler, *identity.Service, *master.Service, *audit.Service) {
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
	return handler, identityService, masterService, auditService
}

func registerReports(
	app *fiber.App,
	db *database.Connection,
	auth *identityHTTP.Handler,
	store media.ObjectStore,
	locations reports.LocationLookup,
	recorder reports.AuditRecorder,
	clock func() time.Time,
) (*media.Service, *reports.Service, error) {
	numbers, err := numbering.New(db, clock)
	if err != nil {
		return nil, nil, err
	}
	repo := reportDB.New(db)
	service := media.New(mediaDB.New(db), store, db, reportVisibility{repo}, clock)
	reportService := reports.New(repo, db, reportMedia{service}, locations, numbers, recorder, reports.NoopTriageHook{}, clock)
	api := app.Group("/api/v1")
	mediaHTTP.Register(api, service, auth)
	reportHTTP.Register(api, reportService, auth)
	return service, reportService, nil
}

type reportVisibility struct {
	reports interface {
		Find(context.Context, string, bool) (reportDomain.Report, error)
	}
}

func (r reportVisibility) ResolveReportVisibility(ctx context.Context, id string) (mediaDomain.Visibility, error) {
	report, err := r.reports.Find(ctx, id, false)
	if errors.Is(err, reportDomain.ErrNotFound) {
		return mediaDomain.Visibility{}, mediaDomain.ErrNotFound
	}
	return mediaDomain.Visibility{OwnerID: report.ReporterID, Status: mediaDomain.ReportStatus(report.Status)}, err
}

type reportMedia struct{ *media.Service }

func (m reportMedia) ListByReportIDs(ctx context.Context, ids []string) (map[string][]reportDomain.AttachedImage, error) {
	rows, err := m.Service.ListByReportIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	items := make(map[string][]reportDomain.AttachedImage, len(ids))
	for _, row := range rows {
		items[row.ReportID] = append(items[row.ReportID], reportDomain.AttachedImage{
			ID: row.ID, FileName: row.FileName, MIMEType: row.MIMEType, SizeBytes: row.SizeBytes,
			SortOrder: row.SortOrder, PreviewURL: row.PreviewURL,
		})
	}
	return items, nil
}
