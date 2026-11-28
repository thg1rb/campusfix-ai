package domain

import (
	"strings"
	"testing"
	"unicode/utf8"

	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
)

func TestVisibility(t *testing.T) {
	reportID := "report"
	uploader := &identity.User{ID: "owner", IsActive: true}
	reviewer := &identity.User{ID: "reviewer", Roles: []identity.Role{identity.Reviewer}, IsActive: true}
	inactive := &identity.User{ID: "inactive", Roles: reviewer.Roles}
	admin := &identity.User{ID: "admin", Roles: []identity.Role{identity.Administrator}, IsActive: true}
	viewers := []*identity.User{nil, uploader, reviewer, inactive, admin}
	for _, tc := range []struct {
		status   ReportStatus
		reportID *string
		want     []bool
	}{
		{"", nil, []bool{false, true, false, false, false}},
		{Draft, &reportID, []bool{false, true, false, false, false}},
		{Cancelled, &reportID, []bool{false, true, false, false, false}},
		{PendingReview, &reportID, []bool{false, true, true, false, false}},
		{Rejected, &reportID, []bool{false, true, true, false, false}},
		{Confirmed, &reportID, []bool{true, true, true, true, true}},
	} {
		for i, viewer := range viewers {
			img := ReportImage{ReportID: tc.reportID, UploadedBy: uploader.ID}
			if got := CanRead(img, Visibility{OwnerID: uploader.ID, Status: tc.status}, viewer); got != tc.want[i] {
				t.Errorf("status %s viewer %d: got %t", tc.status, i, got)
			}
		}
	}
}

func TestSanitizeFileName(t *testing.T) {
	if got := SanitizeFileName("C:\\users\\photo\r\n.jpeg", MIMEJPEG); got != "photo.jpeg" {
		t.Fatal(got)
	}
	if got := SanitizeFileName("../\t", MIMEPNG); got != "image.png" {
		t.Fatal(got)
	}
	if got := SanitizeFileName(strings.Repeat("ก", 100)+".jpg", MIMEPNG); len(got) > 255 || !utf8.ValidString(got) || !strings.HasSuffix(got, ".png") {
		t.Fatal(got)
	}
}
