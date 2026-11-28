package bootstrap

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/thg1rb/ku-spot/apps/api/docs"
	"github.com/thg1rb/ku-spot/apps/api/internal/config"
)

func openAPIApp(t *testing.T, enabled bool) *fiber.App {
	t.Helper()
	app, err := New(config.Config{
		DatabaseURL:    "postgresql://kuspot@127.0.0.1:1/kuspot?sslmode=disable",
		AIURL:          "http://127.0.0.1:1/healthz",
		Auth:           config.Auth{AppBaseURL: "http://localhost:3000"},
		SwaggerEnabled: enabled,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := app.Database.Close(); err != nil {
			t.Error(err)
		}
	})
	return app.Server
}

func TestOpenAPIContract(t *testing.T) {
	openapi3.DefineStringFormatValidator("uuid", openapi3.NewCallbackValidator(func(value string) error {
		_, err := uuid.Parse(value)
		return err
	}))
	openapi3.DefineStringFormatValidator("uri", openapi3.NewCallbackValidator(func(value string) error {
		_, err := url.ParseRequestURI(value)
		return err
	}))
	openapi3.DefineStringFormatValidator("email", openapi3.NewRegexpFormatValidator(openapi3.FormatOfStringForEmail))

	loader := openapi3.NewLoader()
	doc, err := loader.LoadFromData(docs.OpenAPIV1YAML)
	if err != nil {
		t.Fatal(err)
	}
	if err := doc.Validate(t.Context(), openapi3.EnableSchemaFormatValidation(),
		openapi3.EnableSchemaPatternValidation(), openapi3.EnableSchemaDefaultsValidation(),
		openapi3.EnableExamplesValidation(), openapi3.EnableMultiError()); err != nil {
		t.Fatal(err)
	}

	routes := make(map[string]bool)
	parameters := regexp.MustCompile(`:([A-Za-z_][A-Za-z0-9_]*)`)
	for _, route := range openAPIApp(t, true).GetRoutes(true) {
		if !ignoreOpenAPIRoute(route.Method, route.Path) {
			path := parameters.ReplaceAllString(route.Path, `{${1}}`)
			routes[route.Method+" "+path] = true
		}
	}

	ids := make(map[string]string)
	for path, item := range doc.Paths.Map() {
		for method, operation := range item.Operations() {
			if ignoreOpenAPIRoute(method, path) {
				continue
			}
			key := method + " " + path
			if !routes[key] {
				t.Errorf("documented operation has no route: %s", key)
			}
			delete(routes, key)
			if previous, exists := ids[operation.OperationID]; exists {
				t.Errorf("%s duplicates operationId %q used by %s", key, operation.OperationID, previous)
			}
			ids[operation.OperationID] = key
			t.Run(key, func(t *testing.T) {
				checkOpenAPIOperation(t, path, operation, doc.Security)
			})
		}
	}
	for key := range routes {
		t.Errorf("registered route has no OpenAPI operation: %s", key)
	}
}

func ignoreOpenAPIRoute(method, path string) bool {
	return method == http.MethodHead || method == http.MethodOptions ||
		path == "/openapi.yaml" || path == "/swagger" || strings.HasPrefix(path, "/swagger/")
}

func checkOpenAPIOperation(t *testing.T, path string, op *openapi3.Operation, globalSecurity openapi3.SecurityRequirements) {
	t.Helper()
	if strings.TrimSpace(op.OperationID) == "" || strings.TrimSpace(op.Summary) == "" ||
		strings.TrimSpace(op.Description) == "" || len(op.Tags) == 0 {
		t.Error("operationId, summary, description, and tags are required")
	}

	for _, tag := range op.Tags {
		if strings.TrimSpace(tag) == "" {
			t.Error("operation tags must have names")
		}
	}

	isAPI := strings.HasPrefix(path, "/api/v1/")
	hasSuccess := false
	for status, response := range op.Responses.Map() {
		if response.Value.Description == nil || strings.TrimSpace(*response.Value.Description) == "" {
			t.Errorf("response %s needs a description", status)
		}
		if len(status) == 3 && (status[0] == '2' || status[0] == '3') {
			hasSuccess = true
		}
		if isAPI && len(status) == 3 && (status[0] == '4' || status[0] == '5') {
			checkErrorExamples(t, status, response.Value)
		}
	}
	if !hasSuccess {
		t.Error("at least one success or redirect response is required")
	}
	if !isAPI {
		return
	}
	required := []int{500}
	security := globalSecurity
	if op.Security != nil {
		security = *op.Security
	}
	for _, requirement := range security {
		if len(requirement) > 0 {
			required = append(required, 401)
			break
		}
	}
	if op.RequestBody != nil {
		required = append(required, 400, 415)
	}
	for _, status := range required {
		if op.Responses.Value(strconv.Itoa(status)) == nil {
			t.Errorf("response %d is required", status)
		}
	}
}

