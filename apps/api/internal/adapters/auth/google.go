package auth

import (
	"context"
	"crypto/subtle"
	"errors"
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
		verifier: oidc.NewVerifier(issuer, keys, &oidc.Config{ClientID: settings.GoogleClientID}),
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
	idToken, err := g.verifier.Verify(ctx, raw)
	if err != nil || subtle.ConstantTimeCompare([]byte(nonce), []byte(idToken.Nonce)) != 1 {
		return empty, application.ErrProviderIdentity
	}
	var claims googleClaims
	if err := idToken.Claims(&claims); err != nil {
		return empty, application.ErrProviderIdentity
	}
	return g.normalize(idToken.Subject, claims)
}

func (g *Google) normalize(subject string, claims googleClaims) (domain.ExternalIdentity, error) {
	local, domainName, valid := strings.Cut(claims.Email, "@")
	campus := valid && local != "" && strings.EqualFold(domainName, g.domain)
	if subject == "" || !campus || !claims.Verified || claims.HostedDomain != g.domain {
		return domain.ExternalIdentity{}, application.ErrProviderIdentity
	}
	return domain.ExternalIdentity{
		Provider: "GOOGLE", SubjectID: subject, Email: claims.Email, EmailVerified: claims.Verified,
		HostedDomain: claims.HostedDomain, RealName: claims.Name, AvatarURL: claims.Picture,
	}, nil
}
