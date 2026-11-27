package application

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"slices"
	"strings"
	"time"

	audit "github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
)

const SessionLifetime = 7 * 24 * time.Hour

var ErrProviderIdentity = errors.New("provider identity could not be verified")
var ErrProviderUnavailable = errors.New("authentication provider is unavailable")
var ErrProviderDenied = errors.New("authorization code was rejected")

type AuthProvider interface {
	AuthorizationURL(state, verifier, nonce string) (string, error)
	Exchange(ctx context.Context, code, verifier, nonce string) (domain.ExternalIdentity, error)
}

type UserFilter struct {
	Search   string
	Role     domain.Role
	IsActive *bool
}

type UserPatch struct {
	Roles        *[]domain.Role
	DepartmentID **string
	IsActive     *bool
}

type Repository interface {
	LockExternalIdentity(context.Context, domain.ExternalIdentity) error
	ByExternalIdentity(context.Context, domain.ExternalIdentity) (domain.User, error)
	InsertUser(context.Context, domain.ExternalIdentity, string, domain.Role) (domain.User, error)
	UpdateSnapshot(context.Context, string, domain.ExternalIdentity) error
	ByID(context.Context, string, bool) (domain.User, error)
	BySession(context.Context, string) (domain.User, error)
	InsertSession(context.Context, string, string, time.Time) error
	RevokeSession(context.Context, string) error
	RevokeUserSessions(context.Context, string) error
	UpdateUsername(context.Context, string, string) (domain.User, error)
	ListUsers(context.Context, UserFilter, pagination.Query) ([]domain.User, int64, error)
	ListDepartments(context.Context, pagination.Query) ([]domain.Department, int64, error)
	DepartmentActive(context.Context, string) (bool, error)
	LockAdminChanges(context.Context) error
	CountActiveAdmins(context.Context) (int64, error)
	UpdateAccess(context.Context, domain.User, domain.User, string) error
}

type Transaction interface {
	WithTx(context.Context, func(context.Context) error) error
}
type Auditor interface {
	Record(context.Context, audit.Entry) error
}

type Service struct {
	repo            Repository
	tx              Transaction
	audit           Auditor
	bootstrapEmails []string
	now             func() time.Time
}

func New(repo Repository, tx Transaction, auditor Auditor, emails []string, clock func() time.Time) *Service {
	return &Service{repo: repo, tx: tx, audit: auditor, bootstrapEmails: emails, now: clock}
}

func RandomToken() string {
	bytes := make([]byte, 32)
	_, _ = rand.Read(bytes)
	return base64.RawURLEncoding.EncodeToString(bytes)
}

func hashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

func (s *Service) HandleOAuthCallback(ctx context.Context, p AuthProvider, code, verifier, nonce string) (domain.User, string, error) {
	external, err := p.Exchange(ctx, code, verifier, nonce)
	if err != nil {
		return domain.User{}, "", err
	}
	if external.Provider == "" || external.SubjectID == "" || external.Email == "" {
		return domain.User{}, "", ErrProviderIdentity
	}
	return s.login(ctx, external)
}

func (s *Service) login(ctx context.Context, external domain.ExternalIdentity) (domain.User, string, error) {
	token := RandomToken()
	var user domain.User
	err := s.tx.WithTx(ctx, func(ctx context.Context) error {
		if err := s.repo.LockExternalIdentity(ctx, external); err != nil {
			return err
		}
		var err error
		user, err = s.repo.ByExternalIdentity(ctx, external)
		if errors.Is(err, apperror.NotFound) {
			user, err = s.provision(ctx, external)
		} else if err == nil {
			if !user.IsActive {
				return domain.ErrInactive
			}
			err = s.repo.UpdateSnapshot(ctx, user.ID, external)
			if err == nil {
				user, err = s.repo.ByID(ctx, user.ID, false)
			}
		}
		if err != nil {
			return err
		}
		if err := s.repo.InsertSession(ctx, user.ID, hashToken(token), s.now().Add(SessionLifetime)); err != nil {
			return err
		}
		return s.record(ctx, user, user.ID, "LOGIN", nil)
	})
	if err != nil {
		return domain.User{}, "", err
	}
	return user, token, nil
}

func (s *Service) provision(ctx context.Context, external domain.ExternalIdentity) (domain.User, error) {
	role := domain.Reporter
	if external.Provider == "GOOGLE" && slices.Contains(s.bootstrapEmails, strings.ToLower(external.Email)) {
		role = domain.Administrator
	}
	for attempt := 0; attempt < 10000; attempt++ {
		user, err := s.repo.InsertUser(ctx, external, domain.InitialUsername(external.Email, attempt), role)
		if !errors.Is(err, domain.ErrUsernameTaken) {
			return user, err
		}
	}
	return domain.User{}, domain.ErrUsernameTaken
}

func (s *Service) GetMe(ctx context.Context, token string) (domain.User, error) {
	if token == "" {
		return domain.User{}, apperror.Unauthenticated
	}
	u, err := s.repo.BySession(ctx, hashToken(token))
	if errors.Is(err, apperror.NotFound) {
		return domain.User{}, apperror.Unauthenticated
	}
	return u, err
}

