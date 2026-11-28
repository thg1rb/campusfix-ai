package domain

import (
	"errors"
	"math"
	"strings"
	"testing"
	"time"
)

func pointer[T any](v T) *T { return &v }

func TestReportValidation(t *testing.T) {
	for _, tc := range []struct {
		name        string
		draft       bool
		images      int
		location    Location
		description string
		want        error
	}{
		{"empty draft", true, 0, Location{}, "", nil},
		{"draft note", true, 0, Location{DetailNote: pointer("ห้อง 1")}, "", nil},
		{"half point", true, 0, Location{Lat: pointer(13.85)}, "", ErrInvalid},
		{"not finite", true, 0, Location{Lat: pointer(math.NaN()), Lng: pointer(100.56)}, "", ErrInvalid},
		{"outside", true, 0, Location{Lat: pointer(13.8389), Lng: pointer(100.56)}, "", ErrInvalid},
		{"southwest", false, 1, Location{Name: pointer(" Gate "), Lat: pointer(13.839), Lng: pointer(100.557)}, " Issue ", nil},
		{"northeast", false, 5, Location{Name: pointer("Gate"), Lat: pointer(13.858), Lng: pointer(100.580)}, "Issue", nil},
		{"no images", false, 0, Location{Name: pointer("Gate"), Lat: pointer(13.85), Lng: pointer(100.56)}, "Issue", ErrInvalid},
		{"six images", true, 6, Location{}, "", ErrInvalid},
		{"long description", true, 0, Location{}, strings.Repeat("ก", 5001), ErrInvalid},
		{"long note", true, 0, Location{DetailNote: pointer(strings.Repeat("ก", 256))}, "", ErrInvalid},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := Report{Description: tc.description, Location: tc.location}
			if err := r.Validate(tc.images, tc.draft); !errors.Is(err, tc.want) {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
		})
	}
}

func TestReportTransitionsAndVisibility(t *testing.T) {
	now := time.Now()
	report := Report{ReporterID: "owner", Status: Draft, Version: 1}
	if err := report.Guard("other", Draft); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	report.Submit("RPT-2026-00001", now)
	if report.Status != PendingReview || report.Version != 1 || report.SubmittedAt == nil {
		t.Fatalf("invalid submitted report: %+v", report)
	}
	report.Edit(now.Add(time.Second))
	if report.Version != 2 {
		t.Fatalf("edited version = %d", report.Version)
	}
	report.Cancel(now.Add(time.Minute))
	if report.Status != Cancelled || report.CancelledAt == nil ||
		!errors.Is(report.Guard("owner", PendingReview), ErrTransition) {
		t.Fatalf("invalid cancelled report: %+v", report)
	}
	for _, status := range []Status{Draft, PendingReview, Confirmed, Rejected, Cancelled} {
		report.Status = status
		for _, tc := range []struct {
			viewer Viewer
			want   error
		}{
			{Viewer{ID: "owner", Active: true}, nil},
			{Viewer{ID: "owner", Admin: true, Active: true}, ErrAdmin},
			{Viewer{ID: "other", Active: true}, ErrNotFound},
			{Viewer{ID: "reviewer", Reviewer: true}, ErrNotFound},
		} {
			if err := CanViewReport(report, tc.viewer); !errors.Is(err, tc.want) {
				t.Fatalf("%v %v: %v", status, tc.viewer, err)
			}
		}
		err := CanViewReport(report, Viewer{ID: "reviewer", Active: true, Reviewer: true})
		if (err == nil) != (status != Draft && status != Cancelled) {
			t.Fatalf("reviewer visibility for %s: %v", status, err)
		}
	}
}
