package main

import (
	"context"
	"errors"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/thg1rb/campusfix-ai/apps/api/internal/bootstrap"
	"github.com/thg1rb/campusfix-ai/apps/api/internal/config"
)

func run() (err error) {
	settings, err := config.Load()
	if err != nil {
		return err
	}
	app, err := bootstrap.New(settings)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, app.Database.Close()) }()

	signals, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return app.Server.Listen(settings.Address, fiber.ListenConfig{
		GracefulContext:       signals,
		ShutdownTimeout:       8 * time.Second,
		DisableStartupMessage: true,
		ListenerAddrFunc:      func(addr net.Addr) { log.Printf("API listening on %s", addr) },
	})
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
