# On-call runbook

This document is for operators of the **Orivex-Backend** service.

## Health checks

- `GET /health` on the Express app — returns 200 with `status: ok` and the
  current ISO timestamp.
- `GET /api-docs` — Swagger UI; if unreachable, the schema compile
  (`src/config/swagger.ts`) may have errors.

## Common incidents

### 1. Reward payouts fail (Stellar errors)

- Check `STELLAR_NETWORK` and the `STELLAR_SOURCE_SECRET` secret rotation.
- Look at `src/services/stellar.service.ts` error classes for `PAYMENT_ERROR`
  and `TRANSACTION_TIMEOUT`.
- Replay affected withdrawals by replaying `prisma.transaction.where.status =
  pending` rows.

### 2. Webhook deliveries drop into `failed` state

- The webhook endpoint is auto-deactivated after 10 consecutive failures —
  see `src/services/webhook.service.ts::checkEndpointHealth`.
- To recover: re-activate the endpoint in admin UI / directly via Prisma,
  then call `WebhookService.processQueue()`.

### 3. Database migrations applied incorrectly

- The migration folder is `prisma/migrations/20260307143903_init`.
- Always run `pnpm prisma migrate status` before applying.
- If a migration is in a broken state, prefer to **create a forward fix**
  rather than rewriting history — `git` rewrites are off by policy.

## Logs

- Production logs are emitted via `winston` (`src/config/logger.ts`).
- Request logs go through `morgan('dev')` in development — disable in
  production by setting `NODE_ENV=production`.

## Secrets management

Required at runtime:

| Env var                        | Notes                                          |
|--------------------------------|------------------------------------------------|
| `DATABASE_URL`                 | Postgres connection string                     |
| `JWT_SECRET`                   | HS256 signing key                              |
| `STELLAR_NETWORK`              | `testnet` or `mainnet`                         |
| `STELLAR_SOURCE_SECRET`        | used for reward payouts                        |
| `SOROBAN_CONTRACT_ID`          | for credential mint/verify calls               |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | JSON-encoded Firebase admin service account    |

Rotate `JWT_SECRET` and `STELLAR_SOURCE_SECRET` quarterly.

## Contacts

- Engineering lead: see `package.json#author`.
- Security escalation: `security@orivex.io`.
