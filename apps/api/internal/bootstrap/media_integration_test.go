package bootstrap

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/png"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/thg1rb/ku-spot/apps/api/internal/adapters/storage"
	"github.com/thg1rb/ku-spot/apps/api/internal/config"
	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	mediaDB "github.com/thg1rb/ku-spot/apps/api/internal/modules/media/adapters/outbound/postgres"
	media "github.com/thg1rb/ku-spot/apps/api/internal/modules/media/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/media/domain"
	platform "github.com/thg1rb/ku-spot/apps/api/internal/platform/http"
)

const imagePath = "/api/v1/media/report-images"

type failDeleteStore struct {
	*storage.MemoryStore
	fail bool
}

func (s *failDeleteStore) Delete(ctx context.Context, key string) error {
	if s.fail {
		return errors.New("test object deletion unavailable")
	}
	return s.MemoryStore.Delete(ctx, key)
}

func mediaUpload(t *testing.T, app *fiber.App, cookie *http.Cookie, origin string, data []byte) response {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	file, err := writer.CreateFormFile("file", "test.jpg")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, imagePath, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Origin", origin)
	if cookie != nil {
		req.AddCookie(cookie)
	}
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return response{Response: res, body: raw}
}

func TestMediaMigrationPostgres(t *testing.T) {
	db, dsn := testDatabaseWithURL(t)
	for _, direction := range []string{"down", "up"} {
		ctx, cancel := context.WithTimeout(t.Context(), 3*time.Minute)
		command := exec.CommandContext(ctx, "go", "run", "github.com/pressly/goose/v3/cmd/goose@v3.30.1", "-dir", "migrations", direction)
		command.Dir = "../.."
		command.Env = append(os.Environ(), "GOOSE_DRIVER=postgres", "GOOSE_DBSTRING="+dsn)
		output, err := command.CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("goose %s: %v\n%s", direction, err, strings.ReplaceAll(string(output), dsn, "[database URL]"))
		}
		if got := db.DB(t.Context()).Migrator().HasTable("report_images"); got != (direction == "up") {
			t.Errorf("report_images exists after %s: %t", direction, got)
		}
		if db.DB(t.Context()).Migrator().HasTable("reports") {
			t.Fatal("Phase 3 created a reports table")
		}
	}
}

