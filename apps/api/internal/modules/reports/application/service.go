package application

import (
	"context"
	"log/slog"
	"slices"
	"time"

	"github.com/google/uuid"
	audit "github.com/thg1rb/ku-spot/apps/api/internal/modules/audit/domain"
	identity "github.com/thg1rb/ku-spot/apps/api/internal/modules/identity/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/modules/reports/domain"
	"github.com/thg1rb/ku-spot/apps/api/internal/platform/pagination"
)

type Filter struct {
	Status               domain.Status
	Search, ReportNumber string
}

type Input struct {
	Apply    func(*domain.Report)
	ImageIDs *[]string
	Complete bool
}

type Repository interface {
	Insert(context.Context, domain.Report) error
	Find(context.Context, string, bool) (domain.Report, error)
	Update(context.Context, domain.Report) error
	List(context.Context, string, Filter, pagination.Query) ([]domain.Report, int64, error)
	Counts(context.Context, string) (domain.ReportCounts, error)
	LockExpired(context.Context, time.Time, int) ([]ExpiredReport, error)
	Delete(context.Context, []string) error
}

type ExpiredReport struct {
	ID     string
	Status domain.Status
}

type Media interface {
	BindToReport(context.Context, string, string, []string) ([]string, error)
	ListByReportIDs(context.Context, []string) (map[string][]domain.AttachedImage, error)
	StorageKeysByReportIDs(context.Context, []string) ([]string, error)
	DeleteObjects(context.Context, []string)
}

type LocationLookup interface {
	IsActiveLocation(context.Context, string) (bool, error)
}

type TxManager interface {
	WithTx(context.Context, func(context.Context) error) error
}

type Numbering interface {
	NextNumber(context.Context, string) (string, error)
}

type AuditRecorder interface {
	Record(context.Context, audit.Entry) error
}

type TriageHook interface {
	OnReportSubmitted(context.Context, domain.Report)
	OnPendingReportEdited(context.Context, domain.Report)
}

type NoopTriageHook struct{}

func (NoopTriageHook) OnReportSubmitted(context.Context, domain.Report)     {}
func (NoopTriageHook) OnPendingReportEdited(context.Context, domain.Report) {}

type Service struct {
	repo      Repository
	tx        TxManager
	media     Media
	locations LocationLookup
	numbers   Numbering
	audit     AuditRecorder
	triage    TriageHook
	now       func() time.Time
}

func New(repo Repository, tx TxManager, media Media, locations LocationLookup, numbers Numbering, recorder AuditRecorder, triage TriageHook, now func() time.Time) *Service {
	return &Service{repo: repo, tx: tx, media: media, locations: locations, numbers: numbers, audit: recorder, triage: triage, now: now}
}

func authorize(actor identity.User, write bool) error {
	switch {
	case slices.Contains(actor.Roles, identity.Administrator):
		return domain.ErrAdmin
	case actor.ID == "" || !actor.IsActive:
		return domain.ErrInactive
	case write && !slices.Contains(actor.Roles, identity.Reporter):
		return domain.ErrForbidden
	default:
		return nil
	}
}

func (s *Service) CreateDraft(ctx context.Context, actor identity.User, input Input) (domain.Report, error) {
	return s.save(ctx, actor, "", "CREATE_DRAFT", input)
}

func (s *Service) UpdateDraft(ctx context.Context, actor identity.User, id string, patch Input) (domain.Report, error) {
	return s.save(ctx, actor, id, "UPDATE_DRAFT", patch)
}

func (s *Service) CreateAndSubmit(ctx context.Context, actor identity.User, input Input) (domain.Report, error) {
	return s.save(ctx, actor, "", "SUBMIT", input)
}

func (s *Service) SubmitDraft(ctx context.Context, actor identity.User, id string, overrides Input) (domain.Report, error) {
	return s.save(ctx, actor, id, "SUBMIT", overrides)
}

func (s *Service) EditPendingReport(ctx context.Context, actor identity.User, id string, input Input) (domain.Report, error) {
	return s.save(ctx, actor, id, "EDIT_PENDING", input)
}

func (s *Service) CancelPendingReport(ctx context.Context, actor identity.User, id string) (domain.Report, error) {
	return s.save(ctx, actor, id, "CANCEL", Input{})
}

func (s *Service) save(ctx context.Context, actor identity.User, id, action string, input Input) (domain.Report, error) {
	if err := authorize(actor, true); err != nil {
		return domain.Report{}, err
	}
	var report domain.Report
	var detached []string
	err := s.tx.WithTx(ctx, func(tx context.Context) error {
		now := s.now().UTC()
		if id == "" {
			report = domain.Report{ID: uuid.NewString(), ReporterID: actor.ID, Status: domain.Draft, Version: 1, CreatedAt: now}
		} else {
			var err error
			report, err = s.repo.Find(tx, id, true)
			if err != nil {
				return err
			}
			expected := domain.Draft
			if action == "EDIT_PENDING" || action == "CANCEL" {
				expected = domain.PendingReview
			}
			if err := report.Guard(actor.ID, expected); err != nil {
				return err
			}
		}

		report.UpdatedAt = now
		details := map[string]any{}
		if action == "CANCEL" {
			report.Cancel(now)
		} else {
			if err := s.apply(tx, &report, input, action, id == ""); err != nil {
				return err
			}
			switch action {
			case "SUBMIT":
				number, err := s.numbers.NextNumber(tx, "RPT")
				if err != nil {
					return err
				}
				report.Submit(number, now)
			case "EDIT_PENDING":
				details["previousVersion"] = report.Version
				report.Edit(now)
				details["newVersion"] = report.Version
			}
		}

		var err error
		if id == "" {
			err = s.repo.Insert(tx, report)
		} else {
			err = s.repo.Update(tx, report)
		}
		if err != nil {
			return err
		}
		if input.ImageIDs != nil {
			detached, err = s.media.BindToReport(tx, actor.ID, report.ID, *input.ImageIDs)
			if err != nil {
				return err
			}
		}
		if err := s.loadImages(tx, &report); err != nil {
			return err
		}
		roles := make([]string, 0, len(actor.Roles))
		for _, role := range actor.Roles {
			roles = append(roles, string(role))
		}
		return s.audit.Record(tx, audit.Entry{EntityType: "REPORT", EntityID: report.ID, Action: action,
			ActorType: "USER", ActorUserID: &actor.ID, ActorRoles: roles, DepartmentID: actor.DepartmentID, Details: details})
	})
	if err != nil {
		return domain.Report{}, err
	}
	switch action {
	case "SUBMIT":
		dispatchTriage(ctx, report, s.triage.OnReportSubmitted)
	case "EDIT_PENDING":
		dispatchTriage(ctx, report, s.triage.OnPendingReportEdited)
	}
	s.media.DeleteObjects(ctx, detached)
	return report, nil
}

