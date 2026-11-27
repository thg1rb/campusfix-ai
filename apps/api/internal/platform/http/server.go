package http

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/recover"
)

type Checker interface {
	Check(context.Context) error
}

func NewServer(database, gateway Checker) *fiber.App {
	app := fiber.New(fiber.Config{
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
		IdleTimeout:  30 * time.Second,
		ErrorHandler: handleError,
	})
	app.Use(requestContext)
	app.Use(recover.New())
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
