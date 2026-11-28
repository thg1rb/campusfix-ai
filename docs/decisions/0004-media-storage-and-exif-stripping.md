# 0004 — Media storage and EXIF stripping

- **Status:** Accepted
- **Date:** 2026-11-28

## Context

Reporters need to upload photos before a Report exists. The API must remove metadata before storage and authorize reads according to the image’s staged or Report visibility. Local development and deployed environments use the same S3 API.

## Decision

- Compose builds a local MinIO image from upstream release `RELEASE.2025-10-15T17-29-55Z`, commit `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a`. The source archive is verified against SHA-256 `45521908307306e925c98d629e1c17d78c8b72b6ee242b1bfb1409f7d8ee5841`. The build verifies Go modules. Go `1.26.11-alpine` builds both ARM64 and AMD64. The digest-pinned Alpine `3.23.8` runtime runs as a non-root user. The Compose S3 and Console ports are bound to loopback.
- The media application uses an `ObjectStore` port. The MinIO Go SDK adapter supports local MinIO and deployed S3-compatible storage. Buckets are private and image bytes are served through the API. Local Compose initializes the bucket idempotently with bounded retries while MinIO comes up. Deployed environments can provision the private bucket separately.
- Uploads identify PNG/JPEG from magic bytes and check dimensions before decoding. Limits are 10 MiB before and after sanitization, 10,000 pixels on either axis, and 40 million pixels total. JPEG EXIF orientation is applied to decoded pixels. Go's JPEG and PNG encoders produce fresh bytes without the input’s EXIF, GPS, camera, comment, or text metadata. The database stores the sanitized output length.
- An upload stages a private row for 24 hours. An unexpired staged image is visible only to its uploader. Attached images inherit Report visibility. Missing, expired, and inaccessible images return the same `404 NOT_FOUND` response. Phase 3 denies attached reads until a Report resolver is available.
- Cleanup runs hourly by default. It locks and deletes expired staged rows in batches and deletes their objects before committing. A storage failure rolls back the batch for retry. Object deletes are idempotent. Session cleanup deletes expired sessions and sessions revoked for at least 24 hours.

## Consequences

- If inserting a staged row fails after upload, the API attempts bounded object deletion and logs any failure. Binding returns keys for omitted attachments after deleting their rows in the transaction. The Report caller deletes those objects after commit.
- Phase 3 leaves `report_id` nullable and without a parent foreign key. Phase 4's `reports` migration must add `FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE`. Phase 4 also locks the parent Report during image binding and supplies the Report visibility resolver.
- Production deployments provision a private S3-compatible bucket and use a scoped credential. Development runs MinIO with loopback exposure. Report retention and storage deletion after Report purge are future work.
