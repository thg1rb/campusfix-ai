package http

import (
	"errors"
	"io"
	"mime"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	identityHTTP "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/adapters/inbound/http"
	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/media/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/media/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
)

const Path = "/media/report-images"

var (
	tooLarge      = apperror.New(400, "MEDIA_TOO_LARGE", "The image exceeds 10 MiB.")
	invalidFormat = apperror.New(400, "INVALID_MEDIA_FORMAT", "Use a valid PNG or JPEG within the image dimension limits.")
	unsupported   = apperror.New(415, "UNSUPPORTED_MEDIA_TYPE", "Use Content-Type multipart/form-data.")
)

func Register(router fiber.Router, service *application.Service, auth *identityHTTP.Handler) {
	router.Post(Path, auth.CheckWriteOrigin, auth.OptionalAuth, identityHTTP.RequireAuth,
		identityHTTP.RejectAdminOperational, stage(service))
	router.Get(Path+"/:imageId", auth.OptionalAuth, get(service))
}

func stage(service *application.Service) fiber.Handler {
	return func(c fiber.Ctx) error {
		contentType := c.Get("Content-Type")
		if value, _, _ := strings.Cut(contentType, ";"); !strings.EqualFold(strings.TrimSpace(value), "multipart/form-data") {
			return unsupported
		}
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil || params["boundary"] == "" {
			return apperror.Invalid
		}
		if encoding := c.Get("Content-Encoding"); encoding != "" && !strings.EqualFold(encoding, "identity") {
			return unsupported
		}
		form, err := c.MultipartForm()
		if err != nil || len(form.File) != 1 || len(form.File["file"]) != 1 || len(form.Value) != 0 {
			return apperror.Invalid
		}
		file := form.File["file"][0]
		if file.Size > domain.MaxImageBytes {
			return tooLarge
		}
		opened, err := file.Open()
		if err != nil {
			return err
		}
		defer func() { _ = opened.Close() }()
		raw, err := io.ReadAll(io.LimitReader(opened, domain.MaxImageBytes+1))
		if err != nil {
			return err
		}
		actor, _ := identityHTTP.Actor(c)
		img, err := service.StageReportImage(c.Context(), actor, file.Filename, raw)
		if err != nil {
			return mapError(err)
		}
		return c.Status(201).JSON(fiber.Map{
			"imageId": img.ID, "fileName": img.FileName, "mimeType": img.MIMEType,
			"sizeBytes": img.SizeBytes, "previewUrl": application.PreviewURL(img.ID), "expiresAt": img.ExpiresAt,
		})
	}
}

func get(service *application.Service) fiber.Handler {
	return func(c fiber.Ctx) error {
		id, err := uuid.Parse(c.Params("imageId"))
		if err != nil || len(c.Params("imageId")) != 36 {
			return apperror.Invalid
		}
		var viewer *identity.User
		if actor, ok := identityHTTP.Actor(c); ok {
			viewer = &actor
		}
		img, err := service.GetReportImage(c.Context(), viewer, id.String())
		if err != nil {
			return mapError(err)
		}
		cache := "private, no-store"
		if img.IsPublic {
			cache = "public, max-age=3600, immutable"
		}
		c.Set("Cache-Control", cache)
		c.Set("Content-Type", img.MIMEType)
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": img.FileName}))
		return c.Send(img.Data)
	}
}

func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrMediaTooLarge):
		return tooLarge
	case errors.Is(err, domain.ErrInvalidMediaFormat), errors.Is(err, domain.ErrImageCorrupt),
		errors.Is(err, domain.ErrImageDimensionsExceeded):
		return invalidFormat
	case errors.Is(err, domain.ErrNotFound), errors.Is(err, domain.ErrForbidden):
		return apperror.NotFound
	case errors.Is(err, application.ErrAdminOperational):
		return identityHTTP.AdminNonOperational
	case errors.Is(err, application.ErrStorageUnavailable):
		return errors.Join(apperror.Unavailable, err)
	default:
		return err
	}
}
