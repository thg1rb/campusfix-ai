package auth

import (
	"errors"
	"net/url"
	"testing"

	"github.com/thg1rb/ku-spot/apps/api/internal/config"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/application"
)

func TestCampusClaims(t *testing.T) {
	google := NewGoogle(config.Auth{GoogleAllowedDomain: "ku.th"})
	for _, tc := range []struct {
		email, hd         string
		verified, allowed bool
	}{
		{"sample@ku.th", "ku.th", true, true},
		{"sample@ku.th", "", true, false},
		{"sample@ku.th", "ku.th", false, false},
		{"sample@gmail.com", "ku.th", true, false},
		{"sample@ku.th.example", "ku.th", true, false},
		{"sample@ku.th", "example.com", true, false},
	} {
		got, err := google.normalize("subject", googleClaims{Email: tc.email, HostedDomain: tc.hd, Verified: tc.verified})
		if tc.allowed {
			if err != nil || got.Provider != "GOOGLE" || got.SubjectID != "subject" {
				t.Fatalf("valid identity: %v", err)
			}
		} else if !errors.Is(err, application.ErrProviderIdentity) {
			t.Fatalf("claims %#v: %v", tc, err)
		}
	}
}

func TestAuthorizationParameters(t *testing.T) {
	google := NewGoogle(config.Auth{GoogleAllowedDomain: "ku.th"})
	if _, err := google.AuthorizationURL("state", "verifier", "nonce"); !errors.Is(err, application.ErrProviderUnavailable) {
		t.Fatal(err)
	}
	google.oauth.ClientID = "test-client"
	google.oauth.ClientSecret = "test-secret"
	target, err := google.AuthorizationURL("state", "verifier", "nonce")
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(target)
	if err != nil {
		t.Fatal(err)
	}
	q := parsed.Query()
	if q.Get("state") != "state" || q.Get("nonce") != "nonce" || q.Get("hd") != "ku.th" ||
		q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" || q.Has("code_verifier") {
		t.Fatalf("parameters %v", q)
	}
}
