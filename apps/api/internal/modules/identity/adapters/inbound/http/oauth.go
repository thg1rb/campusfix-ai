package http

import (
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/url"
	"path"
	"strings"
	"time"
	"unicode"

	"github.com/gofiber/fiber/v3"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
)

type oauthState struct {
	State    string
	Verifier string
	Nonce    string
	Next     string
	Expires  time.Time
}

func unsafeCharacter(r rune) bool { return r == '\\' || unicode.IsControl(r) }

func safeNext(next string) string {
	if len(next) > 1024 || !strings.HasPrefix(next, "/") || strings.HasPrefix(next, "//") ||
		strings.ContainsFunc(next, unsafeCharacter) {
		return ""
	}
	u, err := url.Parse(next)
	if err != nil || u.IsAbs() || u.Host != "" || strings.HasPrefix(u.Path, "//") ||
		strings.ContainsFunc(u.Path, unsafeCharacter) {
		return ""
	}
	// Reject nested path encoding and authentication routes that could restart the flow.
	decoded := u.Path
	for {
		value, err := url.PathUnescape(decoded)
		if err != nil || strings.HasPrefix(value, "//") || strings.ContainsFunc(value, unsafeCharacter) {
			return ""
		}
		if value == decoded {
			break
		}
		decoded = value
	}
	clean := path.Clean(decoded)
	if clean == "/" || clean == "/login" || strings.HasPrefix(clean, "/login/") ||
		clean == "/api" || strings.HasPrefix(clean, "/api/") {
		return ""
	}
	return u.String()
}

func (h *Handler) login(c fiber.Ctx) error {
	state := oauthState{
		State: application.RandomToken(), Verifier: application.RandomToken(), Nonce: application.RandomToken(),
		Next: safeNext(c.Query("next")), Expires: h.now().Add(stateLifetime),
	}
	target, err := h.provider.AuthorizationURL(state.State, state.Verifier, state.Nonce)
	if errors.Is(err, application.ErrProviderUnavailable) {
		return apperror.Unavailable
	}
	if err != nil {
		return err
	}
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	h.cookies.write(c, stateCookie, stateCookiePath, base64.RawURLEncoding.EncodeToString(data), stateLifetime)
	return redirect(c, target)
}

func (h *Handler) callback(c fiber.Ctx) error {
	value, err := base64.RawURLEncoding.DecodeString(h.cookies.read(c, stateCookie))
	h.cookies.write(c, stateCookie, stateCookiePath, "", 0)
	var state oauthState
	if err != nil || json.Unmarshal(value, &state) != nil || !h.now().Before(state.Expires) ||
		subtle.ConstantTimeCompare([]byte(state.State), []byte(c.Query("state"))) != 1 || state.State == "" {
		return h.loginError(c, "INVALID_OAUTH_STATE")
	}
	if c.Query("error") != "" || c.Query("code") == "" {
		return h.loginError(c, "OAUTH_DENIED")
	}
	user, token, err := h.service.HandleOAuthCallback(c.Context(), h.provider, c.Query("code"), state.Verifier, state.Nonce)
	switch {
	case errors.Is(err, application.ErrProviderDenied):
		return h.loginError(c, "OAUTH_DENIED")
	case errors.Is(err, application.ErrProviderIdentity):
		return h.loginError(c, "INVALID_OAUTH_IDENTITY")
	case errors.Is(err, domain.ErrInactive):
		return h.loginError(c, "ACCOUNT_INACTIVE")
	case err != nil:
		return h.loginError(c, "SERVICE_UNAVAILABLE")
	}
	h.cookies.write(c, sessionCookie, sessionCookiePath, token, application.SessionLifetime)
	next := safeNext(state.Next)
	if next == "" {
		next = "/feed"
		if user.IsExclusiveAdmin() {
			next = "/admin"
		}
	}
	return redirect(c, h.origin+next)
}

func redirect(c fiber.Ctx, target string) error {
	c.Set("Referrer-Policy", "no-referrer")
	c.Set("Location", target)
	return c.SendStatus(fiber.StatusFound)
}

func (h *Handler) loginError(c fiber.Ctx, code string) error {
	return redirect(c, h.origin+"/login?error="+url.QueryEscape(code))
}