func (s *Service) apply(ctx context.Context, report *domain.Report, input Input, action string, creating bool) error {
	if (action == "EDIT_PENDING" || action == "SUBMIT" && creating) && !input.Complete {
		return domain.ErrInvalid
	}
	if input.Apply != nil {
		input.Apply(report)
	}
	count := 0
	if input.ImageIDs != nil {
		count = len(*input.ImageIDs)
	} else if !creating {
		if err := s.loadImages(ctx, report); err != nil {
			return err
		}
		count = len(report.Images)
	}
	if err := report.Validate(count, action == "CREATE_DRAFT" || action == "UPDATE_DRAFT"); err != nil {
		return err
	}
	if report.Location.ID != nil {
		active, err := s.locations.IsActiveLocation(ctx, *report.Location.ID)
		if err != nil {
			return err
		}
		if !active {
			return domain.ErrLocationUnavailable
		}
	}
	return nil
}

func dispatchTriage(ctx context.Context, report domain.Report, hook func(context.Context, domain.Report)) {
	go func() {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 20*time.Second)
		defer cancel()
		defer func() {
			if recover() != nil {
				slog.Error("report triage hook panicked", "report_id", report.ID, "version", report.Version)
			}
		}()
		hook(ctx, report)
	}()
}

func (s *Service) loadImages(ctx context.Context, report *domain.Report) error {
	images, err := s.media.ListByReportIDs(ctx, []string{report.ID})
	report.Images = images[report.ID]
	return err
}

func (s *Service) GetReport(ctx context.Context, actor identity.User, id string) (domain.Report, error) {
	if err := authorize(actor, false); err != nil {
		return domain.Report{}, err
	}
	report, err := s.repo.Find(ctx, id, false)
	if err != nil {
		return report, err
	}
	if err := domain.CanViewReport(report, domain.Viewer{ID: actor.ID, Active: actor.IsActive, Reviewer: slices.Contains(actor.Roles, identity.Reviewer)}); err != nil {
		return domain.Report{}, err
	}
	err = s.loadImages(ctx, &report)
	return report, err
}

func (s *Service) ListMyReports(ctx context.Context, actor identity.User, filter Filter, page pagination.Query) (pagination.Result[domain.Report], domain.ReportCounts, error) {
	if err := authorize(actor, false); err != nil {
		return pagination.Result[domain.Report]{}, domain.ReportCounts{}, err
	}
	items, total, err := s.repo.List(ctx, actor.ID, filter, page)
	if err != nil {
		return pagination.Result[domain.Report]{}, domain.ReportCounts{}, err
	}
	ids := make([]string, 0, len(items))
	for _, report := range items {
		ids = append(ids, report.ID)
	}
	images, err := s.media.ListByReportIDs(ctx, ids)
	if err != nil {
		return pagination.Result[domain.Report]{}, domain.ReportCounts{}, err
	}
	for i := range items {
		items[i].Images = images[items[i].ID]
	}
	counts, err := s.repo.Counts(ctx, actor.ID)
	return pagination.New(page, items, total), counts, err
}

func (s *Service) PurgeExpiredReports(ctx context.Context) (domain.ReportCounts, error) {
	const batchSize = 50
	cutoff := s.now().UTC().AddDate(0, 0, -30)
	var total domain.ReportCounts
	for {
		var keys []string
		var batch domain.ReportCounts
		err := s.tx.WithTx(ctx, func(tx context.Context) error {
			rows, err := s.repo.LockExpired(tx, cutoff, batchSize)
			if err != nil || len(rows) == 0 {
				return err
			}
			ids := make([]string, 0, len(rows))
			for _, row := range rows {
				ids = append(ids, row.ID)
				if row.Status == domain.Draft {
					batch.Draft++
				} else {
					batch.Cancelled++
				}
			}
			batch.Total = int64(len(ids))
			keys, err = s.media.StorageKeysByReportIDs(tx, ids)
			if err != nil {
				return err
			}
			if err := s.repo.Delete(tx, ids); err != nil {
				return err
			}
			return s.audit.Record(tx, audit.Entry{EntityType: "RETENTION", EntityID: uuid.NewString(),
				Action: "PURGE_EXPIRED_REPORTS", ActorType: "SYSTEM",
				Details: map[string]any{"draftPurged": batch.Draft, "cancelledPurged": batch.Cancelled, "imagesCleaned": len(keys)}})
		})
		if err != nil {
			return total, err
		}
		total.Draft += batch.Draft
		total.Cancelled += batch.Cancelled
		total.Total += batch.Total
		s.media.DeleteObjects(ctx, keys)
		if batch.Total < batchSize {
			return total, nil
		}
	}
}
