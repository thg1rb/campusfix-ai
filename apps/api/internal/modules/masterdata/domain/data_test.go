package domain

import (
	"errors"
	"math"
	"strings"
	"testing"
)

func TestNormalizeNames(t *testing.T) {
	tests := []struct {
		name      string
		limit     int
		normalize func(string) error
	}{
		{"category", 120, func(name string) error { return (&Category{Name: name}).Normalize() }},
		{"department", 160, func(name string) error { return (&Department{Name: name}).Normalize() }},
		{"location", 200, func(name string) error {
			return (&CampusLocation{Name: name, Type: Building, Lat: 13.839, Lng: 100.557}).Normalize()
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, tc := range []struct {
				name string
				err  error
			}{
				{"   ", ErrNameRequired}, {"a\nb", ErrNameControl},
				{strings.Repeat("ก", tt.limit+1), ErrNameTooLong},
				{" " + strings.Repeat("ก", tt.limit) + " ", nil},
			} {
				if err := tt.normalize(tc.name); !errors.Is(err, tc.err) {
					t.Errorf("normalize %q: %v, want %v", tc.name, err, tc.err)
				}
			}
		})
	}
	c := Category{Name: "  ชื่อ ", Description: "  รายละเอียด  "}
	if err := c.Normalize(); err != nil || c.Name != "ชื่อ" || c.Description != "รายละเอียด" {
		t.Fatalf("normalization = %+v, %v", c, err)
	}
	d := Department{Name: "Scope", ResponsibilityScope: strings.Repeat("ก", 1001)}
	if err := d.Normalize(); !errors.Is(err, ErrDetails) {
		t.Fatalf("long scope: %v", err)
	}
}

func TestCampusCoordinates(t *testing.T) {
	for _, tc := range []struct {
		name     string
		lat, lng float64
		want     error
	}{
		{"southwest", 13.839, 100.557, nil}, {"northeast", 13.858, 100.580, nil},
		{"south", 13.8389, 100.56, ErrCoordinatesOutOfBounds},
		{"north", 13.8581, 100.56, ErrCoordinatesOutOfBounds},
		{"west", 13.85, 100.5569, ErrCoordinatesOutOfBounds},
		{"east", 13.85, 100.5801, ErrCoordinatesOutOfBounds},
		{"NaN", math.NaN(), 100.56, ErrCoordinatesOutOfBounds},
		{"infinity", 13.85, math.Inf(1), ErrCoordinatesOutOfBounds},
		{"negative infinity", math.Inf(-1), 100.56, ErrCoordinatesOutOfBounds},
	} {
		t.Run(tc.name, func(t *testing.T) {
			location := CampusLocation{Name: "Location", Type: Building, Lat: tc.lat, Lng: tc.lng}
			if err := location.Normalize(); !errors.Is(err, tc.want) {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
		})
	}
	location := CampusLocation{Name: "Location", Type: "building", Lat: 13.85, Lng: 100.56}
	if err := location.Normalize(); !errors.Is(err, ErrLocationType) {
		t.Fatalf("invalid type: %v", err)
	}
}

func TestDetailsRejectNUL(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name      string
		normalize func() error
	}{
		{name: "description", normalize: (&Category{Name: "Category", Description: "Before\x00after"}).Normalize},
		{name: "scope", normalize: (&Department{Name: "Department", ResponsibilityScope: "Before\x00after"}).Normalize},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := tc.normalize(); !errors.Is(err, ErrDetails) {
				t.Fatalf("normalize = %v; want ErrDetails", err)
			}
		})
	}
}
