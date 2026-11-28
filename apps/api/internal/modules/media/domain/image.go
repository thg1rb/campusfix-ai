package domain

import (
	"errors"
	"path"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
)

const (
	MaxImageBytes = 10 * 1024 * 1024
	MaxImages     = 5
	StageLifetime = 24 * time.Hour
	MIMEPNG       = "image/png"
	MIMEJPEG      = "image/jpeg"
)

var (
	ErrInvalidMediaFormat      = errors.New("invalid image format")
	ErrMediaTooLarge           = errors.New("image exceeds 10 MiB")
	ErrImageCorrupt            = errors.New("image is corrupt")
	ErrImageDimensionsExceeded = errors.New("image dimensions exceed the limit")
	ErrNotFound                = errors.New("image not found")
	ErrForbidden               = errors.New("image access denied")
	ErrInvalidBinding          = errors.New("image IDs must be unique and fit the report image limit")
)

type ReportImage struct {
	ID           string
	ReportID     *string
	UploadedBy   string
	StorageKey   string
	FileName     string
	MIMEType     string
	SizeBytes    int
	SortOrder    int
	EXIFStripped bool
	ExpiresAt    *time.Time
	CreatedAt    time.Time
}

type ReportStatus string

const (
	Draft         ReportStatus = "DRAFT"
	Cancelled     ReportStatus = "CANCELLED"
	PendingReview ReportStatus = "PENDING_REVIEW"
	Rejected      ReportStatus = "REJECTED"
	Confirmed     ReportStatus = "CONFIRMED"
)

type Visibility struct {
	OwnerID string
	Status  ReportStatus
}

func CanRead(img ReportImage, parent Visibility, viewer *identity.User) bool {
	if img.ReportID != nil && parent.Status == Confirmed {
		return true
	}
	if viewer == nil || !viewer.IsActive {
		return false
	}
	if img.ReportID == nil {
		return viewer.ID == img.UploadedBy
	}
	switch parent.Status {
	case Draft, Cancelled:
		return viewer.ID == parent.OwnerID
	case PendingReview, Rejected:
		return viewer.ID == parent.OwnerID || slices.Contains(viewer.Roles, identity.Reviewer)
	default:
		return false
	}
}

func Extension(mimeType string) string {
	if mimeType == MIMEPNG {
		return ".png"
	}
	return ".jpg"
}

func SanitizeFileName(name, mimeType string) string {
	name = path.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	ext := path.Ext(name)
	stem := strings.TrimSpace(strings.TrimSuffix(name, ext))
	if stem == "" || strings.Trim(stem, ".") == "" {
		stem = "image"
	}
	switch strings.ToLower(ext) {
	case ".png":
		if mimeType != MIMEPNG {
			ext = Extension(mimeType)
		}
	case ".jpg", ".jpeg":
		if mimeType != MIMEJPEG {
			ext = Extension(mimeType)
		}
	default:
		ext = Extension(mimeType)
	}
	if max := 255 - len(ext); len(stem) > max {
		for !utf8.RuneStart(stem[max]) {
			max--
		}
		stem = stem[:max]
	}
	return stem + ext
}
