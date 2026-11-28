package http

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	identityHTTP "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/adapters/inbound/http"
	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	media "github.com/thg1rb/ku-spot/apps/api/internal/modules/media/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/reports/application"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/reports/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/apperror"
	platform "github.com/thg1rb/ku-spot/apps/api/internal/platform/http"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
)

type field[T any] struct {
	set   bool
	value *T
}

func (f *field[T]) UnmarshalJSON(raw []byte) error {
	f.set = true
	return json.Unmarshal(raw, &f.value)
}

type fields struct {
	Description        field[string]   `json:"description"`
	LocationID         field[string]   `json:"locationId"`
	LocationName       field[string]   `json:"locationName"`
	LocationDetailNote field[string]   `json:"locationDetailNote"`
	Lat                field[float64]  `json:"lat"`
	Lng                field[float64]  `json:"lng"`
	ImageIDs           field[[]string] `json:"imageIds"`
}

func parseID(input string) (string, error) {
	id, err := uuid.Parse(input)
	if err != nil || len(input) != 36 || id == uuid.Nil {
		return "", apperror.Invalid
	}
	return id.String(), nil
}

func decodeInput(c fiber.Ctx) (application.Input, error) {
	var body *fields
	if err := platform.DecodeJSON(c, &body); err != nil {
		return application.Input{}, err
	}
	if body == nil || body.Description.set && body.Description.value == nil ||
		body.ImageIDs.set && body.ImageIDs.value == nil {
		return application.Input{}, apperror.Invalid
	}
	if body.LocationID.value != nil {
		id, err := parseID(*body.LocationID.value)
		if err != nil {
			return application.Input{}, err
		}
		body.LocationID.value = &id
	}
	if body.ImageIDs.value != nil {
		for i, raw := range *body.ImageIDs.value {
			id, err := parseID(raw)
			if err != nil {
				return application.Input{}, err
			}
			(*body.ImageIDs.value)[i] = id
		}
	}
	return application.Input{
		Complete: body.Description.set && body.LocationName.set && body.Lat.set && body.Lng.set,
		ImageIDs: body.ImageIDs.value,
		Apply: func(r *domain.Report) {
			if body.Description.set {
				r.Description = *body.Description.value
			}
			applyField(&r.Location.ID, body.LocationID)
			applyField(&r.Location.Name, body.LocationName)
			applyField(&r.Location.DetailNote, body.LocationDetailNote)
			applyField(&r.Location.Lat, body.Lat)
			applyField(&r.Location.Lng, body.Lng)
		},
	}, nil
}

func applyField[T any](target **T, input field[T]) {
	if input.set {
		*target = input.value
	}
}

func Register(router fiber.Router, service *application.Service, auth *identityHTTP.Handler) {
	router.Get("/my-reports", auth.OptionalAuth, identityHTTP.RequireAuth, identityHTTP.RejectAdminOperational, list(service))
	router.Get("/reports/:id", auth.OptionalAuth, identityHTTP.RequireAuth, identityHTTP.RejectAdminOperational, detail(service))
	write := func(method, path string, handler fiber.Handler) {
		router.Add([]string{method}, "/reports"+path, auth.CheckWriteOrigin, auth.OptionalAuth,
			identityHTTP.RequireAuth, identityHTTP.RejectAdminOperational, identityHTTP.RequireRoles(identity.Reporter), handler)
	}
	write(fiber.MethodPost, "/drafts", create(service.CreateDraft))
	write(fiber.MethodPost, "", create(service.CreateAndSubmit))
	write(fiber.MethodPatch, "/:id/draft", update(service.UpdateDraft))
	write(fiber.MethodPost, "/:id/submit", update(service.SubmitDraft))
	write(fiber.MethodPatch, "/:id", update(service.EditPendingReport))
	write(fiber.MethodPost, "/:id/cancel", func(c fiber.Ctx) error {
		id, err := parseID(c.Params("id"))
		if err != nil {
			return err
		}
		var empty *struct{}
		if err := platform.DecodeJSON(c, &empty); err != nil {
			return err
		}
		if empty == nil {
			return apperror.Invalid
		}
		actor, _ := identityHTTP.Actor(c)
		report, err := service.CancelPendingReport(c.Context(), actor, id)
		return respond(c, report, err, 200)
	})
}

func create(save func(context.Context, identity.User, application.Input) (domain.Report, error)) fiber.Handler {
	return func(c fiber.Ctx) error {
		input, err := decodeInput(c)
		if err != nil {
			return err
		}
		actor, _ := identityHTTP.Actor(c)
		report, err := save(c.Context(), actor, input)
		return respond(c, report, err, 201)
	}
}

