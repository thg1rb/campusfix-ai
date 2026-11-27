package apperror

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
)

// Diagnostic records actionable error classifications without serializing untrusted error text.
func Diagnostic(err error) slog.Value {
	attrs := []slog.Attr{slog.String("type", fmt.Sprintf("%T", err))}
	cause := err
	for next := errors.Unwrap(cause); next != nil; next = errors.Unwrap(cause) {
		cause = next
	}
	attrs = append(attrs, slog.String("cause_type", fmt.Sprintf("%T", cause)))
	var network net.Error
	var database interface{ SQLState() string }
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		attrs = append(attrs, slog.String("reason", "deadline_exceeded"))
	case errors.Is(err, context.Canceled):
		attrs = append(attrs, slog.String("reason", "canceled"))
	case errors.As(err, &database):
		attrs = append(attrs, slog.String("sqlstate", database.SQLState()))
	case errors.As(err, &network):
		attrs = append(attrs, slog.Bool("network_timeout", network.Timeout()))
	}
	return slog.GroupValue(attrs...)
}
