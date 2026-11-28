package bootstrap

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/thg1rb/ku-spot/apps/api/internal/adapters/storage"
	"github.com/thg1rb/ku-spot/apps/api/internal/config"
	audit "github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/domain"
	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	mediaDB "github.com/thg1rb/ku-spot/apps/api/internal/modules/media/adapters/outbound/postgres"
	media "github.com/thg1rb/ku-spot/apps/api/internal/modules/media/domain"
	reportDomain "github.com/thg1rb/ku-spot/apps/api/internal/modules/reports/domain"
	platform "github.com/thg1rb/ku-spot/apps/api/internal/platform/http"
)

type reportResponse struct {
	ID, Status, Description string
	ReportNumber            *string
	Version                 int
	Images                  []struct {
		ID, PreviewURL string
		SortOrder      int
	}
	CancelledAt *time.Time
}

func readReport(t *testing.T, res response, status int, state string) reportResponse {
	t.Helper()
	res.want(t, status, state)
	var report reportResponse
	if err := json.Unmarshal(res.body, &report); err != nil || report.ID == "" || report.Status != state {
		t.Fatalf("invalid response: %s (%v)", res.body, err)
	}
	return report
}

type failingReportAudit struct {
	fail     bool
	recorder interface {
		Record(context.Context, audit.Entry) error
	}
}

func (a *failingReportAudit) Record(ctx context.Context, e audit.Entry) error {
	if a.fail {
		return errors.New("forced audit failure")
	}
	return a.recorder.Record(ctx, e)
}

