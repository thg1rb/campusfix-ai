package application

import (
	"context"
	"errors"
	"maps"
	"reflect"
	"testing"

	audit "github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/domain"
	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	data "github.com/thg1rb/ku-spot/apps/api/internal/modules/masterdata/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
)

type repositoryStub[T any] struct {
	Repository[T]
	active func(context.Context) ([]T, error)
	lock   func(context.Context, string) (T, error)
	insert func(context.Context, T) (T, error)
	update func(context.Context, T) error
}

func (r repositoryStub[T]) Active(ctx context.Context) ([]T, error) { return r.active(ctx) }

func (r repositoryStub[T]) Lock(ctx context.Context, id string) (T, error) {
	return r.lock(ctx, id)
}

func (r repositoryStub[T]) Insert(ctx context.Context, value T) (T, error) {
	return r.insert(ctx, value)
}

func (r repositoryStub[T]) Update(ctx context.Context, value T) error { return r.update(ctx, value) }

type transactionFunc func(context.Context, func(context.Context) error) error

func (fn transactionFunc) WithTx(ctx context.Context, run func(context.Context) error) error {
	return fn(ctx, run)
}

type auditFunc func(context.Context, audit.Entry) error

func (fn auditFunc) Record(ctx context.Context, entry audit.Entry) error { return fn(ctx, entry) }

func adminActor() identity.User {
	return identity.User{ID: "admin", IsActive: true, Roles: []identity.Role{identity.Administrator}}
}

func TestGetPublicMasterData(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	want := PublicMasterData{
		Categories:  []data.Category{{Name: "อาคารและสถานที่", IsActive: true}},
		Departments: []data.Department{{Name: "กองกายภาพและสิ่งแวดล้อม", IsActive: true}},
		Locations:   []data.CampusLocation{{Name: "สำนักหอสมุด มก.", IsActive: true}},
	}
	categories := repositoryStub[data.Category]{
		active: func(context.Context) ([]data.Category, error) { return want.Categories, nil },
	}
	departments := repositoryStub[data.Department]{
		active: func(context.Context) ([]data.Department, error) { return want.Departments, nil },
	}
	locations := repositoryStub[data.CampusLocation]{
		active: func(context.Context) ([]data.CampusLocation, error) { return want.Locations, nil },
	}
	service := New(categories, departments, locations, nil, nil)
	got, err := service.GetPublicMasterData(ctx)
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("public data = %+v, %v; want %+v", got, err, want)
	}

	failure := errors.New("active departments unavailable")
	departments.active = func(context.Context) ([]data.Department, error) { return nil, failure }
	service = New(categories, departments, nil, nil, nil)
	if _, err := service.GetPublicMasterData(ctx); !errors.Is(err, failure) {
		t.Fatalf("public data error = %v; want %v", err, failure)
	}
}

func TestMasterDataRequiresExclusiveAdministrator(t *testing.T) {
	t.Parallel()
	service := New(nil, nil, nil, nil, nil)
	departmentID := "department"
	for _, tc := range []struct {
		name  string
		actor identity.User
	}{
		{name: "reporter", actor: identity.User{IsActive: true, Roles: []identity.Role{identity.Reporter}}},
		{name: "inactive admin", actor: identity.User{Roles: []identity.Role{identity.Administrator}}},
		{name: "admin with department", actor: identity.User{
			IsActive: true, Roles: []identity.Role{identity.Administrator}, DepartmentID: &departmentID,
		}},
		{name: "admin with another role", actor: identity.User{
			IsActive: true, Roles: []identity.Role{identity.Administrator, identity.Reporter},
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := t.Context()
			_, listErr := service.ListCategories(ctx, tc.actor, Filter{}, pagination.Query{})
			_, createErr := service.CreateDepartment(ctx, tc.actor, data.Department{})
			_, updateErr := service.UpdateLocation(ctx, tc.actor, "location", nil)
			for operation, err := range map[string]error{"list": listErr, "create": createErr, "update": updateErr} {
				var response *apperror.Error
				if !errors.Is(err, apperror.Forbidden) || !errors.As(err, &response) || response.Status != 403 {
					t.Errorf("%s error = %v; want 403 FORBIDDEN", operation, err)
				}
			}
		})
	}
}

