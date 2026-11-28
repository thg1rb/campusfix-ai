package http

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	"github.com/valyala/fasthttp"
)

const maxJSONBytes = 4 * 1024 * 1024

func DecodeJSON(c fiber.Ctx, target any) error {
	mediaType, _, err := mime.ParseMediaType(c.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return apperror.New(415, "UNSUPPORTED_MEDIA_TYPE", "Use Content-Type application/json.")
	}
	body, err := boundedJSONBody(c)
	if err != nil {
		return err
	}
	parser := json.NewDecoder(bytes.NewReader(body))
	parser.DisallowUnknownFields()
	if err := parser.Decode(target); err != nil {
		return apperror.Invalid
	}
	if err := parser.Decode(new(any)); !errors.Is(err, io.EOF) {
		return apperror.Invalid
	}
	return nil
}

func boundedJSONBody(c fiber.Ctx) ([]byte, error) {
	body := c.BodyRaw()
	if len(body) > maxJSONBytes {
		return nil, apperror.PayloadTooLarge
	}
	headers := c.Request().Header.PeekAll(fiber.HeaderContentEncoding)
	if len(headers) == 0 {
		return body, nil
	}

	const maxCodings = 5
	codings := make([]string, 0, maxCodings)
	for _, header := range headers {
		for coding := range strings.SplitSeq(string(header), ",") {
			if coding = strings.ToLower(strings.TrimSpace(coding)); coding != "" {
				codings = append(codings, coding)
			}
		}
	}
	if len(codings) > maxCodings {
		return nil, unsupportedJSONEncoding()
	}

	// Undo stacked codings in reverse order and bound each decompression.
	scratch := fasthttp.AcquireRequest()
	defer fasthttp.ReleaseRequest(scratch)
	for i := len(codings) - 1; i >= 0; i-- {
		coding := codings[i]
		switch coding {
		case "identity":
			continue
		case "x-gzip":
			coding = "gzip"
		case "brotli":
			coding = "br"
		}
		scratch.SetBodyRaw(body)
		scratch.Header.SetContentEncoding(coding)
		decoded, err := scratch.BodyUncompressedWithLimit(maxJSONBytes)
		switch {
		case errors.Is(err, fasthttp.ErrBodyTooLarge):
			return nil, apperror.PayloadTooLarge
		case errors.Is(err, fasthttp.ErrContentEncodingUnsupported):
			return nil, unsupportedJSONEncoding()
		case err != nil:
			return nil, apperror.Invalid
		}
		body = decoded
	}
	return body, nil
}

func unsupportedJSONEncoding() error {
	return apperror.New(415, "UNSUPPORTED_MEDIA_TYPE", "The content encoding is not supported.")
}
