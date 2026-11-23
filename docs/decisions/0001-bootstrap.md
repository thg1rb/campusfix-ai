# Bootstrap architecture and toolchains

| Area | Versions |
| --- | --- |
| Web | Node 24.22.3, Bun 1.4.5, Next.js and create-next-app 16.4.6, React 19.3.1, TypeScript 5.9.3, Tailwind 4.3.5 |
| API | Go 1.26.11, Fiber 3.7.0, GORM 1.31.2, GORM PostgreSQL driver 1.6.3, Goose CLI 3.30.1 |
| AI | Python 3.14.7, uv 0.13.9, FastAPI 0.165.0, Uvicorn 0.54.0, Hatchling 1.33.0 |
| Infrastructure | PostgreSQL 18.7 and Docker Compose with Watch support |

Bun manages Web dependencies, the lockfile, and scripts. Node provides the Next.js runtime. The App Router uses a Server Component for the page and an uncached server route for readiness. [Next.js](https://nextjs.org/docs) · [create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app) · [Tailwind](https://tailwindcss.com/docs/installation/framework-guides/nextjs) · [Bun](https://bun.sh/docs)

The API is a modular monolith. Constructor injection in `internal/bootstrap` assembles process infrastructure. Future modules follow this layout.

```text
modules/<module-name>/
├── domain/
├── application/
└── adapters/
    ├── inbound/http/
    └── outbound/postgres/
```

Domain code stays independent of Fiber, GORM, and provider SDKs. Application code depends on domain types and consumer-defined ports. HTTP adapters translate request and response data. PostgreSQL adapters own GORM use and map persistence models to separate domain entities. Introduce repository interfaces when a use case needs them. Goose owns schema changes. [Go modules](https://go.dev/doc/modules/layout) · [Fiber v3](https://docs.gofiber.io/) · [GORM](https://gorm.io/docs/) · [GORM PostgreSQL](https://gorm.io/docs/connecting_to_the_database.html) · [Goose](https://pressly.github.io/goose/)

The gateway installs `campusfix_ai` from `src/` with uv and uses Uvicorn to manage application lifecycle. Future classification belongs behind the JEV provider boundary. Similarity assessment will receive active open Tickets (`CONFIRMED`/`WAITING_INFO`) shortlisted by the Backend. Choose the provider protocol and similarity method when integration requirements are known. Evaluation cases belong in `apps/ai/evaluation`, outside the runtime package. [FastAPI](https://fastapi.tiangolo.com/) · [uv](https://docs.astral.sh/uv/) · [Python src layout](https://packaging.python.org/en/latest/discussions/src-layout-vs-flat-layout/)

Compose gates startup with container health. Runtime readiness rechecks dependencies under bounded timeouts and can recover after a dependency restarts. The named PostgreSQL volume follows the PostgreSQL 18 image layout. [PostgreSQL](https://www.postgresql.org/docs/) · [PostgreSQL image](https://hub.docker.com/_/postgres) · [Docker Compose](https://docs.docker.com/compose/) · [Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/)