func TestCategoryValidationPreventsWrites(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	actor := adminActor()
	service := New(nil, nil, nil, nil, nil)
	if _, err := service.CreateCategory(ctx, actor, data.Category{Name: " "}); !errors.Is(err, data.ErrNameRequired) {
		t.Fatalf("create error = %v; want ErrNameRequired", err)
	}

	repo := repositoryStub[data.Category]{
		lock: func(context.Context, string) (data.Category, error) {
			return data.Category{ID: "category", Name: "Existing", IsActive: true}, nil
		},
	}
	service = New(repo, nil, nil, transactionFunc(func(ctx context.Context, run func(context.Context) error) error {
		return run(ctx)
	}), nil)
	for _, tc := range []struct {
		name  string
		apply func(*data.Category)
		want  error
	}{
		{name: "invalid name", apply: func(c *data.Category) { c.Name = "a\nb" }, want: data.ErrNameControl},
		{name: "ID mutation", apply: func(c *data.Category) { c.ID = "different" }, want: apperror.Invalid},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := service.UpdateCategory(t.Context(), actor, "category", tc.apply); !errors.Is(err, tc.want) {
				t.Fatalf("update error = %v; want %v", err, tc.want)
			}
		})
	}
}

func TestCategoryWritesAuditNormalizedChanges(t *testing.T) {
	t.Parallel()
	type transactionKey struct{}
	tx := transactionFunc(func(ctx context.Context, run func(context.Context) error) error {
		return run(context.WithValue(ctx, transactionKey{}, true))
	})
	requireTransaction := func(ctx context.Context) {
		t.Helper()
		if ctx.Value(transactionKey{}) != true {
			t.Fatal("operation ran outside the transaction")
		}
	}

	actor := adminActor()
	var stored data.Category
	var updates int
	entries := []audit.Entry{}
	repo := repositoryStub[data.Category]{
		insert: func(ctx context.Context, c data.Category) (data.Category, error) {
			requireTransaction(ctx)
			if c.ID != "" || !c.IsActive {
				t.Fatalf("unexpected create defaults: %+v", c)
			}
			c.ID = "category"
			stored = c
			return c, nil
		},
		lock: func(ctx context.Context, id string) (data.Category, error) {
			requireTransaction(ctx)
			if id != stored.ID {
				t.Fatalf("lock ID = %q; want %q", id, stored.ID)
			}
			return stored, nil
		},
		update: func(ctx context.Context, c data.Category) error {
			requireTransaction(ctx)
			stored = c
			updates++
			return nil
		},
	}
	service := New(repo, nil, nil, tx, auditFunc(func(ctx context.Context, entry audit.Entry) error {
		requireTransaction(ctx)
		entries = append(entries, entry)
		return nil
	}))

	created, err := service.CreateCategory(t.Context(), actor, data.Category{
		ID: "provided", Name: "  Campus buildings ", Description: "  Repairs  ",
	})
	wantCreated := data.Category{ID: "category", Name: "Campus buildings", Description: "Repairs", IsActive: true}
	if err != nil || created != wantCreated {
		t.Fatalf("created = %+v, %v; want %+v", created, err, wantCreated)
	}
	updated, err := service.UpdateCategory(t.Context(), actor, created.ID, func(c *data.Category) {
		c.Description = "  Walkway maintenance  "
		c.IsActive = false
	})
	wantUpdated := data.Category{ID: created.ID, Name: created.Name, Description: "Walkway maintenance"}
	if err != nil || updated != wantUpdated {
		t.Fatalf("updated = %+v, %v; want %+v", updated, err, wantUpdated)
	}
	unchanged, err := service.UpdateCategory(t.Context(), actor, created.ID, func(c *data.Category) {
		c.Description = " Walkway maintenance "
	})
	if err != nil || unchanged != wantUpdated || updates != 1 || len(entries) != 2 {
		t.Fatalf("no-op = %+v, %v; updates = %d, audit entries = %d", unchanged, err, updates, len(entries))
	}

	before := map[string]any{"name": "Campus buildings", "description": "Repairs", "isActive": true}
	after := map[string]any{"name": "Campus buildings", "description": "Walkway maintenance", "isActive": false}
	for i, want := range []struct {
		action        string
		before, after map[string]any
	}{
		{action: "CREATE_CATEGORY", after: before},
		{action: "UPDATE_CATEGORY", before: before, after: after},
	} {
		entry := entries[i]
		if entry.Action != want.action || entry.EntityType != "CATEGORY" || entry.EntityID != created.ID ||
			entry.ActorType != "USER" || entry.ActorUserID == nil || *entry.ActorUserID != actor.ID ||
			!reflect.DeepEqual(entry.ActorRoles, []string{"ADMINISTRATOR"}) {
			t.Errorf("unexpected audit entry: %+v", entry)
		}
		gotBefore, beforeOK := entry.Details["before"].(map[string]any)
		gotAfter, afterOK := entry.Details["after"].(map[string]any)
		if !beforeOK || !afterOK || !maps.Equal(gotBefore, want.before) || !maps.Equal(gotAfter, want.after) {
			t.Errorf("%s snapshots = %+v; want before=%v, after=%v", want.action, entry.Details, want.before, want.after)
		}
	}
}

