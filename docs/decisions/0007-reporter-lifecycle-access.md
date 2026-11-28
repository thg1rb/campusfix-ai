# 0007: Reporter lifecycle access

- **Status:** Accepted
- **Date:** 2026-11-28

## Context

The earlier Web ↔ API contract described Reporter writes as available to authenticated non-administrators. The Freeze 1 role matrix grants report lifecycle writes to users with the Reporter role.

## Decision

Require an active `REPORTER` role for report lifecycle writes. Users with multiple roles may write their own reports while acting as Reporters. Administrators are excluded from private Report endpoints. Private reads follow owner and active Reviewer permissions. Confirmed images remain public through the media route.

## Consequences

The client gates live create, edit, and cancellation actions by role. The server applies the same rule independently. Existing staged media upload permissions continue to apply.
