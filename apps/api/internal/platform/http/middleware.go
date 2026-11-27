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

func requestContext(c fiber.Ctx) error {
	start := time.Now()
	id := c.Get("X-Request-Id")
	if !requestIDPattern.MatchString(id) {
		id = uuid.NewString()
	}
	c.Set("X-Request-Id", id)
	if isAPI(c.Path()) {
		ctx, cancel := context.WithTimeout(c.Context(), 4*time.Second)
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
	if !isAPI(c.Path()) {
		return c.Status(status).JSON(fiber.Map{"status": "error"})
	}
	if apiError == nil {
		apiError = standardError(status)
	}
	if status >= 500 {
		slog.Warn("api request failed", "request_id", c.GetRespHeader("X-Request-Id"), "error_type", apiError.Code)
	}
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
	case 422:
		return apperror.New(status, "VALIDATION_ERROR", "The request did not pass validation.")
	case 503:
		return apperror.Unavailable
	default:
		return apperror.New(status, "INTERNAL_ERROR", "The request could not be completed.")
	}
}
