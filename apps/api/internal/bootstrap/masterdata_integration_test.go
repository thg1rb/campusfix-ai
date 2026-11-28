package bootstrap

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/thg1rb/ku-spot/apps/api/internal/config"
	audit "github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/domain"
	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	masterDB "github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/adapters/outbound/postgres"
	master "github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/application"
	data "github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/domain"
	platform "github.com/thg1rb/ku-spot/apps/api/internal/platform/http"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
)

func TestMasterDataMigrationPostgres(t *testing.T) {
	db, dsn := testDatabaseWithURL(t)
	for _, direction := range []string{"down", "up"} {
		ctx, cancel := context.WithTimeout(t.Context(), 3*time.Minute)
		args := []string{"run", "github.com/pressly/goose/v3/cmd/goose@v3.30.1", "-dir", "migrations"}
		if direction == "down" {
			args = append(args, "down-to", "20261127081507")
		} else {
			args = append(args, "up-to", "20261128061015")
		}
		command := exec.CommandContext(ctx, "go", args...)
		command.Dir = "../.."
		command.Env = append(os.Environ(), "GOOSE_DRIVER=postgres", "GOOSE_DBSTRING="+dsn)
		output, err := command.CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("goose %s: %v\n%s", direction, err, strings.ReplaceAll(string(output), dsn, "[database URL]"))
		}
		var count int64
		if err := db.DB(t.Context()).Table("departments").Count(&count).Error; err != nil || count != 5 {
			t.Fatalf("goose %s changed departments: %d %v", direction, count, err)
		}
		if direction == "down" && (db.DB(t.Context()).Migrator().HasTable("categories") || db.DB(t.Context()).Migrator().HasTable("campus_locations")) {
			t.Fatal("master data tables survived rollback")
		}
	}
	categories, err := masterDB.Categories(db).Active(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	wantCategories := []string{"อาคารและสถานที่", "ไฟฟ้าและแสงสว่าง", "ความสะอาด", "อินเทอร์เน็ตและระบบสารสนเทศ", "ความปลอดภัย", "อื่น ๆ"}
	categoryNames := make(map[string]data.Category)
	for _, category := range categories {
		categoryNames[category.Name] = category
	}
	if len(categories) != len(wantCategories) {
		t.Fatalf("seeded %d categories", len(categories))
	}
	for i, name := range wantCategories {
		category := categoryNames[name]
		if category.Description != name || category.ID != fmt.Sprintf("c9de655b-4f30-4fb6-8edf-%012d", 101+i) {
			t.Errorf("category seed %s: %+v", name, category)
		}
	}
	locations, err := masterDB.Locations(db).Active(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	wantLocations := []struct {
		name     string
		kind     data.LocationType
		lat, lng float64
	}{
		{"อาคารเรียนรวม 1 (ศร.1)", data.Building, 13.847187, 100.571153},
		{"อาคารเรียนรวม 3 (ศร.3)", data.Building, 13.849201, 100.569406},
		{"บริเวณหอพักนิสิตชาย", data.Building, 13.848696, 100.568118},
		{"สำนักหอสมุด มก.", data.Building, 13.847654, 100.571816},
		{"อาคารชูชาติ กำภู (คณะวิศวกรรมศาสตร์)", data.Building, 13.845555, 100.570083},
		{"ศูนย์อาหารกลาง 1 (บาร์ใหม่)", data.CommonArea, 13.848753, 100.567067},
		{"อาคารจักรพันธ์เพ็ญศิริ", data.Building, 13.849743, 100.568307},
		{"ถนนชูชาติกำภู (แนวทางเดินหลัก)", data.Road, 13.848324, 100.570564},
		{"ลานจอดรถหน้าอาคารสำนักบริการคอมพิวเตอร์", data.ServicePoint, 13.844589, 100.567328},
		{"ลานอนุสาวรีย์สามบูรพาจารย์", data.ActivityPlaza, 13.842281, 100.573087},
	}
	locationNames := make(map[string]data.CampusLocation)
	for _, location := range locations {
		locationNames[location.Name] = location
	}
	if len(locations) != len(wantLocations) {
		t.Fatalf("seeded %d locations", len(locations))
	}
	for i, want := range wantLocations {
		location := locationNames[want.name]
		if location.Type != want.kind || location.Lat != want.lat || location.Lng != want.lng || location.ID != fmt.Sprintf("c9de655b-4f30-4fb6-8edf-%012d", 201+i) {
			t.Errorf("location seed %s: %+v", want.name, location)
		}
	}
}

func TestMasterDataHTTPPostgres(t *testing.T) {
	db := testDatabase(t)
	app := platform.NewServer(nil, nil)
	settings := config.Auth{AppBaseURL: "http://localhost:3000", BootstrapAdminEmails: []string{"admin@ku.th"}}
	registerIdentity(app, db, settings, provider{accounts: map[string]identity.ExternalIdentity{
		"admin": account("admin@ku.th", "admin"), "staff": account("staff@ku.th", "staff"), "inactive": account("inactive@ku.th", "inactive"),
	}}, time.Now)
	_, admin := login(t, app, "admin", "")
	_, staff := login(t, app, "staff", "")
	_, inactive := login(t, app, "inactive", "")
	staffID, staffName := me(t, app, staff)
	inactiveID, inactiveName := me(t, app, inactive)
	adminID, _ := me(t, app, admin)
	publicPath := "/api/v1/public/master-data"
	request := send(t, app, "GET", publicPath, "")
	request.want(t, 200, "อาคารเรียนรวม 1 (ศร.1)")
	if request.Header.Get("Cache-Control") != "no-store" {
		t.Fatal(request.Header)
	}
	for _, tc := range []struct{ collection, singular, table, extras, scope, query string }{
		{"categories", "CATEGORY", "categories", `,"description":"Scope 100% coverage"`, `,"description":"Updated"`, "q=100%25"},
		{"departments", "DEPARTMENT", "departments", `,"responsibilityScope":"Scope 100% coverage"`, `,"responsibilityScope":"Updated"`, "q=100%25"},
		{"locations", "LOCATION", "campus_locations", `,"type":"ROAD","lat":13.839,"lng":100.580`, `,"lat":13.858`, "q=TEST&type=ROAD"},
	} {
		t.Run(tc.collection, func(t *testing.T) {
			path := "/api/v1/admin/" + tc.collection
			for _, method := range []string{"GET", "POST", "PATCH"} {
				target := path
				if method == "PATCH" {
					target += "/" + uuid.NewString()
				}
				send(t, app, method, target, "").want(t, 401, "UNAUTHENTICATED")
				send(t, app, method, target, "", staff).want(t, 403, "FORBIDDEN")
			}
			for _, query := range []string{"page=0", "pageSize=1", "isActive=maybe", "type=garbage", "q=%00"} {
				send(t, app, "GET", path+"?"+query, "", admin).want(t, 400, "INVALID_REQUEST")
			}
			if tc.collection != "locations" {
				send(t, app, "GET", path+"?type=BUILDING", "", admin).want(t, 400, "INVALID_REQUEST")
			}
			for _, tc := range []struct {
				origin, media, code string
				status              int
			}{
				{"https://other.example", "application/json", "FORBIDDEN", 403},
				{"", "application/json", "FORBIDDEN", 403},
				{"http://localhost:3000", "text/plain", "UNSUPPORTED_MEDIA_TYPE", 415},
			} {
				req := httptest.NewRequest("POST", path, strings.NewReader("{}"))
				req.AddCookie(admin)
				req.Header.Set("Origin", tc.origin)
				req.Header.Set("Content-Type", tc.media)
				res, err := app.Test(req)
				if err != nil {
					t.Fatal(err)
				}
				var envelope struct{ Error struct{ Code string } }
				decodeErr := json.NewDecoder(res.Body).Decode(&envelope)
				closeErr := res.Body.Close()
				if decodeErr != nil || closeErr != nil || res.StatusCode != tc.status || envelope.Error.Code != tc.code {
					t.Fatalf("status %d code %s, decode %v close %v", res.StatusCode, envelope.Error.Code, decodeErr, closeErr)
				}
			}
			send(t, app, "POST", path, `{"unknown":true}`, admin).want(t, 400, "INVALID_REQUEST")
			send(t, app, "POST", path, `{"name":null}`, admin).want(t, 400, "INVALID_REQUEST")
			send(t, app, "POST", path, `{"name":" "`+tc.extras+`}`, admin).want(t, 422, "VALIDATION_ERROR")
			created := send(t, app, "POST", path, `{"name":"  Test Facility  "`+tc.extras+`}`, admin)
			created.want(t, 201, `"name":"Test Facility"`)
			var item struct{ ID string }
			if err := json.Unmarshal(created.body, &item); err != nil {
				t.Fatal(err)
			}
			if _, err := uuid.Parse(item.ID); err != nil {
				t.Fatal(err)
			}
			target := path + "/" + item.ID
			send(t, app, "POST", path, `{"name":"test FACILITY"`+tc.extras+`}`, admin).want(t, 409, "NAME_TAKEN")
			other := send(t, app, "POST", path, `{"name":"Other Facility"`+tc.extras+`}`, admin)
			other.want(t, 201, `"name":"Other Facility"`)
			var otherItem struct{ ID string }
			if err := json.Unmarshal(other.body, &otherItem); err != nil {
				t.Fatal(err)
			}
			otherTarget := path + "/" + otherItem.ID
			send(t, app, "PATCH", otherTarget, `{"name":"test FACILITY"}`, admin).want(t, 409, "NAME_TAKEN")

			timestamps := func() (time.Time, time.Time) {
				t.Helper()
				var row struct{ CreatedAt, UpdatedAt time.Time }
				if err := db.DB(t.Context()).Table(tc.table).Select("created_at, updated_at").
					Where("id = ?", item.ID).Take(&row).Error; err != nil {
					t.Fatal(err)
				}
				return row.CreatedAt, row.UpdatedAt
			}
			createdAt, firstUpdate := timestamps()
			if createdAt.IsZero() || !createdAt.Equal(firstUpdate) {
				t.Fatalf("insert timestamps = %v, %v; want identical database defaults", createdAt, firstUpdate)
			}
			send(t, app, "PATCH", path+"/bad", `{"isActive":false}`, admin).want(t, 400, "INVALID_REQUEST")
			send(t, app, "PATCH", path+"/"+uuid.NewString(), `{"isActive":false}`, admin).want(t, 404, "NOT_FOUND")
			for _, body := range []string{`{}`, `null`, `{"name":null,"isActive":true}`, `{"name":"next"} {}`} {
				send(t, app, "PATCH", target, body, admin).want(t, 400, "INVALID_REQUEST")
			}
			send(t, app, "GET", path+"?"+tc.query, "", admin).want(t, 200, item.ID)
			if tc.collection == "departments" {
				for _, id := range []string{staffID, inactiveID} {
					send(t, app, "PATCH", "/api/v1/admin/users/"+id, `{"roles":["DEPARTMENT_STAFF"],"departmentId":"`+item.ID+`"}`, admin).want(t, 200, item.ID)
				}
				send(t, app, "PATCH", "/api/v1/admin/users/"+inactiveID, `{"isActive":false}`, admin).want(t, 200, `"isActive":false`)
				result := send(t, app, "GET", path+"?q=coverage", "", admin)
				result.want(t, 200, `"staffUsernames":["`+staffName+`"]`)
				if strings.Contains(string(result.body), inactiveName) {
					t.Fatal("inactive staff leaked")
				}
			}
			if tc.collection == "locations" {
				send(t, app, "POST", path, `{"name":"Library","type":"BUILDING","lng":100.571816}`, admin).
					want(t, 422, "VALIDATION_ERROR")
				send(t, app, "POST", path, `{"name":"Library","type":"BUILDING","lat":13.847654}`, admin).
					want(t, 422, "VALIDATION_ERROR")
				send(t, app, "POST", path, `{"name":"Library","type":"BUILDING","lat":13.9,"lng":100.571816}`, admin).
					want(t, 422, "COORDINATES_OUT_OF_BOUNDS")
				send(t, app, "PATCH", target, `{"lat":13.9}`, admin).want(t, 422, "COORDINATES_OUT_OF_BOUNDS")
				send(t, app, "PATCH", target, `{"type":"PARKING"}`, admin).want(t, 422, "VALIDATION_ERROR")
			}
			send(t, app, "PATCH", target, `{"isActive":false`+tc.scope+`}`, admin).want(t, 200, `"isActive":false`)
			send(t, app, "PATCH", otherTarget, `{"name":"TEST facility"}`, admin).want(t, 409, "NAME_TAKEN")
			send(t, app, "GET", path+"?q=Other", "", admin).want(t, 200, otherItem.ID)

			_, updatedAt := timestamps()
			if !updatedAt.After(firstUpdate) {
				t.Fatalf("updated_at = %v; want a timestamp after %v", updatedAt, firstUpdate)
			}
			send(t, app, "PATCH", target, `{"name":" Test Facility ","isActive":false`+tc.scope+`}`, admin).
				want(t, 200, `"isActive":false`)
			if _, noOpUpdatedAt := timestamps(); !noOpUpdatedAt.Equal(updatedAt) {
				t.Fatalf("no-op changed updated_at from %v to %v", updatedAt, noOpUpdatedAt)
			}
			var updateCount int64
			err := db.DB(t.Context()).Table("audit_logs").
				Where("entity_id = ? AND action = ?", item.ID, "UPDATE_"+tc.singular).Count(&updateCount).Error
			if err != nil || updateCount != 1 {
				t.Fatalf("audit update count after no-op = %d, %v; want one entry", updateCount, err)
			}
			send(t, app, "GET", path+"?isActive=false", "", admin).want(t, 200, item.ID)
			if body := string(send(t, app, "GET", publicPath, "", admin).body); strings.Contains(body, item.ID) ||
				strings.Contains(body, "staffUsernames") || strings.Contains(body, staffName) || strings.Contains(body, "@ku.th") {
				t.Fatal("public master data leaked disabled records or staff identity")
			}
			send(t, app, "PATCH", target, `{"isActive":true}`, admin).want(t, 200, `"isActive":true`)
			send(t, app, "GET", publicPath, "").want(t, 200, item.ID)
			if tc.collection == "categories" {
				statuses := make(chan int, 2)
				for _, body := range []string{`{"name":"Renamed Facility"}`, `{"description":"Concurrent description"}`} {
					go func() {
						req := httptest.NewRequest("PATCH", target, strings.NewReader(body))
						req.AddCookie(admin)
						req.Header.Set("Origin", "http://localhost:3000")
						req.Header.Set("Content-Type", "application/json")
						res, err := app.Test(req)
						if err != nil {
							t.Error(err)
							statuses <- 0
							return
						}
						if err := res.Body.Close(); err != nil {
							t.Error(err)
						}
						statuses <- res.StatusCode
					}()
				}
				for range 2 {
					if status := <-statuses; status != 200 {
						t.Errorf("concurrent patch status: %d", status)
					}
				}
				send(t, app, "GET", path+"?q=Renamed", "", admin).want(t, 200, "Concurrent description")
			}
			for action, fragment := range map[string]string{"CREATE_": `"before":null`, "UPDATE_": `"before":{`} {
				send(t, app, "GET", "/api/v1/admin/audit-logs?entityType="+tc.singular+"&action="+action+tc.singular+"&actorUserId="+adminID, "", admin).
					want(t, 200, fragment)
			}
		})
	}
}

type failingMasterAudit struct{ err error }

func (a failingMasterAudit) Record(context.Context, audit.Entry) error { return a.err }

func TestMasterDataAuditRollbackPostgres(t *testing.T) {
	db := testDatabase(t)
	repo := masterDB.Categories(db)
	failure := errors.New("audit insert failed")
	service := master.New(repo, masterDB.Departments(db), masterDB.Locations(db), db, failingMasterAudit{failure})
	actor := identity.User{ID: uuid.NewString(), IsActive: true, Roles: []identity.Role{identity.Administrator}}
	ctx := t.Context()
	_, err := service.CreateCategory(ctx, actor, data.Category{Name: "Rolled back", IsActive: true})
	if !errors.Is(err, failure) {
		t.Fatalf("create: %v", err)
	}
	page, err := service.ListCategories(ctx, actor, master.Filter{Search: "Rolled back"}, pagination.Query{Page: 1, Size: 25})
	if err != nil || len(page.Items) != 0 {
		t.Fatalf("create was not rolled back: %+v, %v", page, err)
	}
	id := "c9de655b-4f30-4fb6-8edf-000000000101"
	_, err = service.UpdateCategory(ctx, actor, id, func(c *data.Category) { c.IsActive = false })
	if !errors.Is(err, failure) {
		t.Fatalf("update: %v", err)
	}
	category, err := repo.Lock(ctx, id)
	if err != nil || !category.IsActive {
		t.Fatalf("update was not rolled back: %+v, %v", category, err)
	}
}
