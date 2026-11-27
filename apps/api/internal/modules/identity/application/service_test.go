package application

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"testing"

	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
)

type provisioningRepo struct {
	Repository
	names      []string
	collisions int
	failure    error
}

func (r *provisioningRepo) InsertUser(_ context.Context, _ domain.ExternalIdentity, username string, _ domain.Role) (domain.User, error) {
	r.names = append(r.names, username)
	if r.failure != nil {
		return domain.User{}, r.failure
	}
	if len(r.names) <= r.collisions {
		return domain.User{}, domain.ErrUsernameTaken
	}
	return domain.User{Username: username}, nil
}

func TestProvisionUsernameAttempts(t *testing.T) {
	for _, count := range []int{1, 10, 20} {
		repo := &provisioningRepo{collisions: count}
		service := &Service{repo: repo}
		_, err := service.provision(t.Context(), domain.ExternalIdentity{Email: strings.Repeat("a", 40) + "@ku.th"})
		if len(repo.names) != min(20, count+1) || errors.Is(err, domain.ErrUsernameTaken) != (count == 20) ||
			(count < 20 && err != nil) {
			t.Fatalf("collision count %d: got %d attempts, %v", count, len(repo.names), err)
		}
		for i, name := range repo.names {
			if len(name) != 30 {
				t.Fatalf("unexpected length: %q", name)
			}
			if i >= 10 && !regexp.MustCompile(`_[0-9a-f]{10}$`).MatchString(name) {
				t.Fatalf("random suffix missing: %q", name)
			}
		}
	}
	repo := &provisioningRepo{failure: errors.New("insert failed")}
	service := &Service{repo: repo}
	if _, err := service.provision(t.Context(), domain.ExternalIdentity{}); !errors.Is(err, repo.failure) || len(repo.names) != 1 {
		t.Fatalf("retried an unrelated error: %v", err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := service.provision(ctx, domain.ExternalIdentity{}); !errors.Is(err, context.Canceled) || len(repo.names) != 1 {
		t.Fatalf("retried after cancellation: %v", err)
	}
}
