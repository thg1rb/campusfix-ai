# 0003 — Identity sessions and AuthProvider

- **Status:** Accepted
- **Date:** 2026-11-27

## Context

KU Spot requires verified university accounts and immediate revocation when an administrator deactivates a user. The Web app and Go API share a browser origin through the Next.js proxy.

## Decision

- Identity consumes an `AuthProvider` port and stores the provider identifier and subject as the external account key. The Google adapter exchanges the authorization code and verifies the ID token signature, issuer, audience, lifetime, nonce, and campus claims. Only verified `@ku.th` email addresses with the `ku.th` hosted domain are eligible. A configured email allowlist can bootstrap an exclusive administrator on first login.
- An HTTP-only, SameSite=Lax cookie holds signed OAuth state, verifier, nonce, local return path, and a ten-minute expiry. The authorization redirect uses S256 PKCE. The callback clears the state cookie and validates the state and return path before using them.
- The HTTP-only, SameSite=Lax `ku_spot_session` cookie carries a signed opaque random token. HTTPS deployments use Secure cookies. PostgreSQL stores its SHA-256 digest, expiry, and revocation timestamp. Sessions expire after seven days. Every authenticated request loads current roles and account status. Logout revokes the presented session and deactivation revokes all sessions for that account. Browser write requests are checked against the public app origin.
- One database transaction persists account access changes, revokes sessions, and inserts the audit entry. Admin writes serialize before rechecking the caller and counting active admins. Durably storing the role history and session state makes the same controls work across API instances.

## Consequences

- Configure the same strong signing secret on all API instances. Rotating it invalidates existing cookies. Google sign-in stays disabled when either OAuth credential is empty, and service probes still work.
- Register the public Web callback as the OAuth redirect URI. For local development use `http://localhost:3000/api/v1/auth/callback`. Fill in `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `AUTH_SESSION_SECRET` in `apps/api/.env`. Set `BOOTSTRAP_ADMIN_EMAILS` before the first login for any account that should start as an administrator. Start the stack with `make up`, run `make migrate`, and open `http://localhost:3000/login`.
