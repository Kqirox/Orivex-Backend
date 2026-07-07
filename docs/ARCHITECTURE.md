# Architecture overview

`Orivex-Backend` is the API tier of the Orivex platform. It exposes a
versioned JSON API under `/api/v1` and is responsible for:

- Identity, sessions, and JWT issuance.
- Module catalogue + completion submission.
- Reward calculation, payout via Stellar, withdrawal reconciliation.
- Credential minting, lookup, and public verification.
- Employer talent search and outreach.
- Push notification orchestration.

## High-level

```plaintext
                ┌────────────────────────────┐
                │   Orivex PWA (mobile web)  │
                └──────────────┬─────────────┘
                               │ HTTPS / JWT
                ┌──────────────▼─────────────┐
                │      Orivex-Backend (this repo) │
                │   Express + Prisma              │
                └──┬──────────┬──────────┬────────┘
                   │          │          │
       Stellar RPC │  Soroban RPC │  Postgres
       (HZD/HZN)   │  (credentials) │  (users / modules / etc.)
                   │          │
                   └──────────┴──────► Stellar ledger
```

## Layered structure

- **HTTP layer** (`src/routes`, `src/middleware`): request framing,
  authentication, validation, rate-limit.
- **Application layer** (`src/controllers`): orchestrates the request,
  delegates to services, shapes the response envelope.
- **Service layer** (`src/services`): business logic including memo and
  webhook delivery.
- **Persistence**: Prisma models in `prisma/schema.prisma`; read/write
  helpers live in `src/services` and `src/controllers`.

## Cross-cutting

| Concern                   | Where                                                         |
|---------------------------|---------------------------------------------------------------|
| Authentication            | `src/middleware/auth.middleware.ts`, JWT verified here        |
| Validation                | Zod schemas in `src/schemas`, applied by `validation.middleware.ts` |
| Rate limiting             | `src/middleware/rate-limit.middleware.ts` using Redis-compatible store |
| Error response shape      | `src/utils/errors.ts`, formatted by `error.middleware.ts`     |
| Logging                   | `src/config/logger.ts` (Winston) + `morgan` request logs      |
| Webhook delivery          | `src/services/webhook.service.ts` with HMAC `X-Orivex-Signature` |
| Push notifications        | `src/services/notification.service.ts` via Firebase Admin    |
| Crypto / Stellar          | `src/services/stellar.service.ts`, `src/services/soroban.service.ts` |

## Deployment topology

```plaintext
Load balancer
   └── Orivex-Backend (stateless; ≥ 2 replicas)
        ├── Postgres primary (HA, automated backups)
        └── Redis (rate-limit counters, optional cache)
```

Statelessness is enforced: no app state. All mutable state lives in Postgres
or in on-ledger assets.
