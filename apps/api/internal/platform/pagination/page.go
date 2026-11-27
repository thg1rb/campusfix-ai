package pagination

import (
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	"strconv"
)

type Query struct{ Page, Size int }

type Metadata struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"pageSize"`
	TotalItems int64 `json:"totalItems"`
	TotalPages int64 `json:"totalPages"`
}

type Result[T any] struct {
	Items      []T      `json:"items"`
	Pagination Metadata `json:"pagination"`
}

func (q Query) Offset() int { return (q.Page - 1) * q.Size }

func Parse(page, size string) (Query, error) {
	q := Query{Page: 1, Size: 25}
	var err error
	if page != "" {
		q.Page, err = strconv.Atoi(page)
		if err != nil || q.Page < 1 || q.Page > 21474836 {
			return q, apperror.Invalid
		}
	}
	if size != "" {
		q.Size, err = strconv.Atoi(size)
		if err != nil || (q.Size != 25 && q.Size != 50 && q.Size != 100) {
			return q, apperror.Invalid
		}
	}
	return q, nil
}

func New[T any](q Query, items []T, total int64) Result[T] {
	if items == nil {
		items = []T{}
	}
	return Result[T]{Items: items, Pagination: Metadata{
		Page: q.Page, PageSize: q.Size, TotalItems: total, TotalPages: (total + int64(q.Size) - 1) / int64(q.Size),
	}}
}
