package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
)

type auditTestRepo struct {
	entry domain.Entry
	reads int
}

func (r *auditTestRepo) Insert(_ context.Context, e domain.Entry) error { r.entry = e; return nil }
func (r *auditTestRepo) List(context.Context, Filter, pagination.Query) ([]domain.Entry, int64, error) {
	r.reads++
	return []domain.Entry{r.entry}, 1, nil
}

type auditTestActor bool

func (a auditTestActor) IsExclusiveAdmin() bool { return bool(a) }
func TestAuditAccessAndClock(t *testing.T) {
	repo := &auditTestRepo{}
	now := time.Date(2026, 11, 27, 22, 0, 0, 0, time.FixedZone("UTC+7", 7*3600))
	service := New(repo, func() time.Time { return now })
	if err := service.Record(t.Context(), domain.Entry{}); err != nil {
		t.Fatal(err)
	}
	if !repo.entry.CreatedAt.Equal(now) || repo.entry.CreatedAt.Location() != time.UTC {
		t.Fatal(repo.entry.CreatedAt)
	}
	page := pagination.Query{Page: 1, Size: 25}
	for _, actor := range []AdminActor{nil, auditTestActor(false)} {
		if _, err := service.List(t.Context(), actor, Filter{}, page); !errors.Is(err, apperror.Forbidden) {
			t.Fatal(err)
		}
	}
	if repo.reads != 0 {
		t.Fatal("unauthorized repository access")
	}
	if result, err := service.List(t.Context(), auditTestActor(true), Filter{}, page); err != nil || len(result.Items) != 1 {
		t.Fatalf("authorized list: %v, %v", result, err)
	}
}
