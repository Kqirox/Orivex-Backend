# Developing the Orivex-Backend

This handbook explains the day-to-day workflow for maintaining and extending
the **Orivex-Backend** service.

## Prerequisites

| Tool       | Version | Why |
|------------|---------|------|
| Node.js    | ≥ 20    | matches `engines.node` in package.json |
| pnpm       | ≥ 10    | package manager pinned in `package.json` |
| PostgreSQL | 15+     | default dev database (Docker image is `orivex-postgres`) |
| Git        | 2.30+   | for feature branch workflow |

## Local setup

```bash
# Clone and install
git clone https://github.com/Kqirox/Orivex-Backend.git
cd Orivex-Backend
pnpm install

# Bootstrap the database
cp .env.example .env
docker run --name orivex-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=orivex_backend \
  -p 5432:5432 -d postgres:15
pnpm db:migrate
pnpm seed

# Start dev server
pnpm dev
```

## Project layout

```
src/
├── app.ts                 # Express bootstrap
├── server.ts              # listen entry
├── config/                # env, logger, swagger, db, stellar
├── controllers/           # one file per resource
├── services/              # Stellar, Soroban, rewards, notifications, webhooks
├── middleware/            # auth, validation, rate-limit, error
├── routes/v1/             # versioned REST routes
├── schemas/               # Zod input schemas
├── types/                 # TS types
├── utils/                 # helpers
└── docs/                  # Swagger JSDoc annotations
prisma/                    # schema, migrations, seed
tests/                     # Vitest unit + integration
integrations/             # source-mirror integration trees
docs/                      # Product, security & ops docs
.github/workflows/ci.yml  # PR/push CI pipeline
```

## Testing

```bash
pnpm test            # run vitest in watch mode
pnpm test:coverage   # generate coverage report (default v8)
pnpm test:ci         # one-shot test, mirrors CI
```

When adding new features:

1. Define Zod input schemas in `src/schemas/`.
2. Apply them via `validation.middleware.ts`.
3. Add unit tests under `tests/unit/` and a mirror under `integrations/unit/`.
4. Add JSDoc swagger annotations for new endpoints if they are public.

## Coding standards

- TypeScript strict mode is enabled — no `any`.
- ESLint with `typescript-eslint` recommended + custom stylistic rules.
- Run `pnpm lint` locally before opening a PR.
- Follow Conventional Commits (see `CONTRIBUTING.md`).

## Releasing

1. Bump version in `package.json`.
2. Add a `## [x.y.z]` entry to `docs/CHANGELOG.md`.
3. Push a tag — CI publishes nothing automatically for the API service but the
   release notes are picked up by the docs site.

## Troubleshooting

- **"Cannot reach database"** — confirm `orivex-postgres` is up with
  `docker ps` and that `.env` has the right `DATABASE_URL`.
- **"Prisma client out of sync"** — run `pnpm prisma generate`.
- **Webhook signature mismatch** — confirm your consumer uses
  `X-Orivex-Signature` and matches against the shared secret.
