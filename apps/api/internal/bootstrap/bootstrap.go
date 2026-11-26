package bootstrap

import (
	"github.com/gofiber/fiber/v3"
	"github.com/thg1rb/ku-spot/apps/api/internal/adapters/ai"
	"github.com/thg1rb/ku-spot/apps/api/internal/config"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/database"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/http"
)

type Application struct {
	Server   *fiber.App
	Database *database.Connection
}

func New(settings config.Config) (*Application, error) {
	db, err := database.Open(settings.DatabaseURL)
	if err != nil {
		return nil, err
	}
	return &Application{Server: http.NewServer(db, ai.NewClient(settings.AIURL)), Database: db}, nil
}
