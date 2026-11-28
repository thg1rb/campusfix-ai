-- +goose Up
CREATE TABLE reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_number text NULL UNIQUE,
    reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_REVIEW','CONFIRMED','REJECTED','CANCELLED')),
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    description text NOT NULL DEFAULT '',
    location_id uuid NULL REFERENCES campus_locations(id) ON DELETE SET NULL,
    location_name text NULL,
    location_detail_note text NULL,
    lat double precision NULL,
    lng double precision NULL,
    ai_generated_title text NULL,
    requested_target_ticket_id uuid NULL,
    ticket_id uuid NULL,
    rejection_reason text NULL,
    reviewed_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    submitted_at timestamptz NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    cancelled_at timestamptz NULL,
    CHECK ((report_number IS NOT NULL) = (status <> 'DRAFT')),
    CHECK ((submitted_at IS NOT NULL) = (status <> 'DRAFT')),
    CHECK ((cancelled_at IS NOT NULL) = (status = 'CANCELLED')),
    CHECK ((ticket_id IS NOT NULL) = (status = 'CONFIRMED')),
    CHECK ((lat IS NULL) = (lng IS NULL)),
    CHECK (lat IS NULL OR (lat BETWEEN 13.839 AND 13.858 AND lng BETWEEN 100.557 AND 100.580)),
    CHECK (status = 'DRAFT' OR (btrim(description) <> '' AND location_name IS NOT NULL AND btrim(location_name) <> '' AND lat IS NOT NULL AND lng IS NOT NULL)),
    CHECK (reviewed_by IS NULL OR reviewed_by <> reporter_id),
    CHECK (status <> 'REJECTED' OR (rejection_reason IS NOT NULL AND btrim(rejection_reason) <> ''))
);
CREATE INDEX reports_owner_status_updated_idx ON reports (reporter_id, status, updated_at DESC);
CREATE INDEX reports_owner_updated_idx ON reports (reporter_id, updated_at DESC, id DESC);
CREATE INDEX reports_owner_created_idx ON reports (reporter_id, created_at DESC);
CREATE INDEX reports_review_queue_idx ON reports (status, submitted_at DESC);
CREATE INDEX reports_ticket_idx ON reports (ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX reports_draft_retention_idx ON reports (created_at) WHERE status = 'DRAFT';
CREATE INDEX reports_cancelled_retention_idx ON reports (cancelled_at) WHERE status = 'CANCELLED';

ALTER TABLE report_images ADD CONSTRAINT report_images_report_id_fkey
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

-- +goose Down
ALTER TABLE report_images DROP CONSTRAINT report_images_report_id_fkey;
DROP TABLE reports;
