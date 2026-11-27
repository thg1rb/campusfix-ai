package http

import (
	"testing"
	"time"
)

func TestSafeNext(t *testing.T) {
	for _, path := range []string{"https://example.com", "//example.com", "/%2Fexample.com", "/%252Fexample.com",
		"/%5cexample.com", "/%250A", "/login", "/one/../login", "/api/v1/auth/login"} {
		if got := safeNext(path); got != "" {
			t.Errorf("accepted %q", path)
		}
	}
	if got := safeNext("/feed?q=wifi#top"); got != "/feed?q=wifi#top" {
		t.Fatal(got)
	}
}

func TestSignSeparatesCookiePurposes(t *testing.T) {
	signer := newCookies("test secret", false, time.Now)
	if signer.sign(sessionCookie, "payload") == signer.sign(stateCookie, "payload") {
		t.Fatal("cookie purposes share signatures")
	}
}
