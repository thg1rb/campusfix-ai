package bootstrap

import (
	"context"
	"log/slog"
	"time"

	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/application"
	media "github.com/thg1rb/ku-spot/apps/api/internal/modules/media/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
)

type maintenance struct {
	interval time.Duration
	media    *media.Service
	identity *identity.Service
}

func (a *Application) RunMaintenance(ctx context.Context) {
	ticker := time.NewTicker(a.maintenance.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.maintenance.run(ctx)
		}
	}
}

func (m maintenance) run(ctx context.Context) {
	mediaCtx, cancelMedia := context.WithTimeout(ctx, time.Minute)
	images, err := m.media.PurgeExpiredStagedImages(mediaCtx)
	cancelMedia()
	if err != nil {
		slog.Error("purge expired staged images", "deleted", images, "error", apperror.Diagnostic(err))
	} else {
		slog.Info("purged expired staged images", "deleted", images)
	}

	sessionCtx, cancelSessions := context.WithTimeout(ctx, 15*time.Second)
	defer cancelSessions()
	sessions, err := m.identity.PurgeExpiredSessions(sessionCtx)
	if err != nil {
		slog.Error("purge expired sessions", "deleted", sessions, "error", apperror.Diagnostic(err))
	} else {
		slog.Info("purged expired sessions", "deleted", sessions)
	}
}
