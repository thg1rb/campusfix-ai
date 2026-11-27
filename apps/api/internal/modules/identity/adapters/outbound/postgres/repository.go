package postgres

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/database"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
	"gorm.io/gorm"
)

type Repository struct{ db *database.Connection }

func New(db *database.Connection) *Repository { return &Repository{db: db} }

type userRow struct {
	ID, Username, RealName, Email, AuthProvider string
	EmailVerified, IsActive                     bool
	HostedDomain, AvatarURL, DepartmentID       *string
	CreatedAt                                   time.Time
	Roles                                       []domain.Role `gorm:"serializer:json"`
}

const userProjection = `u.id, u.username, u.real_name, u.email, u.auth_provider,
	u.email_verified, u.is_active, u.hosted_domain, u.avatar_url, u.department_id, u.created_at,
	COALESCE((SELECT jsonb_agg(role ORDER BY role) FROM user_roles WHERE user_id = u.id), '[]') AS roles`

func (row userRow) user() domain.User {
	return domain.User{
		ID: row.ID, Username: row.Username, RealName: row.RealName, Email: row.Email, AuthProvider: row.AuthProvider,
		EmailVerified: row.EmailVerified, IsActive: row.IsActive, HostedDomain: row.HostedDomain, AvatarURL: row.AvatarURL,
		DepartmentID: row.DepartmentID, CreatedAt: row.CreatedAt.UTC(), Roles: row.Roles,
	}
}

func findUser(query *gorm.DB) (domain.User, error) {
	var row userRow
	err := query.Select(userProjection).Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.User{}, apperror.NotFound
	}
	return row.user(), err
}

func (r *Repository) LockExternalIdentity(ctx context.Context, identity domain.ExternalIdentity) error {
	return r.db.DB(ctx).Exec(`SELECT pg_advisory_xact_lock(1, hashtext(?))`,
		identity.Provider+":"+identity.SubjectID).Error
}

func (r *Repository) ByExternalIdentity(ctx context.Context, identity domain.ExternalIdentity) (domain.User, error) {
	query := r.db.DB(ctx).Table("users AS u").
		Where("u.auth_provider = ? AND u.provider_subject_id = ?", identity.Provider, identity.SubjectID)
	var id string
	err := query.Select("u.id").Scan(&id).Error
	if err != nil {
		return domain.User{}, err
	}
	if id == "" {
		return domain.User{}, apperror.NotFound
	}
	return r.ByID(ctx, id, true)
}

func (r *Repository) ByID(ctx context.Context, id string, lock bool) (domain.User, error) {
	db := r.db.DB(ctx)
	if lock {
		var found string
		result := db.Raw("SELECT id FROM users WHERE id = ? FOR UPDATE", id).Scan(&found)
		if result.Error != nil {
			return domain.User{}, result.Error
		}
		if result.RowsAffected == 0 {
			return domain.User{}, apperror.NotFound
		}
	}
	return findUser(db.Table("users AS u").Where("u.id = ?", id))
}

func (r *Repository) InsertUser(ctx context.Context, i domain.ExternalIdentity, username string, role domain.Role) (domain.User, error) {
	db := r.db.DB(ctx)
	var id string
	result := db.Raw(`
		INSERT INTO users (auth_provider, provider_subject_id, username, real_name, email,
			email_verified, hosted_domain, avatar_url)
		VALUES (?, ?, ?, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''))
		ON CONFLICT (lower(username)) DO NOTHING RETURNING id`,
		i.Provider, i.SubjectID, username, i.RealName, i.Email, i.EmailVerified, i.HostedDomain, i.AvatarURL).Scan(&id)
	if result.Error != nil {
		return domain.User{}, result.Error
	}
	if result.RowsAffected == 0 {
		return domain.User{}, domain.ErrUsernameTaken
	}
	if err := db.Exec("INSERT INTO user_roles (user_id, role) VALUES (?, ?)", id, role).Error; err != nil {
		return domain.User{}, err
	}
	return r.ByID(ctx, id, false)
}

func (r *Repository) UpdateSnapshot(ctx context.Context, id string, i domain.ExternalIdentity) error {
	return r.db.DB(ctx).Exec(`
		UPDATE users SET real_name = ?, email = ?, email_verified = ?, hosted_domain = NULLIF(?, ''),
			avatar_url = NULLIF(?, ''), updated_at = now() WHERE id = ?`,
		i.RealName, i.Email, i.EmailVerified, i.HostedDomain, i.AvatarURL, id).Error
}