func TestReportsLifecyclePostgres(t *testing.T) {
	db := testDatabase(t)
	ctx := t.Context()
	now := time.Date(2026, 12, 31, 18, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	app := platform.NewServer(nil, nil)
	origin := "http://localhost:3000"
	settings := config.Auth{AppBaseURL: origin, BootstrapAdminEmails: []string{"admin@ku.th"}}
	auth, _, locations, recorder := registerIdentity(app, db, settings, provider{accounts: map[string]identity.ExternalIdentity{
		"owner": account("owner@ku.th", "owner"), "other": account("other@ku.th", "other"),
		"reviewer": account("reviewer@ku.th", "reviewer"), "admin": account("admin@ku.th", "admin"),
	}}, clock)
	objects := storage.NewMemory()
	audits := &failingReportAudit{recorder: recorder}
	_, service, err := registerReports(app, db, auth, objects, locations, audits, clock)
	if err != nil {
		t.Fatal(err)
	}
	_, owner := login(t, app, "owner", "/")
	_, other := login(t, app, "other", "/")
	_, reviewer := login(t, app, "reviewer", "/")
	_, admin := login(t, app, "admin", "/")
	ownerID, _ := me(t, app, owner)
	reviewerID, _ := me(t, app, reviewer)
	exec := func(statement string, args ...any) {
		t.Helper()
		if err := db.DB(ctx).Exec(statement, args...).Error; err != nil {
			t.Fatal(err)
		}
	}
	exec("UPDATE user_roles SET role = 'REVIEWER' WHERE user_id = ?", reviewerID)

	const reports = "/api/v1/reports"
	const drafts = reports + "/drafts"
	const list = "/api/v1/my-reports"
	const images = "/api/v1/media/report-images"
	const fields = `"description":" Walkway broken ","locationName":" Campus Gate ","lat":13.85,"lng":100.56`
	send(t, app, "GET", list, "").want(t, 401, "UNAUTHENTICATED")
	send(t, app, "POST", drafts, `{}`, admin).want(t, 403, "ADMIN_NON_OPERATIONAL")
	send(t, app, "POST", drafts, `{}`, reviewer).want(t, 403, "FORBIDDEN")
	send(t, app, "POST", drafts, "", owner).want(t, 415, "UNSUPPORTED_MEDIA_TYPE")
	send(t, app, "POST", drafts, `{"unexpected":1}`, owner).want(t, 400, "INVALID_REQUEST")
	send(t, app, "POST", drafts, `{"imageIds":["bad"]}`, owner).want(t, 400, "INVALID_REQUEST")
	req := httptest.NewRequest("POST", drafts, strings.NewReader("{}"))
	req.AddCookie(owner)
	req.Header.Set("Origin", "https://other.example")
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = res.Body.Close()
	if res.StatusCode != 403 {
		t.Fatalf("origin status %d", res.StatusCode)
	}
	send(t, app, "POST", reports, `{`+fields+`,"imageIds":[]}`, owner).want(t, 422, "VALIDATION_ERROR")
	send(t, app, "POST", drafts, `{"imageIds":["`+uuid.NewString()+`"]}`, owner).want(t, 422, "VALIDATION_ERROR")
	locationID := uuid.NewString()
	exec("INSERT INTO campus_locations (id,name,type,lat,lng,is_active) VALUES (?, 'Unavailable Gate', 'BUILDING', 13.85,100.56,false)", locationID)
	send(t, app, "POST", drafts, `{"locationId":"`+locationID+`"}`, owner).want(t, 422, "LOCATION_UNAVAILABLE")

	var fixture bytes.Buffer
	if err := png.Encode(&fixture, image.NewNRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	repository := mediaDB.New(db)
	upload := func(cookie *http.Cookie) media.ReportImage {
		t.Helper()
		result := mediaUpload(t, app, cookie, origin, fixture.Bytes())
		result.want(t, 201, "imageId")
		var data struct{ ImageID string }
		if err := json.Unmarshal(result.body, &data); err != nil {
			t.Fatal(err)
		}
		img, err := repository.ByID(ctx, data.ImageID)
		if err != nil {
			t.Fatal(err)
		}
		return img
	}
	first, second, foreign := upload(owner), upload(owner), upload(other)
	send(t, app, "POST", drafts, fmt.Sprintf(`{"imageIds":[%q]}`, foreign.ID), owner).want(t, 403, "FORBIDDEN")
	draft := readReport(t, send(t, app, "POST", drafts, fmt.Sprintf(`{"imageIds":[%q,%q]}`, first.ID, second.ID), owner), 201, "DRAFT")
	path := reports + "/" + draft.ID
	if draft.ReportNumber != nil || len(draft.Images) != 2 || draft.Images[1].ID != second.ID || draft.Images[1].SortOrder != 1 {
		t.Fatalf("invalid draft attachments: %+v", draft)
	}
	send(t, app, "GET", images+"/"+first.ID, "", owner).want(t, 200, "PNG")
	send(t, app, "GET", images+"/"+first.ID, "", reviewer).want(t, 404, "NOT_FOUND")
	send(t, app, "GET", path, "", other).want(t, 404, "NOT_FOUND")
	send(t, app, "GET", path, "", admin).want(t, 403, "ADMIN_NON_OPERATIONAL")
	send(t, app, "POST", path+"/cancel", "{}", owner).want(t, 409, "TRANSITION_FORBIDDEN")

	patch := fmt.Sprintf(`{%s,"imageIds":[%q]}`, fields, second.ID)
	audits.fail = true
	send(t, app, "PATCH", path+"/draft", patch, owner).want(t, 500, "INTERNAL_ERROR")
	audits.fail = false
	if img, err := repository.ByID(ctx, first.ID); err != nil || img.ReportID == nil || *img.ReportID != draft.ID {
		t.Fatalf("rollback lost attachment: %+v %v", img, err)
	}
	if _, err := objects.Get(ctx, first.StorageKey); err != nil {
		t.Fatal(err)
	}
	draft = readReport(t, send(t, app, "PATCH", path+"/draft", patch, owner), 200, "DRAFT")
	if len(draft.Images) != 1 || draft.Images[0].ID != second.ID || draft.Description != "Walkway broken" {
		t.Fatalf("draft patch: %+v", draft)
	}
	if _, err := objects.Get(ctx, first.StorageKey); !errors.Is(err, storage.ErrObjectNotFound) {
		t.Fatalf("detached object: %v", err)
	}

	submitted := readReport(t, send(t, app, "POST", path+"/submit", "{}", owner), 200, "PENDING_REVIEW")
	if submitted.ReportNumber == nil || !regexp.MustCompile(`^RPT-2027-[0-9]{5}$`).MatchString(*submitted.ReportNumber) || submitted.Version != 1 {
		t.Fatalf("submit: %+v", submitted)
	}
	send(t, app, "POST", path+"/submit", "{}", owner).want(t, 409, "TRANSITION_FORBIDDEN")
	for _, viewer := range []*http.Cookie{owner, reviewer} {
		send(t, app, "GET", images+"/"+second.ID, "", viewer).want(t, 200, "PNG")
		view := readReport(t, send(t, app, "GET", path, "", viewer), 200, "PENDING_REVIEW")
		if len(view.Images) != 1 || view.Images[0].PreviewURL != images+"/"+second.ID {
			t.Fatalf("detail: %+v", view)
		}
	}
	send(t, app, "GET", images+"/"+second.ID, "", other).want(t, 404, "NOT_FOUND")
	send(t, app, "PATCH", path, `{`+fields+`}`, other).want(t, 404, "NOT_FOUND")
	edited := readReport(t, send(t, app, "PATCH", path, `{`+fields+`}`, owner), 200, "PENDING_REVIEW")
	if edited.Version != 2 {
		t.Fatalf("version = %d", edited.Version)
	}
	exact := list + "?status=PENDING_REVIEW&q=broken&reportNumber=" + url.QueryEscape(*submitted.ReportNumber)
	send(t, app, "GET", exact, "", owner).want(t, 200, `"totalItems":1`)
	send(t, app, "GET", exact, "", other).want(t, 200, `"totalItems":0`)
	cancelled := readReport(t, send(t, app, "POST", path+"/cancel", "{}", owner), 200, "CANCELLED")
	if cancelled.CancelledAt == nil {
		t.Fatal("missing cancellation time")
	}
	send(t, app, "GET", images+"/"+second.ID, "", reviewer).want(t, 404, "NOT_FOUND")
	send(t, app, "GET", images+"/"+second.ID, "", owner).want(t, 200, "PNG")

	publicImage := upload(owner)
	direct := readReport(t, send(t, app, "POST", reports, fmt.Sprintf(`{%s,"imageIds":[%q]}`, fields, publicImage.ID), owner), 201, "PENDING_REVIEW")
	exec("UPDATE reports SET status='CONFIRMED',ticket_id=? WHERE id=?", uuid.NewString(), direct.ID)
	public := send(t, app, "GET", images+"/"+publicImage.ID, "")
	public.want(t, 200, "PNG")
	if !strings.HasPrefix(public.Header.Get("Cache-Control"), "public,") {
		t.Fatal(public.Header)
	}
	send(t, app, "GET", reports+"/"+direct.ID, "").want(t, 401, "UNAUTHENTICATED")
	send(t, app, "GET", reports+"/"+direct.ID, "", reviewer).want(t, 200, "CONFIRMED")

	expiredDraftImage := upload(owner)
	oldDraft := readReport(t, send(t, app, "POST", drafts, fmt.Sprintf(`{"imageIds":[%q]}`, expiredDraftImage.ID), owner), 201, "DRAFT")
	freshDraft := readReport(t, send(t, app, "POST", drafts, `{}`, owner), 201, "DRAFT")
	cutoff := now.AddDate(0, 0, -30)
	exec("UPDATE reports SET created_at=? WHERE id IN (?,?)", cutoff, oldDraft.ID, direct.ID)
	exec("UPDATE reports SET cancelled_at=? WHERE id=?", cutoff, cancelled.ID)
	freshCancelledID, pendingID, rejectedID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	insertOld := func(id, number, status string, cancelledAt *time.Time, reason *string) {
		exec(`INSERT INTO reports (id,reporter_id,report_number,status,description,location_name,lat,lng,created_at,submitted_at,cancelled_at,rejection_reason)
			VALUES (?,?,?,?,'Issue','Gate',13.85,100.56,?,?,?,?)`, id, ownerID, number, status, cutoff, cutoff, cancelledAt, reason)
	}
	reason := "Test rejection"
	freshCancellation := cutoff.Add(time.Second)
	insertOld(freshCancelledID, "RPT-2026-00003", "CANCELLED", &freshCancellation, nil)
	insertOld(pendingID, "RPT-2026-00004", "PENDING_REVIEW", nil, nil)
	insertOld(rejectedID, "RPT-2026-00005", "REJECTED", nil, &reason)
	audits.fail = true
	if totals, err := service.PurgeExpiredReports(ctx); err == nil || totals.Total != 0 {
		t.Fatalf("purge rollback: %+v %v", totals, err)
	}
	audits.fail = false
	if _, err := objects.Get(ctx, expiredDraftImage.StorageKey); err != nil {
		t.Fatal(err)
	}
	totals, err := service.PurgeExpiredReports(ctx)
	if err != nil || totals.Draft != 1 || totals.Cancelled != 1 {
		t.Fatalf("purge: %+v %v", totals, err)
	}
	for _, img := range []media.ReportImage{second, expiredDraftImage} {
		if _, err := repository.ByID(ctx, img.ID); !errors.Is(err, media.ErrNotFound) {
			t.Fatalf("cascade: %v", err)
		}
		if _, err := objects.Get(ctx, img.StorageKey); !errors.Is(err, storage.ErrObjectNotFound) {
			t.Fatalf("purged object: %v", err)
		}
	}
	for _, id := range []string{freshDraft.ID, freshCancelledID, pendingID, rejectedID, direct.ID} {
		send(t, app, "GET", reports+"/"+id, "", owner).want(t, 200, id)
	}
	results := make(chan error, 2)
	actor := identity.User{ID: ownerID, IsActive: true, Roles: []identity.Role{identity.Reporter}}
	for range 2 {
		go func() {
			_, err := service.CancelPendingReport(ctx, actor, pendingID)
			results <- err
		}()
	}
	wins := 0
	for range 2 {
		switch err := <-results; {
		case err == nil:
			wins++
		case !errors.Is(err, reportDomain.ErrTransition):
			t.Fatal(err)
		}
	}
	if wins != 1 {
		t.Fatalf("concurrent cancellations accepted: %d", wins)
	}
	var count int64
	err = db.DB(ctx).Table("audit_logs").Where("entity_type='RETENTION' AND action='PURGE_EXPIRED_REPORTS' AND actor_type='SYSTEM'").
		Where("details @> '{\"draftPurged\":1,\"cancelledPurged\":1,\"imagesCleaned\":2}'").Count(&count).Error
	if err != nil || count != 1 {
		t.Fatalf("retention audit count = %d, error = %v", count, err)
	}
}
