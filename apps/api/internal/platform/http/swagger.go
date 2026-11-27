package http

import (
	"net/http"

	"github.com/gofiber/contrib/v3/swaggerui"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/adaptor"
	"github.com/swaggest/swgui/v5/static"
	"github.com/thg1rb/ku-spot/apps/api/docs"
	"github.com/vearutop/statigz"
)

func RegisterSwagger(app *fiber.App) {
	ui := swaggerui.New(swaggerui.Config{
		Path:             "swagger",
		FilePath:         "openapi.yaml",
		FileContent:      docs.OpenAPIV1YAML,
		Title:            "KU Spot API documentation",
		SwaggerURL:       "/swagger/swagger-ui-bundle.js",
		SwaggerPresetURL: "/swagger/swagger-ui-standalone-preset.js",
		SwaggerStylesURL: "/swagger/swagger-ui.css",
		Favicon16:        "/swagger/favicon-16x16.png",
		Favicon32:        "/swagger/favicon-32x32.png",
	})
	canonical := func(c fiber.Ctx) error {
		return c.Redirect().Status(fiber.StatusTemporaryRedirect).To("/swagger")
	}
	app.Get("/swagger", func(c fiber.Ctx) error {
		if c.Path() != "/swagger" {
			return canonical(c)
		}
		return ui(c)
	})
	app.Get("/swagger/index.html", canonical)
	app.Get("/swagger/*", adaptor.HTTPHandler(http.StripPrefix("/swagger", statigz.FileServer(static.FS))))
	app.Get("/openapi.yaml", func(c fiber.Ctx) error {
		c.Set(fiber.HeaderContentType, "application/yaml; charset=utf-8")
		c.Set(fiber.HeaderCacheControl, "no-store")
		return c.Send(docs.OpenAPIV1YAML)
	})
}
