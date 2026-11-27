package domain

import (
	"errors"
	"strings"
	"testing"
)

func TestUsername(t *testing.T) {
	for _, tc := range []struct{ input, want string }{
		{"  Alpha_3  ", "Alpha_3"}, {"x-y", ""}, {"éto", ""}, {"ab", ""}, {strings.Repeat("a", 31), ""},
	} {
		got, err := NormalizeUsername(tc.input)
		if got != tc.want || (err != nil) != (tc.want == "") {
			t.Errorf("normalize %q = %q, %v", tc.input, got, err)
		}
	}
	if got := InitialUsername("First.Last@ku.th", 2); got != "first_last_2" {
		t.Fatal(got)
	}
	if len(InitialUsername(strings.Repeat("a", 90)+"@ku.th", 100)) != 30 {
		t.Fatal("username exceeds limit")
	}
}

func TestAccess(t *testing.T) {
	department := "dept"
	for _, tc := range []struct {
		roles []Role
		dept  *string
		want  error
	}{
		{[]Role{Administrator}, nil, nil},
		{[]Role{Administrator, Reporter}, nil, ErrExclusiveAdmin},
		{[]Role{Administrator}, &department, ErrExclusiveAdmin},
		{[]Role{Staff}, nil, ErrDepartmentRequired},
		{[]Role{Reporter}, &department, ErrSingleDepartment},
		{[]Role{Reporter, Staff}, &department, nil},
		{[]Role{Reporter, Reporter}, nil, ErrRoles},
		{nil, nil, ErrRoles},
	} {
		if err := ValidateAccess(tc.roles, tc.dept); !errors.Is(err, tc.want) {
			t.Errorf("%v: got %v, want %v", tc.roles, err, tc.want)
		}
	}
	admin := User{Roles: []Role{Administrator}, IsActive: true}
	demoted := User{Roles: []Role{Reporter}, IsActive: true}
	if !errors.Is(ProtectLastAdmin(admin, demoted, 1), ErrLastAdmin) {
		t.Fatal("demoted last admin")
	}
	if err := ProtectLastAdmin(admin, demoted, 2); err != nil {
		t.Fatal(err)
	}
}