func update(save func(context.Context, identity.User, string, application.Input) (domain.Report, error)) fiber.Handler {
	return func(c fiber.Ctx) error {
		id, err := parseID(c.Params("id"))
		if err != nil {
			return err
		}
		input, err := decodeInput(c)
		if err != nil {
			return err
		}
		actor, _ := identityHTTP.Actor(c)
		report, err := save(c.Context(), actor, id, input)
		return respond(c, report, err, 200)
	}
}

func detail(service *application.Service) fiber.Handler {
	return func(c fiber.Ctx) error {
		id, err := parseID(c.Params("id"))
		if err != nil {
			return err
		}
		actor, _ := identityHTTP.Actor(c)
		report, err := service.GetReport(c.Context(), actor, id)
		return respond(c, report, err, 200)
	}
}

func list(service *application.Service) fiber.Handler {
	return func(c fiber.Ctx) error {
		page, err := pagination.Parse(c.Query("page"), c.Query("pageSize"))
		if err != nil {
			return err
		}
		filter := application.Filter{Status: domain.Status(c.Query("status")), Search: strings.TrimSpace(c.Query("q")), ReportNumber: c.Query("reportNumber")}
		if filter.Status != "" && !filter.Status.Valid() {
			return apperror.Invalid
		}
		if strings.ContainsRune(filter.Search, 0) || strings.ContainsRune(filter.ReportNumber, 0) {
			return apperror.Invalid
		}
		actor, _ := identityHTTP.Actor(c)
		result, counts, err := service.ListMyReports(c.Context(), actor, filter, page)
		if err != nil {
			return mapError(err)
		}
		items := make([]fiber.Map, 0, len(result.Items))
		for _, report := range result.Items {
			items = append(items, project(report))
		}
		return c.JSON(fiber.Map{"items": items, "pagination": result.Pagination,
			"counts": fiber.Map{"total": counts.Total, "draft": counts.Draft, "pendingReview": counts.PendingReview,
				"confirmed": counts.Confirmed, "rejected": counts.Rejected, "cancelled": counts.Cancelled}})
	}
}

func respond(c fiber.Ctx, report domain.Report, err error, status int) error {
	if err != nil {
		return mapError(err)
	}
	return c.Status(status).JSON(project(report))
}

func project(r domain.Report) fiber.Map {
	var location fiber.Map
	l := r.Location
	if l.ID != nil || l.Name != nil || l.DetailNote != nil || l.Lat != nil {
		location = fiber.Map{"locationId": l.ID, "locationName": l.Name, "detailNote": l.DetailNote, "lat": l.Lat, "lng": l.Lng}
	}
	images := make([]fiber.Map, 0, len(r.Images))
	for _, img := range r.Images {
		images = append(images, fiber.Map{"id": img.ID, "fileName": img.FileName, "mimeType": img.MIMEType, "sizeBytes": img.SizeBytes,
			"sortOrder": img.SortOrder, "previewUrl": img.PreviewURL})
	}
	return fiber.Map{"id": r.ID, "reporterId": r.ReporterID, "reportNumber": r.ReportNumber, "status": r.Status, "version": r.Version,
		"description": r.Description, "location": location, "images": images, "latestAiRun": nil, "aiGeneratedTitle": r.AIGeneratedTitle,
		"requestedTargetTicketId": r.RequestedTargetTicketID, "ticketId": r.TicketID, "rejectionReason": r.RejectionReason,
		"reviewedBy": r.ReviewedBy, "reviewedAt": r.ReviewedAt, "submittedAt": r.SubmittedAt, "cancelledAt": r.CancelledAt,
		"createdAt": r.CreatedAt.UTC(), "updatedAt": r.UpdatedAt.UTC()}
}

func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrInactive):
		return apperror.Unauthenticated
	case errors.Is(err, domain.ErrAdmin):
		return identityHTTP.AdminNonOperational
	case errors.Is(err, domain.ErrForbidden), errors.Is(err, media.ErrForbidden):
		return apperror.Forbidden
	case errors.Is(err, domain.ErrNotFound):
		return apperror.NotFound
	case errors.Is(err, domain.ErrTransition):
		return apperror.New(409, "TRANSITION_FORBIDDEN", "The current report status does not allow this action.")
	case errors.Is(err, domain.ErrLocationUnavailable):
		return apperror.New(422, "LOCATION_UNAVAILABLE", "Select an active campus location.")
	case errors.Is(err, domain.ErrInvalid), errors.Is(err, media.ErrInvalidBinding), errors.Is(err, media.ErrNotFound):
		return apperror.New(422, "VALIDATION_ERROR", "Check the report fields and attachments.")
	default:
		return err
	}
}
