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
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
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
	migrations, err := filepath.Glob("../../migrations/*_platform_identity.sql")
	if err != nil || len(migrations) != 1 {
		t.Fatalf("migration: %v, %v", migrations, err)
	}
	data, err := os.ReadFile(migrations[0])
	if err != nil {
		t.Fatal(err)
	}
	up, _, _ := strings.Cut(string(data), "-- +goose Down")
	if err := db.DB(ctx).Exec(up).Error; err != nil {
		t.Fatal(err)
	}
	return db
}

type response struct {
	*http.Response
	body []byte
}

func send(t *testing.T, app *fiber.App, method, path, body string, cookies ...*http.Cookie) response {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
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
	registerIdentity(app, db, settings, mock)
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
