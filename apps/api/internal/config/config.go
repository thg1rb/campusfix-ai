package config

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
)

type Config struct {
	Address        string
	DatabaseURL    string
	AIURL          string
	Auth           Auth
	Storage        Storage
	SwaggerEnabled bool
}

func Load() (Config, error) {
	port, err := strconv.Atoi(os.Getenv("API_PORT"))
	if err != nil || port < 1 || port > 65535 {
		return Config{}, fmt.Errorf("API_PORT must be a valid TCP port")
	}
	databaseURL, err := url.Parse(os.Getenv("DATABASE_URL"))
	if err != nil || databaseURL.Scheme != "postgresql" || databaseURL.Hostname() == "" || len(databaseURL.Path) < 2 || databaseURL.User == nil || databaseURL.User.Username() == "" {
		return Config{}, fmt.Errorf("DATABASE_URL must be a PostgreSQL URL with a host, user and database")
	}
	aiURL, err := url.Parse(os.Getenv("AI_BASE_URL"))
	if err != nil || (aiURL.Scheme != "http" && aiURL.Scheme != "https") || aiURL.Hostname() == "" || aiURL.User != nil || aiURL.RawQuery != "" || aiURL.Fragment != "" {
		return Config{}, fmt.Errorf("AI_BASE_URL must be an HTTP(S) base URL")
	}
	auth, err := loadAuth()
	if err != nil {
		return Config{}, err
	}
	storage, err := loadStorage()
	if err != nil {
		return Config{}, err
	}
	base, err := url.Parse(auth.AppBaseURL)
	if err != nil {
		return Config{}, err
	}
	swaggerEnabled := isLoopbackHost(base.Hostname())
	switch os.Getenv("SWAGGER_ENABLED") {
	case "":
	case "true":
		swaggerEnabled = true
	case "false":
		swaggerEnabled = false
	default:
		return Config{}, fmt.Errorf("SWAGGER_ENABLED must be true or false")
	}
	return Config{
		SwaggerEnabled: swaggerEnabled,
		Address:        net.JoinHostPort("0.0.0.0", strconv.Itoa(port)),
		DatabaseURL:    databaseURL.String(),
		AIURL:          aiURL.JoinPath("healthz").String(),
		Auth:           auth,
		Storage:        storage,
	}, nil
}
