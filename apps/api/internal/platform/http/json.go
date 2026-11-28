package http

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"

	"github.com/gofiber/fiber/v3"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
)

func DecodeJSON(c fiber.Ctx, target any) error {
	mediaType, _, err := mime.ParseMediaType(c.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return apperror.New(415, "UNSUPPORTED_MEDIA_TYPE", "Use Content-Type application/json.")
	}
	parser := json.NewDecoder(bytes.NewReader(c.Body()))
	parser.DisallowUnknownFields()
	if err := parser.Decode(target); err != nil {
		return apperror.Invalid
	}
	if err := parser.Decode(new(any)); !errors.Is(err, io.EOF) {
		return apperror.Invalid
	}
	return nil
}
