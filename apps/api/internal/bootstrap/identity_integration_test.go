package bootstrap

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/thg1rb/ku-spot/apps/api/internal/config"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/database"
	platform "github.com/thg1rb/ku-spot/apps/api/internal/platform/http"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/numbering"
)

type provider struct {
	accounts map[string]domain.ExternalIdentity
}

func (p provider) AuthorizationURL(state, _, _ string) (string, error) {
	return "https://provider.example/?state=" + state, nil
}
func (p provider) Exchange(_ context.Context, code, verifier, nonce string) (domain.ExternalIdentity, error) {
	if account, ok := p.accounts[code]; ok && verifier != "" && nonce != "" {
		return account, nil
	}
	return domain.ExternalIdentity{}, application.ErrProviderIdentity
}

func testDatabase(t *testing.T) *database.Connection {
	t.Helper()
	db, _ := testDatabaseWithURL(t)
	return db
}

func testDatabaseWithURL(t *testing.T) (*database.Connection, string) {
	t.Helper()
	dsn := os.Getenv("KU_SPOT_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set KU_SPOT_TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx := context.Background()
	root, err := database.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	schema := "phase_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if err := root.DB(ctx).Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := root.DB(ctx).Exec("DROP SCHEMA " + schema + " CASCADE").Error; err != nil {
			t.Error(err)
		}
		if err := root.Close(); err != nil {
			t.Error(err)
		}
	})
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db, err := database.Open(u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	migrationContext, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	command := exec.CommandContext(migrationContext, "make", "migrate")
	command.Dir = "../../../.."
	command.Env = append(os.Environ(), "MIGRATION_DATABASE_URL="+u.String())
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("apply schema migrations: %v\n%s", err, strings.ReplaceAll(string(output), u.String(), "[database URL]"))
	}

	return db, u.String()
}

func TestUserAccessPostgres(t *testing.T) {
	db := testDatabase(t)
	ctx := t.Context()
	insertUser := func(t *testing.T, ctx context.Context, username string) string {
		t.Helper()
		var id string
		err := db.DB(ctx).Raw(`
			INSERT INTO users (auth_provider, provider_subject_id, username, real_name, email)
			VALUES ('GOOGLE', ?, ?, 'Test User', 'test@ku.th') RETURNING id`, username, username,
		).Scan(&id).Error
		if err != nil || id == "" {
			t.Fatalf("insert user: id=%q, error=%v", id, err)
		}
		return id
	}
	addRole := func(t *testing.T, ctx context.Context, id string, role domain.Role) {
		t.Helper()
		if err := db.DB(ctx).Exec(
			"INSERT INTO user_roles (user_id, role) VALUES (?, ?)", id, role,
		).Error; err != nil {
			t.Fatalf("insert role: %v", err)
		}
	}
	seedUser := func(t *testing.T, username string) string {
		t.Helper()
		var id string
		if err := db.WithTx(ctx, func(txCtx context.Context) error {
			id = insertUser(t, txCtx, username)
			addRole(t, txCtx, id, domain.Reporter)
			return nil
		}); err != nil {
			t.Fatalf("commit user and initial role: %v", err)
		}
		return id
	}
	deleteRoles := func(t *testing.T, ctx context.Context, id string) {
		t.Helper()
		result := db.DB(ctx).Exec("DELETE FROM user_roles WHERE user_id = ?", id)
		if result.Error != nil || result.RowsAffected != 1 {
			t.Fatalf("delete last role: rows=%d, error=%v", result.RowsAffected, result.Error)
		}
	}
	assertCheckViolation := func(t *testing.T, err error) {
		t.Helper()
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
			t.Fatalf("commit error = %v, want SQLSTATE 23514", err)
		}
	}

	t.Run("rejects a new user without roles at commit", func(t *testing.T) {
		err := db.WithTx(ctx, func(txCtx context.Context) error {
			insertUser(t, txCtx, "no_roles")
			return nil
		})
		assertCheckViolation(t, err)
	})
	t.Run("rejects deleting the last role at commit", func(t *testing.T) {
		id := seedUser(t, "remove_role")
		err := db.WithTx(ctx, func(txCtx context.Context) error {
			deleteRoles(t, txCtx, id)
			return nil
		})
		assertCheckViolation(t, err)
	})
	t.Run("cascades role deletion when deleting a user", func(t *testing.T) {
		id := seedUser(t, "delete_user")
		result := db.DB(ctx).Exec("DELETE FROM users WHERE id = ?", id)
		if result.Error != nil || result.RowsAffected != 1 {
			t.Fatalf("delete user: rows=%d, error=%v", result.RowsAffected, result.Error)
		}
		var count int64
		if err := db.DB(ctx).Table("user_roles").Where("user_id = ?", id).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("role count after cascade = %d, error = %v", count, err)
		}
	})
	t.Run("replaces the last role in one transaction", func(t *testing.T) {
		id := seedUser(t, "replace_role")
		if err := db.WithTx(ctx, func(txCtx context.Context) error {
			deleteRoles(t, txCtx, id)
			addRole(t, txCtx, id, domain.Reviewer)
			return nil
		}); err != nil {
			t.Fatalf("commit role replacement: %v", err)
		}
		var role domain.Role
		err := db.DB(ctx).Raw("SELECT role FROM user_roles WHERE user_id = ?", id).Scan(&role).Error
		if err != nil || role != domain.Reviewer {
			t.Fatalf("replacement role = %q, error = %v", role, err)
		}
	})
}

