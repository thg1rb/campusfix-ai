package config

import (
	"slices"
	"strings"
	"testing"
)

func TestAuthConfig(t *testing.T) {
	secret := strings.Repeat("s", 32)
	for _, tc := range []struct {
		name      string
		env       map[string]string
		wantError string
	}{
		{"defaults", nil, ""},
		{"invalid scheme", map[string]string{"APP_BASE_URL": "ftp://localhost"}, "APP_BASE_URL"},
		{"credentials in base", map[string]string{"APP_BASE_URL": "https://name@campus.example"}, "APP_BASE_URL"},
		{"path in base", map[string]string{"APP_BASE_URL": "https://campus.example/path"}, "APP_BASE_URL"},
		{"query in base", map[string]string{"APP_BASE_URL": "https://campus.example/?"}, "APP_BASE_URL"},
		{"fragment in base", map[string]string{"APP_BASE_URL": "https://campus.example/#"}, "APP_BASE_URL"},
		{"invalid cookie flag", map[string]string{"AUTH_COOKIE_SECURE": "maybe"}, "AUTH_COOKIE_SECURE"},
		{"insecure HTTPS cookie", map[string]string{"APP_BASE_URL": "https://campus.example", "AUTH_COOKIE_SECURE": "false"}, "AUTH_COOKIE_SECURE"},
		{"remote insecure enabled", map[string]string{"APP_BASE_URL": "http://campus.example", "GOOGLE_OAUTH_CLIENT_ID": "client", "GOOGLE_OAUTH_CLIENT_SECRET": "secret", "AUTH_SESSION_SECRET": secret}, "HTTPS"},
		{"Google loopback", map[string]string{"APP_BASE_URL": "http://[::1]:3000", "GOOGLE_OAUTH_CLIENT_ID": "client", "GOOGLE_OAUTH_CLIENT_SECRET": "secret", "AUTH_SESSION_SECRET": secret}, ""},
		{"redirect mismatch", map[string]string{"GOOGLE_OAUTH_REDIRECT_URL": "http://localhost:3000/callback"}, "GOOGLE_OAUTH_REDIRECT_URL"},
		{"invalid domain", map[string]string{"GOOGLE_OAUTH_ALLOWED_DOMAIN": "example.com"}, "GOOGLE_OAUTH_ALLOWED_DOMAIN"},
		{"short secret disabled", map[string]string{"AUTH_SESSION_SECRET": " " + secret[:31] + " "}, "AUTH_SESSION_SECRET"},
		{"blank secret disabled", map[string]string{"AUTH_SESSION_SECRET": "   "}, "AUTH_SESSION_SECRET"},
		{"empty secret enabled", map[string]string{"GOOGLE_OAUTH_CLIENT_ID": "client", "GOOGLE_OAUTH_CLIENT_SECRET": "secret"}, "AUTH_SESSION_SECRET"},
		{"invalid admin email", map[string]string{"BOOTSTRAP_ADMIN_EMAILS": "@ku.th,other@example.com"}, "BOOTSTRAP_ADMIN_EMAILS"},
		{"valid admin emails", map[string]string{"BOOTSTRAP_ADMIN_EMAILS": "  ADMIN@KU.TH, staff@ku.th, "}, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, key := range []string{"APP_BASE_URL", "AUTH_COOKIE_SECURE", "AUTH_SESSION_SECRET", "GOOGLE_OAUTH_CLIENT_ID",
				"GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URL", "GOOGLE_OAUTH_ALLOWED_DOMAIN", "BOOTSTRAP_ADMIN_EMAILS"} {
				t.Setenv(key, tc.env[key])
			}
			auth, err := loadAuth()
			if tc.wantError != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantError) {
					t.Fatalf("wanted %s, got %v", tc.wantError, err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if auth.GoogleRedirectURL != auth.AppBaseURL+"/api/v1/auth/callback" || auth.GoogleAllowedDomain != "ku.th" {
				t.Fatalf("unexpected defaults: callback %s, domain %s", auth.GoogleRedirectURL, auth.GoogleAllowedDomain)
			}
			if tc.name == "valid admin emails" && !slices.Equal(auth.BootstrapAdminEmails, []string{"admin@ku.th", "staff@ku.th"}) {
				t.Fatal("bootstrap email normalization failed")
			}
		})
	}
}
