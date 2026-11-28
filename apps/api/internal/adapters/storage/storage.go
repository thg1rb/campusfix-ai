package storage

import (
	"errors"
	"strings"
	"unicode"

	"github.com/thg1rb/ku-spot/apps/api/internal/modules/media/application"
)

var (
	ErrObjectNotFound = application.ErrObjectNotFound
	ErrInvalidKey     = errors.New("invalid storage object key")
)

func validateKey(key string) error {
	if key == "" || len(key) > 1024 || strings.HasPrefix(key, "/") || strings.Contains(key, "..") ||
		strings.ContainsRune(key, '\\') || strings.ContainsFunc(key, unicode.IsControl) {
		return ErrInvalidKey
	}
	for _, part := range strings.Split(key, "/") {
		if part == "" || part == "." {
			return ErrInvalidKey
		}
	}
	return nil
}
