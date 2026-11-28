-- +goose Up
CREATE TABLE report_images (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Phase 4 adds FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE.
    report_id uuid NULL,
    uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    storage_key text NOT NULL UNIQUE,
    file_name text NOT NULL,
    mime_type text NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg')),
    size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    exif_stripped boolean NOT NULL DEFAULT true,
    expires_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((report_id IS NULL) = (expires_at IS NOT NULL))
);
CREATE INDEX report_images_report_order_idx ON report_images (report_id, sort_order) WHERE report_id IS NOT NULL;
CREATE INDEX report_images_expiration_idx ON report_images (expires_at) WHERE report_id IS NULL;
CREATE INDEX report_images_uploader_idx ON report_images (uploaded_by, created_at DESC);

-- +goose Down
DROP TABLE report_images;