func checkErrorExamples(t *testing.T, status string, response *openapi3.Response) {
	t.Helper()
	media := response.Content.Get("application/json")
	if media == nil || media.Schema == nil || media.Schema.Ref != "#/components/schemas/ErrorEnvelope" {
		t.Errorf("response %s must use the JSON ErrorEnvelope schema", status)
		return
	}
	if len(media.Examples) == 0 {
		t.Errorf("response %s needs named error code examples", status)
	}
	for name, example := range media.Examples {
		value, ok := example.Value.Value.(map[string]any)
		if !ok {
			t.Errorf("response %s example %s needs an error envelope", status, name)
			continue
		}
		body, _ := value["error"].(map[string]any)
		if body["code"] != name {
			t.Errorf("response %s example %s must match its error code, got %v", status, name, body["code"])
		}
	}
}

func TestSwaggerHTTP(t *testing.T) {
	for _, enabled := range []bool{true, false} {
		t.Run(strconv.FormatBool(enabled), func(t *testing.T) {
			app := openAPIApp(t, enabled)
			for _, path := range []string{
				"/swagger", "/swagger/", "/swagger/index.html", "/swagger/swagger-ui-bundle.js", "/swagger/swagger-ui-standalone-preset.js",
				"/swagger/swagger-ui.css", "/openapi.yaml", "/swagger/missing", "/healthz", "/readyz", "/api/v1/me",
			} {
				t.Run(path, func(t *testing.T) {
					res, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
					if err != nil {
						t.Fatal(err)
					}
					defer func() {
						if err := res.Body.Close(); err != nil {
							t.Error(err)
						}
					}()
					want := http.StatusNotFound
					switch {
					case path == "/healthz":
						want = http.StatusOK
					case path == "/readyz":
						want = http.StatusServiceUnavailable
					case path == "/api/v1/me":
						want = http.StatusUnauthorized
					case enabled && (path == "/swagger/" || path == "/swagger/index.html"):
						want = http.StatusTemporaryRedirect
					case enabled && path != "/swagger/missing":
						want = http.StatusOK
					}
					if res.StatusCode != want {
						t.Fatalf("status %d, want %d", res.StatusCode, want)
					}
					if want == http.StatusTemporaryRedirect && res.Header.Get("Location") != "/swagger" {
						t.Errorf("unexpected swagger redirect: %q", res.Header.Get("Location"))
					}
					if enabled && path == "/swagger" {
						body, err := io.ReadAll(res.Body)
						if err != nil || !strings.HasPrefix(res.Header.Get("Content-Type"), "text/html") ||
							!bytes.Contains(body, []byte("SwaggerUIBundle")) ||
							!bytes.Contains(body, []byte("/openapi.yaml")) ||
							!bytes.Contains(body, []byte("/swagger/swagger-ui.css")) {
							t.Fatalf("invalid Swagger page: %v\n%s", err, body)
						}
					}
					if enabled && path == "/openapi.yaml" {
						body, err := io.ReadAll(res.Body)
						if err != nil || !bytes.Equal(body, docs.OpenAPIV1YAML) ||
							res.Header.Get("Content-Type") != "application/yaml; charset=utf-8" ||
							res.Header.Get("Cache-Control") != "no-store" {
							t.Fatalf("unexpected spec response: %v, headers %v", err, res.Header)
						}
					}
					if path == "/api/v1/me" {
						var body struct{ Error struct{ Code string } }
						if err := json.NewDecoder(res.Body).Decode(&body); err != nil || body.Error.Code != "UNAUTHENTICATED" {
							t.Fatalf("expected authentication error, got %q (%v)", body.Error.Code, err)
						}
					}
				})
			}
		})
	}
}
