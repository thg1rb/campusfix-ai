package domain

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

type Status string

const (
	Draft         Status = "DRAFT"
	PendingReview Status = "PENDING_REVIEW"
	Confirmed     Status = "CONFIRMED"
	Rejected      Status = "REJECTED"
	Cancelled     Status = "CANCELLED"
)

func (s Status) Valid() bool {
	switch s {
	case Draft, PendingReview, Confirmed, Rejected, Cancelled:
		return true
	default:
		return false
	}
}

var (
	ErrTransition          = errors.New("report status does not allow this action")
	ErrInvalid             = errors.New("report fields or attachments are invalid")
	ErrLocationUnavailable = errors.New("campus location is unavailable")
	ErrNotFound            = errors.New("report not found")
	ErrAdmin               = errors.New("administrators cannot perform operational actions")
	ErrForbidden           = errors.New("report action is forbidden")
	ErrInactive            = errors.New("an active session is required")
)

type Location struct {
	ID         *string
	Name       *string
	DetailNote *string
	Lat, Lng   *float64
}

type AttachedImage struct {
	ID         string
	FileName   string
	MIMEType   string
	SizeBytes  int
	SortOrder  int
	PreviewURL string
}

type Report struct {
	ID, ReporterID                                                                   string
	ReportNumber                                                                     *string
	Status                                                                           Status
	Version                                                                          int
	Description                                                                      string
	Location                                                                         Location
	AIGeneratedTitle, RequestedTargetTicketID, TicketID, RejectionReason, ReviewedBy *string
	ReviewedAt, SubmittedAt, CancelledAt                                             *time.Time
	CreatedAt, UpdatedAt                                                             time.Time
	Images                                                                           []AttachedImage
}

type ReportCounts struct {
	Total, Draft, PendingReview, Confirmed, Rejected, Cancelled int64
}

type Viewer struct {
	ID                      string
	Active, Reviewer, Admin bool
}

func CanViewReport(report Report, viewer Viewer) error {
	switch {
	case viewer.Admin:
		return ErrAdmin
	case !viewer.Active || !report.Status.Valid():
		return ErrNotFound
	case report.ReporterID == viewer.ID:
		return nil
	case viewer.Reviewer && (report.Status == PendingReview || report.Status == Rejected || report.Status == Confirmed):
		return nil
	default:
		return ErrNotFound
	}
}

func (r *Report) Validate(imageCount int, draft bool) error {
	r.Description = strings.TrimSpace(r.Description)
	if utf8.RuneCountInString(r.Description) > 5000 || strings.ContainsRune(r.Description, 0) ||
		!normalize(r.Location.Name, 200) || !normalize(r.Location.DetailNote, 255) {
		return ErrInvalid
	}
	l := r.Location
	if (l.Lat == nil) != (l.Lng == nil) {
		return ErrInvalid
	}
	if l.Lat != nil && !(*l.Lat >= 13.839 && *l.Lat <= 13.858 && *l.Lng >= 100.557 && *l.Lng <= 100.580) {
		return ErrInvalid
	}
	if imageCount < 0 || imageCount > 5 {
		return ErrInvalid
	}
	if !draft && (r.Description == "" || l.Name == nil || *l.Name == "" || l.Lat == nil || imageCount == 0) {
		return ErrInvalid
	}
	return nil
}

func normalize(value *string, limit int) bool {
	if value == nil {
		return true
	}
	*value = strings.TrimSpace(*value)
	return utf8.RuneCountInString(*value) <= limit && !strings.ContainsRune(*value, 0)
}

func (r *Report) Guard(owner string, status Status) error {
	if r.ReporterID != owner {
		return ErrNotFound
	}
	if r.Status != status {
		return ErrTransition
	}
	return nil
}

func (r *Report) Submit(number string, now time.Time) {
	r.Status, r.ReportNumber, r.SubmittedAt, r.UpdatedAt = PendingReview, &number, &now, now
	r.Version = 1
}

func (r *Report) Edit(now time.Time) {
	r.Version++
	r.UpdatedAt = now
}

func (r *Report) Cancel(now time.Time) {
	r.Status, r.CancelledAt, r.UpdatedAt = Cancelled, &now, now
}