func TestMediaHTTPPostgres(t *testing.T) {
	db := testDatabase(t)
	ctx := t.Context()
	now := time.Date(2026, 11, 28, 7, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	settings := config.Auth{AppBaseURL: "http://localhost:3000", BootstrapAdminEmails: []string{"admin@ku.th"}}
	app := platform.NewServer(nil, nil)
	handler, sessions := registerIdentity(app, db, settings, provider{accounts: map[string]identity.ExternalIdentity{
		"owner": account("owner@ku.th", "owner"),
		"other": account("other@ku.th", "other"),
		"admin": account("admin@ku.th", "admin"),
	}}, clock)
	objects := &failDeleteStore{MemoryStore: storage.NewMemory()}
	service := registerMedia(app, db, handler, objects, clock)
	repo := mediaDB.New(db)
	_, owner := login(t, app, "owner", "/")
	_, other := login(t, app, "other", "/")
	_, admin := login(t, app, "admin", "/")
	ownerID, _ := me(t, app, owner)
	otherID, _ := me(t, app, other)

	var original bytes.Buffer
	if err := png.Encode(&original, image.NewNRGBA(image.Rect(0, 0, 3, 2))); err != nil {
		t.Fatal(err)
	}
	upload := func(raw []byte) domain.ReportImage {
		t.Helper()
		res := mediaUpload(t, app, owner, settings.AppBaseURL, raw)
		res.want(t, 201, "image/png")
		var data struct {
			ImageID, FileName, MIMEType, PreviewURL string
			SizeBytes                               int
			ExpiresAt                               time.Time
		}
		if err := json.Unmarshal(res.body, &data); err != nil {
			t.Fatal(err)
		}
		img, err := repo.ByID(ctx, data.ImageID)
		if err != nil {
			t.Fatal(err)
		}
		if img.ReportID != nil || !img.EXIFStripped || img.UploadedBy != ownerID ||
			!data.ExpiresAt.Equal(now.Add(domain.StageLifetime)) || img.ExpiresAt == nil ||
			!data.ExpiresAt.Equal(*img.ExpiresAt) || data.SizeBytes != img.SizeBytes ||
			data.FileName != "test.png" || data.PreviewURL != imagePath+"/"+img.ID {
			t.Fatalf("wrong staged response: %+v row %+v", data, img)
		}
		return img
	}

	for _, tc := range []struct {
		name   string
		cookie *http.Cookie
		origin string
		data   []byte
		status int
		code   string
	}{
		{"guest", nil, settings.AppBaseURL, original.Bytes(), 401, "UNAUTHENTICATED"},
		{"admin", admin, settings.AppBaseURL, original.Bytes(), 403, "ADMIN_NON_OPERATIONAL"},
		{"origin", owner, "https://example.test", original.Bytes(), 403, "FORBIDDEN"},
		{"spoofed", owner, settings.AppBaseURL, []byte("<svg/>"), 400, "INVALID_MEDIA_FORMAT"},
		{"corrupt", owner, settings.AppBaseURL, original.Bytes()[:9], 400, "INVALID_MEDIA_FORMAT"},
		{"oversized", owner, settings.AppBaseURL, make([]byte, domain.MaxImageBytes+1), 400, "MEDIA_TOO_LARGE"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mediaUpload(t, app, tc.cookie, tc.origin, tc.data).want(t, tc.status, tc.code)
		})
	}

	expiring := upload(original.Bytes())
	bound := upload(original.Bytes())
	retained := upload(original.Bytes())
	preview := imagePath + "/" + expiring.ID
	res := send(t, app, http.MethodGet, preview, "", owner)
	res.want(t, 200, "PNG")
	mediaType, disposition, err := mime.ParseMediaType(res.Header.Get("Content-Disposition"))
	if err != nil || mediaType != "inline" || disposition["filename"] != expiring.FileName ||
		res.Header.Get("Content-Type") != domain.MIMEPNG || res.Header.Get("X-Content-Type-Options") != "nosniff" ||
		res.Header.Get("Cache-Control") != "private, no-store" || len(res.body) != expiring.SizeBytes {
		t.Fatalf("invalid image response: %v", res.Header)
	}
	if _, err := png.Decode(bytes.NewReader(res.body)); err != nil {
		t.Fatal(err)
	}
	send(t, app, http.MethodGet, preview, "").want(t, 404, "NOT_FOUND")
	send(t, app, http.MethodGet, preview, "", other).want(t, 404, "NOT_FOUND")
	send(t, app, http.MethodGet, preview, "", admin).want(t, 404, "NOT_FOUND")
	send(t, app, http.MethodGet, imagePath+"/invalid", "", owner).want(t, 400, "INVALID_REQUEST")
	send(t, app, http.MethodGet, imagePath+"/"+uuid.NewString(), "", owner).want(t, 404, "NOT_FOUND")

	reportID := uuid.NewString()
	if _, err := service.BindToReport(ctx, otherID, reportID, []string{bound.ID}); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("wrong owner: %v", err)
	}
	if _, err := service.BindToReport(ctx, ownerID, reportID, []string{bound.ID, strings.ToUpper(bound.ID)}); !errors.Is(err, domain.ErrInvalidBinding) {
		t.Fatalf("duplicate IDs: %v", err)
	}
	forceRollback := errors.New("force rollback")
	if err := db.WithTx(ctx, func(tx context.Context) error {
		if _, err := service.BindToReport(tx, ownerID, reportID, []string{bound.ID, retained.ID}); err != nil {
			return err
		}
		return forceRollback
	}); !errors.Is(err, forceRollback) {
		t.Fatalf("binding in outer transaction: %v", err)
	}
	if img, err := repo.ByID(ctx, bound.ID); err != nil || img.ReportID != nil {
		t.Fatalf("outer rollback did not revert binding: %+v %v", img, err)
	}
	if _, err := service.BindToReport(ctx, ownerID, reportID, []string{bound.ID, retained.ID}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.BindToReport(ctx, ownerID, uuid.NewString(), []string{bound.ID}); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("cross-report binding: %v", err)
	}
	detached, err := service.BindToReport(ctx, ownerID, reportID, []string{retained.ID})
	if err != nil || len(detached) != 1 || detached[0] != bound.StorageKey {
		t.Fatalf("detachment: %v %v", detached, err)
	}
	if _, err := repo.ByID(ctx, bound.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("detached row survived: %v", err)
	}
	if _, err := objects.Get(ctx, bound.StorageKey); err != nil {
		t.Fatalf("caller must be able to delete detached object after commit: %v", err)
	}
	if err := objects.Delete(ctx, bound.StorageKey); err != nil {
		t.Fatal(err)
	}
	if img, err := repo.ByID(ctx, retained.ID); err != nil || img.ReportID == nil ||
		*img.ReportID != reportID || img.ExpiresAt != nil || img.SortOrder != 0 {
		t.Fatalf("retained attachment: %+v %v", img, err)
	}
	send(t, app, http.MethodGet, imagePath+"/"+retained.ID, "", owner).want(t, 404, "NOT_FOUND")

	now = now.Add(domain.StageLifetime)
	var large bytes.Buffer
	encoder := png.Encoder{CompressionLevel: png.NoCompression}
	if err := encoder.Encode(&large, image.NewGray(image.Rect(0, 0, 2700, 2200))); err != nil {
		t.Fatal(err)
	}
	if large.Len() <= 5<<20 || large.Len() > domain.MaxImageBytes {
		t.Fatalf("large fixture size %d", large.Len())
	}
	fresh := upload(large.Bytes())
	if fresh.SizeBytes >= large.Len() {
		t.Fatal("size_bytes should reflect the re-encoded image")
	}
	send(t, app, http.MethodGet, preview, "", owner).want(t, 404, "NOT_FOUND")
	if _, err := service.BindToReport(ctx, ownerID, reportID, []string{expiring.ID}); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("bind at expiry boundary: %v", err)
	}
	objects.fail = true
	if count, err := service.PurgeExpiredStagedImages(ctx); count != 0 || err == nil {
		t.Fatalf("cleanup failure must roll back: %d %v", count, err)
	}
	if _, err := repo.ByID(ctx, expiring.ID); err != nil {
		t.Fatal(err)
	}
	objects.fail = false
	if count, err := service.PurgeExpiredStagedImages(ctx); count != 1 || err != nil {
		t.Fatalf("cleanup retry: %d %v", count, err)
	}
	if _, err := repo.ByID(ctx, expiring.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatal("expired row survived", err)
	}
	if _, err := objects.Get(ctx, expiring.StorageKey); !errors.Is(err, media.ErrObjectNotFound) {
		t.Fatal("expired object survived", err)
	}
	for _, img := range []domain.ReportImage{fresh, retained} {
		if _, err := repo.ByID(ctx, img.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := objects.Get(ctx, img.StorageKey); err != nil {
			t.Fatal(err)
		}
	}

	for _, tc := range []struct {
		token   string
		expires time.Time
		revoked *time.Time
	}{
		{"expired", now, nil},
		{"old-revoked", now.Add(time.Hour), &expiring.CreatedAt},
		{"recent-revoked", now.Add(time.Hour), &now},
	} {
		err := db.DB(ctx).Exec("INSERT INTO sessions (token_hash, user_id, expires_at, revoked_at) VALUES (?, ?, ?, ?)",
			tc.token, ownerID, tc.expires, tc.revoked).Error
		if err != nil {
			t.Fatal(err)
		}
	}
	if count, err := sessions.PurgeExpiredSessions(ctx); count != 2 || err != nil {
		t.Fatalf("session cleanup: %d %v", count, err)
	}
	var recent int64
	if err := db.DB(ctx).Table("sessions").Where("token_hash = ?", "recent-revoked").Count(&recent).Error; err != nil || recent != 1 {
		t.Fatalf("recent revoked session should remain: %d %v", recent, err)
	}
	me(t, app, owner)
}
