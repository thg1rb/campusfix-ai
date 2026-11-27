package domain

import (
	"errors"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

type Role string

const (
	Reporter      Role = "REPORTER"
	Reviewer      Role = "REVIEWER"
	Staff         Role = "DEPARTMENT_STAFF"
	Administrator Role = "ADMINISTRATOR"
)

var (
	ErrUsername              = errors.New("use 3–30 letters, digits or underscores")
	ErrRoles                 = errors.New("provide at least one valid, distinct role")
	ErrExclusiveAdmin        = errors.New("administrator must be the only role and have no department")
	ErrDepartmentRequired    = errors.New("department staff must have a department")
	ErrSingleDepartment      = errors.New("only department staff can belong to a department")
	ErrLastAdmin             = errors.New("at least one active administrator must remain")
	ErrUsernameTaken         = errors.New("username is already taken")
	ErrInactive              = errors.New("account is inactive")
	ErrDepartmentUnavailable = errors.New("department does not exist or is inactive")
)

type User struct {
	ID            string
	Username      string
	RealName      string
	Email         string
	EmailVerified bool
	HostedDomain  *string
	AvatarURL     *string
	AuthProvider  string
	Roles         []Role
	DepartmentID  *string
	IsActive      bool
	CreatedAt     time.Time
}

type ExternalIdentity struct {
	Provider      string
	SubjectID     string
	Email         string
	EmailVerified bool
	HostedDomain  string
	RealName      string
	AvatarURL     string
}

type Department struct {
	ID                  string `json:"id"`
	Name                string `json:"name"`
	ResponsibilityScope string `json:"responsibilityScope"`
	IsActive            bool   `json:"isActive"`
}

func ValidRole(role Role) bool {
	switch role {
	case Reporter, Reviewer, Staff, Administrator:
		return true
	}
	return false
}

func (u User) IsExclusiveAdmin() bool {
	return u.IsActive && len(u.Roles) == 1 && u.Roles[0] == Administrator && u.DepartmentID == nil
}

func ValidateAccess(roles []Role, departmentID *string) error {
	if slices.Contains(roles, Administrator) && (len(roles) != 1 || departmentID != nil) {
		return ErrExclusiveAdmin
	}
	if len(roles) == 0 {
		return ErrRoles
	}
	seen := make(map[Role]bool, len(roles))
	for _, role := range roles {
		if !ValidRole(role) || seen[role] {
			return ErrRoles
		}
		seen[role] = true
	}
	switch {
	case seen[Staff] && departmentID == nil:
		return ErrDepartmentRequired
	case !seen[Staff] && departmentID != nil:
		return ErrSingleDepartment
	}
	return nil
}

func ProtectLastAdmin(before, after User, activeAdmins int64) error {
	if before.IsExclusiveAdmin() && !after.IsExclusiveAdmin() && activeAdmins <= 1 {
		return ErrLastAdmin
	}
	return nil
}

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_]{3,30}$`)
var usernameUnsafe = regexp.MustCompile(`[^A-Za-z0-9_]+`)

func NormalizeUsername(input string) (string, error) {
	name := strings.TrimSpace(input)
	if !usernamePattern.MatchString(name) {
		return "", ErrUsername
	}
	return name, nil
}

func InitialUsername(email string, attempt int) string {
	prefix, _, _ := strings.Cut(strings.ToLower(email), "@")
	base := strings.Trim(usernameUnsafe.ReplaceAllString(prefix, "_"), "_")
	if len(base) < 3 {
		base = "user_" + base
	}
	suffix := ""
	if attempt > 0 {
		suffix = "_" + strconv.Itoa(attempt)
	}
	return base[:min(len(base), 30-len(suffix))] + suffix
}
