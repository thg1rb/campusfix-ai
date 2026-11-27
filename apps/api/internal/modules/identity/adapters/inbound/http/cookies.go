package http

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/application"
)

const (
	sessionCookie     = "ku_spot_session"
	stateCookie       = "ku_spot_oauth"
	sessionCookiePath = "/api/v1"
	stateCookiePath   = "/api/v1/auth"
	stateLifetime     = 10 * time.Minute
)

type cookies struct {
	secret []byte
	secure bool
	now    func() time.Time
}

func newCookies(secret string, secure bool, now func() time.Time) cookies {
	if secret == "" {
		secret = application.RandomToken()
	}
	return cookies{secret: []byte(secret), secure: secure, now: now}
}

func (s cookies) sign(name, payload string) string {
	mac := hmac.New(sha256.New, s.secret)
	_, _ = mac.Write([]byte(name + ":" + payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s cookies) read(c fiber.Ctx, name string) string {
	payload, signature, ok := strings.Cut(c.Cookies(name), ".")
	if !ok || !hmac.Equal([]byte(signature), []byte(s.sign(name, payload))) {
		return ""
	}
	return payload
}

func (s cookies) write(c fiber.Ctx, name, path, payload string, lifetime time.Duration) {
	cookie := http.Cookie{
		Name: name, Path: path, HttpOnly: true, Secure: s.secure, SameSite: http.SameSiteLaxMode,
		MaxAge: -1, Expires: time.Unix(0, 0).UTC(),
	}
	if lifetime > 0 {
		cookie.Value = payload + "." + s.sign(name, payload)
		cookie.MaxAge = int(lifetime.Seconds())
		cookie.Expires = s.now().Add(lifetime).UTC()
	}
	c.Response().Header.Add("Set-Cookie", cookie.String())
}
