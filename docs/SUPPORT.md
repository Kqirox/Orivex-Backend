# Getting support

This page explains where to ask for help with **Orivex-Backend**.

## Channels

| Audience         | Channel                       | Response time        |
|------------------|-------------------------------|----------------------|
| End users        | Discord `#help` channel       | Best-effort, community |
| Developers       | GitHub Discussions on `Kqirox/Orivex-Backend` | < 3 business days |
| Reported abusing | `security@orivex.io`          | < 24 hours           |

## Before you ask

1. Search the GitHub Issues list — most questions already have answers.
2. Read the relevant doc:
   - `docs/API.md` — API endpoints and request/response shapes.
   - `docs/ERROR_HANDLING.md` — error payload format and class hierarchy.
   - `docs/SECURITY.md` — vulnerability disclosure policy.
   - `prisma/SETUP.md` — local database setup.
3. Reproduce in a minimal sandbox using `pnpm seed`.

## Filing an issue

Include:

- A clear, descriptive title.
- Reproduction steps (commands, configs, request bodies).
- Observed vs expected behaviour.
- Version (`pnpm pkg get version`), Node version, OS.

## Security disclosures

**Do not** file public issues for suspected vulnerabilities. Email
`security@orivex.io` directly. See `docs/SECURITY.md` for the full disclosure
policy.