func (s *Service) Logout(ctx context.Context, actor domain.User, token string) error {
	return s.tx.WithTx(ctx, func(ctx context.Context) error {
		if err := s.repo.RevokeSession(ctx, hashToken(token)); err != nil {
			return err
		}
		return s.record(ctx, actor, actor.ID, "LOGOUT", nil)
	})
}

func (s *Service) UpdateMyUsername(ctx context.Context, actor domain.User, input string) (domain.User, error) {
	name, err := domain.NormalizeUsername(input)
	if err != nil {
		return domain.User{}, err
	}
	var user domain.User
	err = s.tx.WithTx(ctx, func(ctx context.Context) error {
		before, err := s.repo.ByID(ctx, actor.ID, true)
		if err != nil {
			return err
		}
		if !before.IsActive {
			return apperror.Unauthenticated
		}
		if before.Username == name {
			user = before
			return nil
		}
		user, err = s.repo.UpdateUsername(ctx, before.ID, name)
		if err != nil {
			return err
		}
		return s.record(ctx, before, user.ID, "UPDATE_USERNAME", map[string]any{
			"before": before.Username, "after": user.Username,
		})
	})
	return user, err
}

func (s *Service) ListAdminUsers(ctx context.Context, actor domain.User, filter UserFilter, page pagination.Query) (pagination.Result[domain.User], error) {
	if !actor.IsExclusiveAdmin() {
		return pagination.Result[domain.User]{}, apperror.Forbidden
	}
	users, total, err := s.repo.ListUsers(ctx, filter, page)
	return pagination.New(page, users, total), err
}

func (s *Service) ListDepartments(ctx context.Context, actor domain.User, page pagination.Query) (pagination.Result[domain.Department], error) {
	if !actor.IsExclusiveAdmin() {
		return pagination.Result[domain.Department]{}, apperror.Forbidden
	}
	items, total, err := s.repo.ListDepartments(ctx, page)
	return pagination.New(page, items, total), err
}

func (s *Service) UpdateAdminUser(ctx context.Context, actor domain.User, id string, patch UserPatch) (domain.User, error) {
	if !actor.IsExclusiveAdmin() {
		return domain.User{}, apperror.Forbidden
	}
	var updated domain.User
	err := s.tx.WithTx(ctx, func(ctx context.Context) error {
		if err := s.repo.LockAdminChanges(ctx); err != nil {
			return err
		}
		currentActor, err := s.repo.ByID(ctx, actor.ID, false)
		if err != nil {
			return err
		}
		if !currentActor.IsExclusiveAdmin() {
			return apperror.Forbidden
		}
		target, err := s.repo.ByID(ctx, id, true)
		if err != nil {
			return err
		}
		updated = target
		if patch.Roles != nil {
			updated.Roles = slices.Clone(*patch.Roles)
			slices.Sort(updated.Roles)
		}
		if patch.DepartmentID != nil {
			updated.DepartmentID = *patch.DepartmentID
		}
		if patch.IsActive != nil {
			updated.IsActive = *patch.IsActive
		}
		if err := s.validateAccessChange(ctx, target, updated, patch.DepartmentID != nil); err != nil {
			return err
		}
		if err := s.repo.UpdateAccess(ctx, target, updated, currentActor.ID); err != nil {
			return err
		}
		if !updated.IsActive {
			if err := s.repo.RevokeUserSessions(ctx, id); err != nil {
				return err
			}
		}
		return s.record(ctx, currentActor, id, "MANAGE_USER", map[string]any{
			"before": accessSnapshot(target), "after": accessSnapshot(updated),
		})
	})
	return updated, err
}

func (s *Service) validateAccessChange(ctx context.Context, before, after domain.User, departmentSpecified bool) error {
	if err := domain.ValidateAccess(after.Roles, after.DepartmentID); err != nil {
		return err
	}
	if after.DepartmentID != nil && (departmentSpecified || (!before.IsActive && after.IsActive)) {
		active, err := s.repo.DepartmentActive(ctx, *after.DepartmentID)
		if err != nil {
			return err
		}
		if !active {
			return domain.ErrDepartmentUnavailable
		}
	}
	if !before.IsExclusiveAdmin() || after.IsExclusiveAdmin() {
		return nil
	}
	count, err := s.repo.CountActiveAdmins(ctx)
	if err != nil {
		return err
	}
	return domain.ProtectLastAdmin(before, after, count)
}

func accessSnapshot(u domain.User) map[string]any {
	return map[string]any{"roles": u.Roles, "departmentId": u.DepartmentID, "isActive": u.IsActive}
}

func (s *Service) record(ctx context.Context, actor domain.User, id, action string, details map[string]any) error {
	roles := make([]string, len(actor.Roles))
	for i, role := range actor.Roles {
		roles[i] = string(role)
	}
	return s.audit.Record(ctx, audit.Entry{
		EntityType: "USER", EntityID: id, Action: action, ActorType: "USER", ActorUserID: &actor.ID,
		ActorRoles: roles, DepartmentID: actor.DepartmentID, Details: details,
	})
}
