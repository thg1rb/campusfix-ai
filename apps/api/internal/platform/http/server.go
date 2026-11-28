package http

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"runtime/debug"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/recover"
)

type Checker interface {
	Check(context.Context) error
}

var errRecoveredPanic = errors.New("handler panicked")

func NewServer(database, gateway Checker, overrides ...RouteTimeout) *fiber.App {
	app := fiber.New(fiber.Config{
		BodyLimit:                    12 * 1024 * 1024,
		ReadTimeout:                  30 * time.Second,
		WriteTimeout:                 30 * time.Second,
		IdleTimeout:                  30 * time.Second,
		ErrorHandler:                 handleError,
		DisablePreParseMultipartForm: true,
	})
	app.Use(requestContext(overrides))
	app.Use(recover.New(recover.Config{
		EnableStackTrace: true,
		StackTraceHandler: func(c fiber.Ctx, value any) {
			slog.Error("recovered HTTP panic", "request_id", c.GetRespHeader("X-Request-Id"),
				"panic_type", fmt.Sprintf("%T", value), "stack", string(debug.Stack()))
		},
		PanicHandler: func(fiber.Ctx, any) error { return errRecoveredPanic },
	}))
	app.Get("/healthz", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})
	app.Get("/readyz", func(c fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.Context(), 2*time.Second)
		defer cancel()
		dbResult := make(chan error, 1)
		go func() { dbResult <- database.Check(ctx) }()
		aiErr := gateway.Check(ctx)
		dbErr := <-dbResult
		checks := fiber.Map{"db": "ok", "ai": "ok"}
		if dbErr != nil {
			checks["db"] = "unavailable"
		}
		if aiErr != nil {
			checks["ai"] = "unavailable"
		}
		c.Set("Cache-Control", "no-store")
		if dbErr != nil || aiErr != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"status": "unavailable", "checks": checks})
		}
		return c.JSON(fiber.Map{"status": "ok", "checks": checks})
	})
	return app
}
