package auth

import (
	"context"
	"encoding/base64"
	"errors"
	"github.com/coreos/go-oidc/v3/oidc"
	"net/http"
	"net/http/httptest"
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

func TestNormalizedClaims(t *testing.T) {
	google := NewGoogle(config.Auth{GoogleAllowedDomain: "ku.th"})
	for _, tc := range []struct{ name, want string }{{"  Campus User  ", "Campus User"}, {" \t ", "sample"}} {
		identity, err := google.normalize("subject", googleClaims{
			Email: "  Sample@KU.TH  ", HostedDomain: "KU.Th", Verified: true, Name: tc.name,
		})
		if err != nil || identity.Email != "sample@ku.th" || identity.HostedDomain != "ku.th" ||
			identity.RealName != tc.want {
			t.Fatalf("normalized identity: %#v (%v)", identity, err)
		}
	}
}

func TestJWKSFailureClassification(t *testing.T) {
	for _, tc := range []struct {
		name     string
		status   int
		canceled bool
		want     error
	}{
		{"key endpoint unavailable", 503, false, application.ErrProviderUnavailable},
		{"no matching signature", 200, false, application.ErrProviderIdentity},
		{"request canceled", 200, true, application.ErrProviderUnavailable},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(`{"keys":[]}`))
			}))
			defer server.Close()
			google := NewGoogle(config.Auth{GoogleClientID: "test", GoogleClientSecret: "secret"})
			keys := oidc.NewRemoteKeySet(oidc.ClientContext(context.Background(), server.Client()), server.URL)
			google.verifier = oidc.NewVerifier(issuer, trackedKeySet{keys}, &oidc.Config{ClientID: "test"})
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			if tc.canceled {
				cancel()
			}
			part := base64.RawURLEncoding.EncodeToString
			token := part([]byte(`{"alg":"RS256","kid":"test"}`)) + "." +
				part([]byte(`{}`)) + "." + part([]byte{0})
			if _, err := google.verifyToken(ctx, token); !errors.Is(err, tc.want) {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
		})
	}
}
