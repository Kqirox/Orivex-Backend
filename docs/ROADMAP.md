# Orivex-Backend roadmap

This roadmap captures the **publicly committed** direction for the backend
service. It is intentionally short — execution happens in feature branches.

## Now (current quarter)

- ✅ Consolidate identity under `orivex-backend`; retire all legacy namespace aliases.
- ✅ Drop the legacy debug artifacts and tighten `.gitignore`.
- ✅ Cut over documentation to the `orivex.io` / `Kqirox/Orivex-Backend`
  families of URLs.
- 🔄 Stabilise error responses with the unified `AppError` hierarchy.

## Next

- Replace in-memory stores in `src/services/reward.service.ts` with Prisma
  calls, removing the implicit in-test singletons.
- Add structured request IDs and propagate them across logs and HTTP
  responses.
- Add OpenTelemetry traces for outbound Stellar RPC and webhook delivery.
- Background job queue (BullMQ or Inngest) for module reward payouts.

## Later / maybe

- Multi-tenant deployment (one logical deployment per employer tenant).
- Region-pinned read replicas for reporting endpoints.
- Auto-generated SDKs from the OpenAPI spec for TS, Python, and Go.

## Out of scope

- Frontend (lives in a separate `Orivex-App` repo).
- Soroban smart contract source (lives in `Orivex-Contracts` repo).
