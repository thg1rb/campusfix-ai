package config

import (
	"errors"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Auth struct {
	AppBaseURL           string
	SessionSecret        string
	CookieSecure         bool
	GoogleClientID       string
	GoogleClientSecret   string
	GoogleRedirectURL    string
	GoogleAllowedDomain  string
	BootstrapAdminEmails []string
}

func (a Auth) GoogleEnabled() bool { return a.GoogleClientID != "" && a.GoogleClientSecret != "" }

func loadAuth() (Auth, error) {
	a := Auth{
		AppBaseURL:           envDefault("APP_BASE_URL", "http://localhost:3000"),
		SessionSecret:        os.Getenv("AUTH_SESSION_SECRET"),
		GoogleClientID:       strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_CLIENT_ID")),
		GoogleClientSecret:   strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET")),
		GoogleAllowedDomain:  envDefault("GOOGLE_OAUTH_ALLOWED_DOMAIN", "ku.th"),
		BootstrapAdminEmails: []string{},
	}
	base, err := url.Parse(a.AppBaseURL)
	if err != nil || base.Hostname() == "" || (base.Scheme != "http" && base.Scheme != "https") ||
		base.User != nil || (base.Path != "" && base.Path != "/") || base.ForceQuery || base.RawQuery != "" ||
		strings.Contains(a.AppBaseURL, "#") {
		return Auth{}, errors.New("APP_BASE_URL must be an HTTP(S) origin")
	}
	a.AppBaseURL = base.Scheme + "://" + base.Host
	a.CookieSecure = base.Scheme == "https"
	if raw := os.Getenv("AUTH_COOKIE_SECURE"); raw != "" {
		a.CookieSecure, err = strconv.ParseBool(raw)
		if err != nil {
			return Auth{}, errors.New("AUTH_COOKIE_SECURE must be a boolean")
		}
	}
	if base.Scheme == "https" && !a.CookieSecure {
		return Auth{}, errors.New("HTTPS requires AUTH_COOKIE_SECURE=true")
	}
	if a.GoogleEnabled() && base.Scheme != "https" && !isLoopbackHost(base.Hostname()) {
		return Auth{}, errors.New("HTTPS is required outside localhost for Google OAuth")
	}
	a.GoogleRedirectURL = envDefault("GOOGLE_OAUTH_REDIRECT_URL", a.AppBaseURL+"/api/v1/auth/callback")
	if a.GoogleRedirectURL != a.AppBaseURL+"/api/v1/auth/callback" {
		return Auth{}, errors.New("GOOGLE_OAUTH_REDIRECT_URL must point to APP_BASE_URL/api/v1/auth/callback")
	}
	if a.GoogleAllowedDomain != "ku.th" {
		return Auth{}, errors.New("GOOGLE_OAUTH_ALLOWED_DOMAIN must be ku.th")
	}
	if (a.SessionSecret != "" || a.GoogleEnabled()) && len(strings.TrimSpace(a.SessionSecret)) < 32 {
		return Auth{}, errors.New("AUTH_SESSION_SECRET must contain at least 32 characters when set or when OAuth is enabled")
	}
	for _, value := range strings.Split(os.Getenv("BOOTSTRAP_ADMIN_EMAILS"), ",") {
		email := strings.ToLower(strings.TrimSpace(value))
		if email == "" {
			continue
		}
		local, domain, found := strings.Cut(email, "@")
		if !found || domain != a.GoogleAllowedDomain || local == "" || strings.ContainsAny(local, " \t\r\n") {
			return Auth{}, errors.New("BOOTSTRAP_ADMIN_EMAILS must contain valid @ku.th addresses")
		}
		a.BootstrapAdminEmails = append(a.BootstrapAdminEmails, email)
	}
	return a, nil
}

func isLoopbackHost(host string) bool {
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func envDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