func TestCategoryWriteErrorsReachTransactionBoundary(t *testing.T) {
	t.Parallel()
	failure := errors.New("write failed")
	for _, tc := range []struct {
		name  string
		stage string
	}{
		{name: "insert failure", stage: "insert"},
		{name: "lock failure", stage: "lock"},
		{name: "update failure", stage: "update"},
		{name: "create audit failure", stage: "create audit"},
		{name: "update audit failure", stage: "update audit"},
		{name: "commit failure", stage: "commit"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var txErr error
			tx := transactionFunc(func(ctx context.Context, run func(context.Context) error) error {
				txErr = run(ctx)
				if tc.stage == "commit" {
					return failure
				}
				return txErr
			})
			repo := repositoryStub[data.Category]{
				insert: func(_ context.Context, c data.Category) (data.Category, error) {
					c.ID = "category"
					if tc.stage == "insert" {
						return c, failure
					}
					return c, nil
				},
				lock: func(context.Context, string) (data.Category, error) {
					if tc.stage == "lock" {
						return data.Category{}, failure
					}
					return data.Category{ID: "category", Name: "Existing", IsActive: true}, nil
				},
				update: func(context.Context, data.Category) error {
					if tc.stage == "update" {
						return failure
					}
					return nil
				},
			}
			service := New(repo, nil, nil, tx, auditFunc(func(context.Context, audit.Entry) error {
				switch tc.stage {
				case "create audit", "update audit":
					return failure
				case "commit":
					return nil
				default:
					t.Fatal("recorded audit after a repository failure")
					return nil
				}
			}))
			var err error
			switch tc.stage {
			case "insert", "create audit", "commit":
				_, err = service.CreateCategory(t.Context(), adminActor(), data.Category{Name: "New"})
			default:
				_, err = service.UpdateCategory(t.Context(), adminActor(), "category", func(c *data.Category) {
					c.Name = "New"
				})
			}
			wantTxErr := failure
			if tc.stage == "commit" {
				wantTxErr = nil
			}
			if !errors.Is(err, failure) || !errors.Is(txErr, wantTxErr) {
				t.Fatalf("service error = %v, transaction callback error = %v; want %v, %v",
					err, txErr, failure, wantTxErr)
			}
		})
	}
}
