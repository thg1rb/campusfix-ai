package domain

import (
	"errors"
	"math"
	"strings"
	"unicode"
	"unicode/utf8"
)

type Category struct {
	ID          string
	Name        string
	Description string
	IsActive    bool
}

type Department struct {
	ID                  string
	Name                string
	ResponsibilityScope string
	IsActive            bool
	StaffUsernames      []string
}

type CampusLocation struct {
	ID       string
	Name     string
	Type     LocationType
	Lat, Lng float64
	IsActive bool
}

type LocationType string

const (
	Building      LocationType = "BUILDING"
	CommonArea    LocationType = "COMMON_AREA"
	Road          LocationType = "ROAD"
	ActivityPlaza LocationType = "ACTIVITY_PLAZA"
	ServicePoint  LocationType = "SERVICE_POINT"
	Landmark      LocationType = "LANDMARK"
)

func (t LocationType) Valid() bool {
	switch t {
	case Building, CommonArea, Road, ActivityPlaza, ServicePoint, Landmark:
		return true
	}
	return false
}

var (
	ErrNameRequired           = errors.New("name is required")
	ErrNameTooLong            = errors.New("name is too long")
	ErrNameControl            = errors.New("name contains a control character")
	ErrDetails                = errors.New("description or scope is too long or contains a NUL character")
	ErrNameTaken              = errors.New("name is already taken")
	ErrLocationType           = errors.New("invalid campus location type")
	ErrCoordinatesOutOfBounds = errors.New("coordinates must be within KU Bangkhen")
	ErrNotFound               = errors.New("master data record was not found")
)

func normalizeName(value *string, limit int) error {
	if strings.ContainsFunc(*value, unicode.IsControl) {
		return ErrNameControl
	}
	*value = strings.TrimSpace(*value)
	switch {
	case *value == "":
		return ErrNameRequired
	case utf8.RuneCountInString(*value) > limit:
		return ErrNameTooLong
	}
	return nil
}

func normalizeDetails(value *string) error {
	*value = strings.TrimSpace(*value)
	if utf8.RuneCountInString(*value) > 1000 || strings.ContainsRune(*value, 0) {
		return ErrDetails
	}
	return nil
}

func (c *Category) Normalize() error {
	if err := normalizeName(&c.Name, 120); err != nil {
		return err
	}
	return normalizeDetails(&c.Description)
}

func (d *Department) Normalize() error {
	if err := normalizeName(&d.Name, 160); err != nil {
		return err
	}
	return normalizeDetails(&d.ResponsibilityScope)
}

func (l *CampusLocation) Normalize() error {
	if err := normalizeName(&l.Name, 200); err != nil {
		return err
	}
	if !l.Type.Valid() {
		return ErrLocationType
	}
	if math.IsNaN(l.Lat) || math.IsNaN(l.Lng) || l.Lat < 13.839 || l.Lat > 13.858 ||
		l.Lng < 100.557 || l.Lng > 100.580 {
		return ErrCoordinatesOutOfBounds
	}
	return nil
}
