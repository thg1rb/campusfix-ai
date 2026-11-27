package numbering

import (
	"context"
	"errors"
	"fmt"
	"time"
	_ "time/tzdata"

	"github.com/thg1rb/ku-spot/apps/api/internal/platform/database"
)

type Service struct {
	db   *database.Connection
	now  func() time.Time
	zone *time.Location
}

func New(db *database.Connection, now func() time.Time) (*Service, error) {
	zone, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		return nil, fmt.Errorf("load numbering timezone: %w", err)
	}
	return &Service{db: db, now: now, zone: zone}, nil
}

func (s *Service) NextNumber(ctx context.Context, kind string) (string, error) {
	if kind != "RPT" && kind != "TKT" {
		return "", errors.New("unsupported record kind")
	}
	year := s.now().In(s.zone).Year()
	var value int
	result := s.db.DB(ctx).Raw(`
		INSERT INTO record_sequences (kind, year, last_value) VALUES (?, ?, 1)
		ON CONFLICT (kind, year) DO UPDATE SET last_value = record_sequences.last_value + 1, updated_at = now()
		WHERE record_sequences.last_value < 99999 RETURNING last_value`, kind, year).Scan(&value)
	if result.Error != nil {
		return "", fmt.Errorf("allocate record number: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return "", errors.New("record sequence exhausted")
	}
	return fmt.Sprintf("%s-%04d-%05d", kind, year, value), nil
}