func (r *Repository) BySession(ctx context.Context, hash string, now time.Time) (domain.User, error) {
	return findUser(r.db.DB(ctx).Table("users AS u").
		Joins("JOIN sessions s ON s.user_id = u.id").
		Where("s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.is_active", hash, now))
}

func (r *Repository) InsertSession(ctx context.Context, id, hash string, expires time.Time) error {
	return r.db.DB(ctx).Exec("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)", id, hash, expires).Error
}

func (r *Repository) RevokeSession(ctx context.Context, hash string) error {
	return r.db.DB(ctx).Exec("UPDATE sessions SET revoked_at = now() WHERE token_hash = ? AND revoked_at IS NULL", hash).Error
}

func (r *Repository) RevokeUserSessions(ctx context.Context, id string) error {
	return r.db.DB(ctx).Exec("UPDATE sessions SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL", id).Error
}

func (r *Repository) UpdateUsername(ctx context.Context, id, name string) (domain.User, error) {
	err := r.db.DB(ctx).Exec("UPDATE users SET username = ?, updated_at = now() WHERE id = ?", name, id).Error
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "users_username_key" {
		return domain.User{}, domain.ErrUsernameTaken
	}
	if err != nil {
		return domain.User{}, err
	}
	return r.ByID(ctx, id, false)
}

func (r *Repository) ListUsers(ctx context.Context, f application.UserFilter, p pagination.Query) ([]domain.User, int64, error) {
	query := r.db.DB(ctx).Table("users AS u")
	if f.Search != "" {
		escaped := strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(f.Search)
		pattern := "%" + escaped + "%"
		query = query.Where("(u.username ILIKE ? OR u.real_name ILIKE ? OR u.email ILIKE ?)", pattern, pattern, pattern)
	}
	if f.Role != "" {
		query = query.Where("EXISTS (SELECT 1 FROM user_roles WHERE user_id = u.id AND role = ?)", f.Role)
	}
	if f.IsActive != nil {
		query = query.Where("u.is_active = ?", *f.IsActive)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []userRow
	if err := query.Select(userProjection).Order("lower(u.username), u.id").Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	users := make([]domain.User, 0, len(rows))
	for _, row := range rows {
		users = append(users, row.user())
	}
	return users, total, nil
}

func (r *Repository) ListDepartments(ctx context.Context, p pagination.Query) ([]domain.Department, int64, error) {
	query := r.db.DB(ctx).Table("departments")
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	type departmentRow struct {
		ID, Name, ResponsibilityScope string
		IsActive                      bool
	}
	var rows []departmentRow
	if err := query.Select("id, name, responsibility_scope, is_active").
		Order("lower(name), id").Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	items := make([]domain.Department, 0, len(rows))
	for _, row := range rows {
		items = append(items, domain.Department(row))
	}
	return items, total, nil
}

func (r *Repository) DepartmentActive(ctx context.Context, id string) (bool, error) {
	var active bool
	err := r.db.DB(ctx).Raw("SELECT is_active FROM departments WHERE id = ? FOR SHARE", id).Scan(&active).Error
	return active, err
}

func (r *Repository) LockAdminChanges(ctx context.Context) error {
	return r.db.DB(ctx).Exec("SELECT pg_advisory_xact_lock(2, 0)").Error
}

func (r *Repository) CountActiveAdmins(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.DB(ctx).Raw(`
		SELECT count(*) FROM users u JOIN user_roles r ON r.user_id = u.id
		WHERE u.is_active AND r.role = 'ADMINISTRATOR'`).Scan(&count).Error
	return count, err
}

func (r *Repository) UpdateAccess(ctx context.Context, before, after domain.User, actorID string) error {
	db := r.db.DB(ctx)
	if err := db.Exec("UPDATE users SET department_id = ?, is_active = ?, updated_at = now() WHERE id = ?",
		after.DepartmentID, after.IsActive, after.ID).Error; err != nil {
		return err
	}
	for _, role := range before.Roles {
		if !slices.Contains(after.Roles, role) {
			if err := db.Exec("DELETE FROM user_roles WHERE user_id = ? AND role = ?", before.ID, role).Error; err != nil {
				return err
			}
		}
	}
	for _, role := range after.Roles {
		if !slices.Contains(before.Roles, role) {
			if err := db.Exec("INSERT INTO user_roles (user_id, role, assigned_by) VALUES (?, ?, ?)",
				after.ID, role, actorID).Error; err != nil {
				return err
			}
		}
	}
	return nil
}
