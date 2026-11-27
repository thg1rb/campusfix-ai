package config

import (
	"strings"
	"testing"
)

func TestSwaggerConfig(t *testing.T) {
	t.Setenv("API_PORT", "8080")
	t.Setenv("DATABASE_URL", "postgresql://kuspot@localhost/kuspot")
	t.Setenv("AI_BASE_URL", "http://localhost:8000")
	for _, name := range []string{
		"AUTH_SESSION_SECRET", "AUTH_COOKIE_SECURE", "GOOGLE_OAUTH_CLIENT_ID",
		"GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_ALLOWED_DOMAIN",
		"GOOGLE_OAUTH_REDIRECT_URL", "BOOTSTRAP_ADMIN_EMAILS",
	} {
		t.Setenv(name, "")
	}

	for _, tc := range []struct {
		name, baseURL, value string
		enabled, invalid     bool
	}{
		{"default APP_BASE_URL", "", "", true, false},
		{"localhost", "http://localhost:3000", "", true, false},
		{"IPv4 loopback", "http://127.0.0.1:3000", "", true, false},
		{"IPv6 loopback", "http://[::1]:3000", "", true, false},
		{"outside localhost", "https://ku-spot.example", "", false, false},
		{"disable locally", "http://localhost:3000", "false", false, false},
		{"enable outside localhost", "https://ku-spot.example", "true", true, false},
		{"invalid", "http://localhost:3000", "yes", false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("APP_BASE_URL", tc.baseURL)
			t.Setenv("SWAGGER_ENABLED", tc.value)
			cfg, err := Load()
			if tc.invalid {
				if err == nil || !strings.Contains(err.Error(), "SWAGGER_ENABLED") {
					t.Fatalf("expected SWAGGER_ENABLED error, got %v", err)
				}
				return
			}
			if err != nil || cfg.SwaggerEnabled != tc.enabled {
				t.Fatalf("SwaggerEnabled = %v, err = %v, want %v", cfg.SwaggerEnabled, err, tc.enabled)
			}
		})
	}
}
