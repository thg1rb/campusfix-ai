package http

import (
	"context"
	"errors"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
)

var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)

func isAPI(path string) bool { return path == "/api/v1" || strings.HasPrefix(path, "/api/v1/") }

const defaultAPITimeout = 15 * time.Second

// RouteTimeout selects an API context budget before a deadline is installed.
type RouteTimeout struct {
	Method  string
	Pattern string
	Budget  time.Duration
}

func apiTimeout(c fiber.Ctx, overrides []RouteTimeout) time.Duration {
	for _, override := range overrides {
		if override.Budget > 0 && override.Method == c.Method() &&
			fiber.RoutePatternMatch(c.Path(), override.Pattern, c.App().Config()) {
			return override.Budget
		}
	}
	return defaultAPITimeout
}

func requestContext(overrides []RouteTimeout) fiber.Handler {
	return func(c fiber.Ctx) error {
		start := time.Now()
		id := c.Get("X-Request-Id")
		if !requestIDPattern.MatchString(id) {
			id = uuid.NewString()
		}
		c.Set("X-Request-Id", id)
		if isAPI(c.Path()) {
			ctx, cancel := context.WithTimeout(c.Context(), apiTimeout(c, overrides))
			defer cancel()
			c.SetContext(ctx)
			c.Set("Cache-Control", "no-store")
		}
		err := c.Next()
		if err != nil {
			err = handleError(c, err)
		}
		slog.Info("http request", "request_id", id, "method", c.Method(), "route", c.Route().Path,
			"status", c.Response().StatusCode(), "duration_ms", time.Since(start).Milliseconds())
		return err
	}
}

func handleError(c fiber.Ctx, err error) error {
	status := fiber.StatusInternalServerError
	var apiError *apperror.Error
	var fiberError *fiber.Error
	switch {
	case errors.As(err, &apiError):
		status = apiError.Status
	case errors.As(err, &fiberError):
		status = fiberError.Code
	case errors.Is(err, context.DeadlineExceeded):
		apiError = apperror.Unavailable
		status = apiError.Status
	}
	if apiError == nil {
		apiError = standardError(status)
	}
	if status >= 500 {
		slog.Error("HTTP request failed", "request_id", c.GetRespHeader("X-Request-Id"),
			"error_type", apiError.Code, "status", status, "error", apperror.Diagnostic(err))
	}
	// The listener can discard the request path when a chunked body crosses its limit.
	transportOverflow := status == fiber.StatusRequestEntityTooLarge && c.Path() == "/"
	if !isAPI(c.Path()) && !transportOverflow {
		return c.Status(status).JSON(fiber.Map{"status": "error"})
	}
	if c.GetRespHeader("X-Request-Id") == "" {
		id := c.Get("X-Request-Id")
		if !requestIDPattern.MatchString(id) {
			id = uuid.NewString()
		}
		c.Set("X-Request-Id", id)
	}
	c.Set("Cache-Control", "no-store")
	return c.Status(status).JSON(fiber.Map{"error": fiber.Map{
		"code": apiError.Code, "message": apiError.Message, "details": fiber.Map{},
		"requestId": c.GetRespHeader("X-Request-Id"),
	}})
}

func standardError(status int) *apperror.Error {
	switch status {
	case 400:
		return apperror.Invalid
	case 401:
		return apperror.Unauthenticated
	case 403:
		return apperror.Forbidden
	case 404:
		return apperror.NotFound
	case 405:
		return apperror.New(status, "METHOD_NOT_ALLOWED", "This method is not supported.")
	case 409:
		return apperror.New(status, "CONFLICT", "The request conflicts with current data.")
	case 413:
		return apperror.PayloadTooLarge
	case 422:
		return apperror.New(status, "VALIDATION_ERROR", "The request did not pass validation.")
	case 503:
		return apperror.Unavailable
	default:
		return apperror.New(status, "INTERNAL_ERROR", "The request could not be completed.")
	}
}
