package auth

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/thg1rb/ku-spot/apps/api/internal/config"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"golang.org/x/oauth2"
)

const issuer = "https://accounts.google.com"

type Google struct {
	oauth    oauth2.Config
	verifier *oidc.IDTokenVerifier
	domain   string
	client   *http.Client
}

func NewGoogle(settings config.Auth) *Google {
	client := &http.Client{
		Timeout:       3 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}
	ctx := oidc.ClientContext(context.Background(), client)
	keys := oidc.NewRemoteKeySet(ctx, "https://www.googleapis.com/oauth2/v3/certs")
	return &Google{
		oauth: oauth2.Config{
			ClientID: settings.GoogleClientID, ClientSecret: settings.GoogleClientSecret, RedirectURL: settings.GoogleRedirectURL,
			Scopes: []string{oidc.ScopeOpenID, "email", "profile"},
			Endpoint: oauth2.Endpoint{
				AuthURL: issuer + "/o/oauth2/v2/auth", TokenURL: "https://oauth2.googleapis.com/token",
				AuthStyle: oauth2.AuthStyleInParams,
			},
		},
		verifier: oidc.NewVerifier(issuer, trackedKeySet{keys}, &oidc.Config{ClientID: settings.GoogleClientID}),
		domain:   settings.GoogleAllowedDomain, client: client,
	}
}

func (g *Google) enabled() bool { return g.oauth.ClientID != "" && g.oauth.ClientSecret != "" }

func (g *Google) AuthorizationURL(state, verifier, nonce string) (string, error) {
	if !g.enabled() {
		return "", application.ErrProviderUnavailable
	}
	return g.oauth.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier), oidc.Nonce(nonce),
		oauth2.SetAuthURLParam("hd", g.domain)), nil
}

type googleClaims struct {
	Email        string `json:"email"`
	Verified     bool   `json:"email_verified"`
	HostedDomain string `json:"hd"`
	Name         string `json:"name"`
	Picture      string `json:"picture"`
}

func (g *Google) Exchange(ctx context.Context, code, verifier, nonce string) (domain.ExternalIdentity, error) {
	empty := domain.ExternalIdentity{}
	if !g.enabled() {
		return empty, application.ErrProviderUnavailable
	}
	ctx = oidc.ClientContext(ctx, g.client)
	token, err := g.oauth.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		var response *oauth2.RetrieveError
		if errors.As(err, &response) && response.ErrorCode == "invalid_grant" {
			return empty, application.ErrProviderDenied
		}
		return empty, application.ErrProviderUnavailable
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok {
		return empty, application.ErrProviderIdentity
	}
	idToken, err := g.verifyToken(ctx, raw)
	if err != nil {
		return empty, err
	}
	if subtle.ConstantTimeCompare([]byte(nonce), []byte(idToken.Nonce)) != 1 {
		return empty, application.ErrProviderIdentity
	}
	var claims googleClaims
	if err := idToken.Claims(&claims); err != nil {
		return empty, application.ErrProviderIdentity
	}
	return g.normalize(idToken.Subject, claims)
}

type keyErrorContextKey struct{}

type trackedKeySet struct{ oidc.KeySet }

func (keys trackedKeySet) VerifySignature(ctx context.Context, jwt string) ([]byte, error) {
	payload, err := keys.KeySet.VerifySignature(ctx, jwt)
	if cause, ok := ctx.Value(keyErrorContextKey{}).(*error); ok {
		*cause = err
	}
	return payload, err
}

func (g *Google) verifyToken(ctx context.Context, raw string) (*oidc.IDToken, error) {
	var keyErr error
	// go-oidc formats key errors with %v, so capture the original error at the key-set boundary.
	token, err := g.verifier.Verify(context.WithValue(ctx, keyErrorContextKey{}, &keyErr), raw)
	if err == nil {
		return token, nil
	}
	if keyErr != nil {
		var network net.Error
		// The pinned RemoteKeySet uses this prefix for fetch and response parsing failures.
		if errors.Is(keyErr, context.DeadlineExceeded) || errors.Is(keyErr, context.Canceled) ||
			errors.As(keyErr, &network) || strings.HasPrefix(keyErr.Error(), "fetching keys ") {
			return nil, fmt.Errorf("%w: %w", application.ErrProviderUnavailable, keyErr)
		}
	}
	return nil, application.ErrProviderIdentity
}

func (g *Google) normalize(subject string, claims googleClaims) (domain.ExternalIdentity, error) {
	email := strings.ToLower(strings.TrimSpace(claims.Email))
	local, domainName, valid := strings.Cut(email, "@")
	campus := valid && local != "" && strings.EqualFold(domainName, g.domain)
	if subject == "" || !campus || !claims.Verified || !strings.EqualFold(claims.HostedDomain, g.domain) {
		return domain.ExternalIdentity{}, application.ErrProviderIdentity
	}
	name := strings.TrimSpace(claims.Name)
	if name == "" {
		name = local
	}
	return domain.ExternalIdentity{
		Provider: "GOOGLE", SubjectID: subject, Email: email, EmailVerified: claims.Verified,
		HostedDomain: strings.ToLower(g.domain), RealName: name, AvatarURL: claims.Picture,
	}, nil
}
