package storage

import (
	"bytes"
	"context"
	"sync"
)

type MemoryStore struct {
	mu      sync.RWMutex
	objects map[string][]byte
}

func NewMemory() *MemoryStore { return &MemoryStore{objects: make(map[string][]byte)} }

func (s *MemoryStore) EnsureBucket(ctx context.Context) error { return ctx.Err() }

func (s *MemoryStore) Put(ctx context.Context, key, _ string, data []byte) error {
	if err := validateKey(key); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.objects[key] = bytes.Clone(data)
	return nil
}

func (s *MemoryStore) Get(ctx context.Context, key string) ([]byte, error) {
	if err := validateKey(key); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	data, ok := s.objects[key]
	if !ok {
		return nil, ErrObjectNotFound
	}
	return bytes.Clone(data), nil
}

func (s *MemoryStore) Delete(ctx context.Context, key string) error {
	if err := validateKey(key); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.objects, key)
	return nil
}
