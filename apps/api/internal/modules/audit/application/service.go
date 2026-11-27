package application

import (
	"context"
	"time"

	"github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
)

type Filter struct{ EntityType, Action, ActorUserID string }

type Repository interface {
	Insert(context.Context, domain.Entry) error
	List(context.Context, Filter, pagination.Query) ([]domain.Entry, int64, error)
}

type Service struct {
	repo Repository
	now  func() time.Time
}

func New(repo Repository, clock func() time.Time) *Service { return &Service{repo: repo, now: clock} }

func (s *Service) Record(ctx context.Context, entry domain.Entry) error {
	if entry.ActorRoles == nil {
		entry.ActorRoles = []string{}
	}
	if entry.Details == nil {
		entry.Details = map[string]any{}
	}
	if entry.CreatedAt.IsZero() {
		entry.CreatedAt = s.now().UTC()
	}
	return s.repo.Insert(ctx, entry)
}

type AdminActor interface{ IsExclusiveAdmin() bool }

func (s *Service) List(ctx context.Context, actor AdminActor, filter Filter, page pagination.Query) (pagination.Result[domain.Entry], error) {
	if actor == nil || !actor.IsExclusiveAdmin() {
		return pagination.Result[domain.Entry]{}, apperror.Forbidden
	}
	items, total, err := s.repo.List(ctx, filter, page)
	return pagination.New(page, items, total), err
}
