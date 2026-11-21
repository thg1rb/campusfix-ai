# Bootstrap verification

Verified on Docker Engine 29.1.5 with Compose v5.0.1.

| Check | Observed result |
| --- | --- |
| Base and development Compose configuration | Both passed `docker compose config --quiet`. |
| Web checks | Frozen Bun install, ESLint, TypeScript check, and production build passed. |
| Go checks | Formatting, dependency verification, vet, test invocation, and build passed. |
| AI checks | uv lock validation, locked package installation, and installed package import passed. |
| Base stack | All four containers reached healthy status. Startup logs showed each service listening. |
| Development override | All four containers reached healthy status and the smoke script passed. |
| Web page | HTTP 200 and a browser-rendered level-one heading of CampusFix AI. |
| AI and API liveness | Both returned HTTP 200 with `{"status":"ok"}`. |
| API → PostgreSQL and AI | API readiness returned HTTP 200 with both dependencies `ok`. |
| Web server → API | Web readiness returned HTTP 200 with the same dependency results. |
| AI stopped | API liveness stayed HTTP 200. API and Web readiness returned HTTP 503 with AI `unavailable` and PostgreSQL `ok`. |
| AI restarted | Both readiness routes recovered to HTTP 200 with both dependencies `ok`. |
| Database schema | PostgreSQL reported zero public tables. The migration command reported no migrations to apply. |

The PostgreSQL volume was preserved. The base stack was restored after development verification. Source-edit reload behavior and migration application against a real migration are outside these checks. Gateway health confirms process availability. JEV, similarity scoring and storage are reserved for future implementation.
