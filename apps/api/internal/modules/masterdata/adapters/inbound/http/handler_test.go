package http

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/thg1rb/ku-spot/apps/api/internal/config"
	identityHTTP "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/adapters/inbound/http"
	identityApp "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/application"
	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	platform "github.com/thg1rb/ku-spot/apps/api/internal/platform/http"
)

type adminSessionRepository struct {
	identityApp.Repository
}

func (adminSessionRepository) BySession(context.Context, string, time.Time) (identity.User, error) {
	return identity.User{ID: "admin", IsActive: true, Roles: []identity.Role{identity.Administrator}}, nil
}

func TestMasterDataRejectsInvalidRequests(t *testing.T) {
	t.Parallel()
	const (
		origin     = "http://localhost:3000"
		secret     = "test session secret"
		cookieName = "ku_spot_session"
		token      = "test-session"
		categories = "/admin/categories"
		category   = categories + "/c9de655b-4f30-4fb6-8edf-000000000101"
		locations  = "/admin/locations"
	)
	users := identityApp.New(adminSessionRepository{}, nil, nil, nil, time.Now)
	auth := identityHTTP.New(users, nil, config.Auth{AppBaseURL: origin, SessionSecret: secret}, time.Now)
	app := platform.NewServer(nil, nil)
	Register(app.Group("/api/v1"), application.New(nil, nil, nil, nil, nil), auth)

	mac := hmac.New(sha256.New, []byte(secret))
	if _, err := mac.Write([]byte(cookieName + ":" + token)); err != nil {
		t.Fatal(err)
	}
	session := &http.Cookie{
		Name: cookieName, Value: token + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)),
	}

	for _, tc := range []struct {
		name, method, path, media, body string
		status                          int
		code                            string
	}{
		{
			name: "unsupported media", method: "POST", path: categories, media: "text/plain", body: "{}",
			status: 415, code: "UNSUPPORTED_MEDIA_TYPE",
		},
		{
			name: "malformed JSON", method: "POST", path: categories, body: `{"name":`,
			status: 400, code: "INVALID_REQUEST",
		},
		{
			name: "unknown field", method: "POST", path: categories, body: `{"name":"Wi-Fi","other":true}`,
			status: 400, code: "INVALID_REQUEST",
		},
		{
			name: "isActive on create", method: "POST", path: categories, body: `{"name":"Wi-Fi","isActive":false}`,
			status: 400, code: "INVALID_REQUEST",
		},
		{
			name: "trailing JSON", method: "POST", path: categories, body: `{"name":"Wi-Fi"} {}`,
			status: 400, code: "INVALID_REQUEST",
		},
		{
			name: "null request", method: "POST", path: categories, body: "null",
			status: 400, code: "INVALID_REQUEST",
		},
		{
			name: "null field", method: "PATCH", path: category, body: `{"isActive":null}`,
			status: 400, code: "INVALID_REQUEST",
		},
		{
			name: "empty patch", method: "PATCH", path: category, body: "{}",
			status: 400, code: "INVALID_REQUEST",
		},
		{
			name: "invalid UUID", method: "PATCH", path: categories + "/bad", body: `{"isActive":false}`,
			status: 400, code: "INVALID_REQUEST",
		},
		{name: "invalid page", method: "GET", path: categories + "?page=0", status: 400, code: "INVALID_REQUEST"},
		{name: "invalid page size", method: "GET", path: categories + "?pageSize=5", status: 400, code: "INVALID_REQUEST"},
		{name: "invalid status", method: "GET", path: categories + "?isActive=maybe", status: 400, code: "INVALID_REQUEST"},
		{name: "invalid search", method: "GET", path: categories + "?q=%00", status: 400, code: "INVALID_REQUEST"},
		{name: "invalid location type", method: "GET", path: locations + "?type=building", status: 400, code: "INVALID_REQUEST"},
		{
			name: "type on categories", method: "GET", path: categories + "?type=BUILDING",
			status: 400, code: "INVALID_REQUEST",
		},
		{
			name: "type on departments", method: "GET", path: "/admin/departments?type=BUILDING",
			status: 400, code: "INVALID_REQUEST",
		},
		{
			name: "missing latitude", method: "POST", path: locations,
			body: `{"name":"Library","type":"BUILDING","lng":100.571816}`, status: 422, code: "VALIDATION_ERROR",
		},
		{
			name: "missing longitude", method: "POST", path: locations,
			body: `{"name":"Library","type":"BUILDING","lat":13.847654}`, status: 422, code: "VALIDATION_ERROR",
		},
		{
			name: "out of bounds", method: "POST", path: locations,
			body:   `{"name":"Library","type":"BUILDING","lat":13.9,"lng":100.571816}`,
			status: 422, code: "COORDINATES_OUT_OF_BOUNDS",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(tc.method, "/api/v1"+tc.path, strings.NewReader(tc.body))
			request.Header.Set("Origin", origin)
			media := "application/json"
			if tc.media != "" {
				media = tc.media
			}
			request.Header.Set("Content-Type", media)
			request.AddCookie(session)
			response, err := app.Test(request)
			if err != nil {
				t.Fatal(err)
			}
			var envelope struct{ Error struct{ Code string } }
			decodeErr := json.NewDecoder(response.Body).Decode(&envelope)
			closeErr := response.Body.Close()
			if decodeErr != nil || closeErr != nil {
				t.Fatalf("response body: decode=%v, close=%v", decodeErr, closeErr)
			}
			if response.StatusCode != tc.status || envelope.Error.Code != tc.code {
				t.Fatalf("got %d %s; want %d %s", response.StatusCode, envelope.Error.Code, tc.status, tc.code)
			}
		})
	}
}

func TestMapMasterDataError(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{name: "missing record", err: domain.ErrNotFound, status: 404, code: "NOT_FOUND"},
		{name: "duplicate name", err: domain.ErrNameTaken, status: 409, code: "NAME_TAKEN"},
		{name: "coordinate bounds", err: domain.ErrCoordinatesOutOfBounds, status: 422, code: "COORDINATES_OUT_OF_BOUNDS"},
		{name: "missing name", err: domain.ErrNameRequired, status: 422, code: "VALIDATION_ERROR"},
		{name: "long name", err: domain.ErrNameTooLong, status: 422, code: "VALIDATION_ERROR"},
		{name: "control character", err: domain.ErrNameControl, status: 422, code: "VALIDATION_ERROR"},
		{name: "invalid location type", err: domain.ErrLocationType, status: 422, code: "VALIDATION_ERROR"},
		{name: "invalid details", err: domain.ErrDetails, status: 422, code: "VALIDATION_ERROR"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := mapError(fmt.Errorf("master data: %w", tc.err))
			var response *apperror.Error
			if !errors.As(err, &response) || response.Status != tc.status || response.Code != tc.code {
				t.Fatalf("mapped %v to %+v; want %d %s", tc.err, err, tc.status, tc.code)
			}
		})
	}
	failure := errors.New("database unavailable")
	if got := mapError(failure); got != failure {
		t.Fatalf("unexpected errors must reach platform handler, got %v", got)
	}
}