type response struct {
	*http.Response
	body []byte
}

func send(t *testing.T, app *fiber.App, method, path, body string, cookies ...*http.Cookie) response {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if method == http.MethodPatch || method == http.MethodPost {
		req.Header.Set("Origin", "http://localhost:3000")
	}
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := io.ReadAll(res.Body)
	if closeErr := res.Body.Close(); closeErr != nil {
		t.Error(closeErr)
	}
	if err != nil {
		t.Fatal(err)
	}
	return response{Response: res, body: raw}
}

func (r response) want(t *testing.T, status int, fragment string) {
	t.Helper()
	if r.StatusCode != status || !strings.Contains(string(r.body), fragment) {
		t.Fatalf("wanted %d and %q, got %d: %s", status, fragment, r.StatusCode, r.body)
	}
}

func login(t *testing.T, app *fiber.App, subject, next string) (response, *http.Cookie) {
	t.Helper()
	start := send(t, app, "GET", "/api/v1/auth/login?next="+url.QueryEscape(next), "")
	start.want(t, 302, "")
	target, err := url.Parse(start.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	res := send(t, app, "GET", "/api/v1/auth/callback?state="+target.Query().Get("state")+"&code="+subject, "", start.Cookies()...)
	res.want(t, 302, "")
	for _, cookie := range res.Cookies() {
		if cookie.Name == "ku_spot_session" {
			if !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode {
				t.Fatalf("unexpected cookie attributes: %v", cookie)
			}
			return res, cookie
		}
	}
	return res, nil
}

func account(email, subject string) domain.ExternalIdentity {
	return domain.ExternalIdentity{Provider: "GOOGLE", Email: email, SubjectID: subject, EmailVerified: true, HostedDomain: "ku.th", RealName: "Name"}
}

func me(t *testing.T, app *fiber.App, cookie *http.Cookie) (id, name string) {
	t.Helper()
	profile := send(t, app, "GET", "/api/v1/me", "", cookie)
	profile.want(t, 200, `"emailVerified":true`)
	if strings.Contains(string(profile.body), "providerSubjectId") {
		t.Fatal("subject exposed")
	}
	var data struct{ ID, Username string }
	if err := json.Unmarshal(profile.body, &data); err != nil {
		t.Fatal(err)
	}
	return data.ID, data.Username
}

func TestIdentityHTTPPostgres(t *testing.T) {
	db := testDatabase(t)
	app := platform.NewServer(nil, nil)
	settings := config.Auth{AppBaseURL: "http://localhost:3000", BootstrapAdminEmails: []string{"admin@ku.th", "otheradmin@ku.th"}}
	mock := provider{accounts: map[string]domain.ExternalIdentity{
		"admin": account("admin@ku.th", "admin"), "otheradmin": account("otheradmin@ku.th", "otheradmin"),
		"first": account("left@ku.th", "first"), "sameEmail": account("left@ku.th", "second"),
		"repeat": account("changed@ku.th", "first"),
	}}
	now := time.Date(2026, 11, 27, 1, 2, 3, 0, time.UTC)
	registerIdentity(app, db, settings, mock, func() time.Time { return now })
	for _, endpoint := range []string{"/me", "/admin/users", "/admin/audit-logs"} {
		res := send(t, app, "GET", "/api/v1"+endpoint, "")
		res.want(t, 401, `"code":"UNAUTHENTICATED"`)
		res.want(t, 401, `"requestId":"`+res.Header.Get("X-Request-Id")+`"`)
	}
	invalid := send(t, app, "GET", "/api/v1/auth/callback?state=wrong&code=first", "")
	if !strings.HasSuffix(invalid.Header.Get("Location"), "INVALID_OAUTH_STATE") {
		t.Fatal(invalid.Header.Get("Location"))
	}
	rejected, _ := login(t, app, "invalid", "")
	if !strings.HasSuffix(rejected.Header.Get("Location"), "INVALID_OAUTH_IDENTITY") {
		t.Fatal(rejected.Header.Get("Location"))
	}
	adminRedirect, admin := login(t, app, "admin", "")
	if admin == nil || adminRedirect.Header.Get("Location") != settings.AppBaseURL+"/admin" {
		t.Fatal("admin provisioning failed")
	}
	adminID, _ := me(t, app, admin)
	redirect, first := login(t, app, "first", "//example.com")
	if first == nil || redirect.Header.Get("Location") != settings.AppBaseURL+"/feed" {
		t.Fatal("login failed or returned an unsafe location")
	}
	if len(redirect.Cookies()) != 2 {
		t.Fatal("callback must clear state and set session")
	}
	firstID, firstName := me(t, app, first)
	_, second := login(t, app, "sameEmail", "/map")
	secondID, secondName := me(t, app, second)
	if firstID == secondID || firstName != "left" || secondName != "left_1" {
		t.Fatal("external account or username collision")
	}
	send(t, app, "PATCH", "/api/v1/me/username", `{"username":"LEFT_1"}`, first).want(t, 409, "USERNAME_TAKEN")
	send(t, app, "PATCH", "/api/v1/me/username", `{"username":" new_name "}`, first).want(t, 200, `"username":"new_name"`)
	repeatRedirect, repeat := login(t, app, "repeat", "/settings/profile")
	repeatID, repeatName := me(t, app, repeat)
	if repeatID != firstID || repeatName != "new_name" || repeatRedirect.Header.Get("Location") != settings.AppBaseURL+"/settings/profile" {
		t.Fatal("repeat login failed to preserve identity")
	}
	send(t, app, "GET", "/api/v1/me", "", repeat).want(t, 200, `"email":"changed@ku.th"`)
	send(t, app, "GET", "/api/v1/admin/users", "", first).want(t, 403, "FORBIDDEN")
	send(t, app, "GET", "/api/v1/admin/audit-logs", "", first).want(t, 403, "FORBIDDEN")
	send(t, app, "GET", "/api/v1/admin/users?q=changed&role=REPORTER&isActive=true&pageSize=50", "", admin).
		want(t, 200, `"totalItems":1`)
	send(t, app, "GET", "/api/v1/admin/departments", "", admin).want(t, 200, `"totalItems":5`)
	send(t, app, "PATCH", "/api/v1/admin/users/"+adminID, `{"isActive":false}`, admin).want(t, 409, "LAST_ACTIVE_ADMIN")
	send(t, app, "PATCH", "/api/v1/admin/users/"+firstID, `{"roles":["ADMINISTRATOR","REPORTER"]}`, admin).want(t, 422, "EXCLUSIVE_ADMIN_CONFLICT")
	send(t, app, "PATCH", "/api/v1/admin/users/"+firstID, `{"roles":["DEPARTMENT_STAFF"]}`, admin).want(t, 422, "DEPARTMENT_REQUIRED")
	send(t, app, "PATCH", "/api/v1/admin/users/"+firstID,
		`{"roles":["DEPARTMENT_STAFF"],"departmentId":"c9de655b-4f30-4fb6-8edf-000000000001"}`, admin).
		want(t, 200, `"roles":["DEPARTMENT_STAFF"]`)
	send(t, app, "POST", "/api/v1/auth/logout", "", second).want(t, 204, "")
	send(t, app, "GET", "/api/v1/me", "", second).want(t, 401, "UNAUTHENTICATED")
	send(t, app, "PATCH", "/api/v1/admin/users/"+firstID, `{"isActive":false}`, admin).want(t, 200, `"isActive":false`)
	for _, cookie := range []*http.Cookie{first, repeat} {
		send(t, app, "GET", "/api/v1/me", "", cookie).want(t, 401, "UNAUTHENTICATED")
	}
	inactive, _ := login(t, app, "first", "")
	if !strings.HasSuffix(inactive.Header.Get("Location"), "ACCOUNT_INACTIVE") {
		t.Fatal(inactive.Header.Get("Location"))
	}
	send(t, app, "GET", "/api/v1/admin/audit-logs?entityType=USER&action=MANAGE_USER&actorUserId="+adminID, "", admin).
		want(t, 200, `"totalItems":2`)
	send(t, app, "GET", "/api/v1/admin/audit-logs?action=LOGIN", "", admin).want(t, 200, `"createdAt":"2026-11-27T01:02:03Z"`)
	_, otherAdmin := login(t, app, "otheradmin", "")
	otherID, _ := me(t, app, otherAdmin)
	got := make(chan int, 2)
	var wg sync.WaitGroup
	for _, tc := range []struct {
		id     string
		cookie *http.Cookie
	}{{adminID, admin}, {otherID, otherAdmin}} {
		wg.Go(func() {
			req := httptest.NewRequest("PATCH", "/api/v1/admin/users/"+tc.id, strings.NewReader(`{"isActive":false}`))
			req.AddCookie(tc.cookie)
			req.Header.Set("Origin", settings.AppBaseURL)
			req.Header.Set("Content-Type", "application/json")
			res, err := app.Test(req)
			if err != nil {
				t.Error(err)
				return
			}
			defer func() {
				if err := res.Body.Close(); err != nil {
					t.Error(err)
				}
			}()
			got <- res.StatusCode
		})
	}
	wg.Wait()
	close(got)
	counts := map[int]int{}
	for status := range got {
		counts[status]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatalf("concurrent admin changes: %v", counts)
	}
	_, expiring := login(t, app, "sameEmail", "")
	expires := now.Add(application.SessionLifetime)
	if expiring == nil || !expiring.Expires.Equal(expires) {
		t.Fatalf("session expiry cookie: %v, wanted %v", expiring, expires)
	}
	now = expires.Add(-time.Microsecond)
	send(t, app, "GET", "/api/v1/me", "", expiring).want(t, 200, `"username":"left_1"`)
	now = expires
	send(t, app, "GET", "/api/v1/me", "", expiring).want(t, 401, "UNAUTHENTICATED")

}

func TestNumberingPostgres(t *testing.T) {
	db := testDatabase(t)
	ctx := context.Background()
	before := time.Date(2026, 12, 31, 16, 59, 59, 0, time.UTC)
	old, err := numbering.New(db, func() time.Time { return before })
	if err != nil {
		t.Fatal(err)
	}
	next, err := numbering.New(db, func() time.Time { return before.Add(time.Second) })
	if err != nil {
		t.Fatal(err)
	}
	rollback := errors.New("rollback")
	if err := db.WithTx(ctx, func(ctx context.Context) error {
		if _, err := old.NextNumber(ctx, "TKT"); err != nil {
			return err
		}
		return rollback
	}); !errors.Is(err, rollback) {
		t.Fatal(err)
	}
	if value, err := old.NextNumber(ctx, "TKT"); err != nil || value != "TKT-2026-00001" {
		t.Fatalf("%s: %v", value, err)
	}
	if value, err := next.NextNumber(ctx, "TKT"); err != nil || value != "TKT-2027-00001" {
		t.Fatalf("%s: %v", value, err)
	}
	var wg sync.WaitGroup
	const workers = 20
	numbers := make(chan string, workers)
	for range workers {
		wg.Go(func() {
			value, err := next.NextNumber(ctx, "RPT")
			if err != nil {
				t.Error(err)
				return
			}
			numbers <- value
		})
	}
	wg.Wait()
	close(numbers)
	seen := map[string]bool{}
	for value := range numbers {
		seen[value] = true
	}
	for i := 1; i <= workers; i++ {
		if value := fmt.Sprintf("RPT-2027-%05d", i); !seen[value] {
			t.Errorf("missing %s", value)
		}
	}
}
