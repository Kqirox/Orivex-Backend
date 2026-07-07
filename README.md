<div align="center">

# Orivex Backend

**The API that powers learn-to-earn on the Stellar network.**

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-10+-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Stellar](https://img.shields.io/badge/Stellar-Built%20on%20the%20Network-black?style=for-the-badge&logo=stellar)](https://stellar.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](http://makeapullrequest.com)

> **Anywhere. Anyone. Learn freely. Earn provably.**
> Orivex turns financial literacy and digital skills into portable,
> on-chain credentials — built mobile-first for emerging markets.

[🌐 Website](https://orivex.io) · [📚 Docs](./docs/API.md) · [🐛 Report Bug](https://github.com/Kqirox/Orivex-Backend/issues) · [✨ Request Feature](https://github.com/Kqirox/Orivex-Backend/issues) · [💬 Discord](https://discord.gg)

</div>

---

## ✨ Why Orivex?

Behind every credential, every reward, and every learner profile sits this repo:
a stateless, JSON-first API that talks to PostgreSQL and the Stellar ledger with equal ease.

| | |
|--|--|
| 🪐 **Decentralised by default** | Credentials and payouts settle on Stellar — no central authority can revoke or forge them. |
| 📱 **Mobile-first ergonomics** | Designed for low-bandwidth PWAs running on entry-level Android handsets. |
| 🔐 **Privacy-preserving** | ZK-proof friendly data shapes; selective disclosure comes standard. |
| 💼 **B2B-ready** | Verified-talent search API for employers — paid feature, built in. |

---

## 🌌 Ecosystem

Orivex Backend is one of three repos. Together they form the full stack.

| Repo | Role | Stack |
|:--|:--|:--|
| **[`Orivex-Backend`](https://github.com/Kqirox/Orivex-Backend)** ← *you are here* | API, identity, rewards, credentials | Node.js · Express · PostgreSQL · Prisma |
| [`Orivex-App`](https://github.com/Kqirox/Orivex-Backend) | Mobile-first PWA frontend | React · Next.js · TypeScript · Tailwind |
| [`Orivex-Contracts`](https://github.com/Kqirox/Orivex-Contracts) | Soroban smart contracts for credential issuance | Rust · Soroban SDK |

---

## 🧭 Feature Map

### 🏛️ Core Platform

- **🔐 Authentication & Sessions** — JWT issuance, password bcrypt, role-aware middleware, and token rotation.
- **📚 Modules & Progress** — Catalogue, completion submission, offline sync, idempotent ingestion.
- **🎁 Rewards Engine** — Stellar-based payouts with reconcilable memos and dispute handling.
- **🎓 Verifiable Credentials** — Mint, fetch, and publicly verify credentials by on-chain ID.
- **🤝 Referrals** — Multi-tier tracking, capped rewards, anti-abuse heuristics.

### ⚙️ Operations & Integrations

- **🔔 Push Notifications** — Firebase Cloud Messaging with topic targeting, per-device tokens.
- **📨 Webhooks Out** — HMAC-signed (`X-Orivex-Signature`) deliveries with retry and DLQ semantics.
- **🧱 Employer Search** — Talent-pool query API for verified learners with consent gating.
- **🛡️ Rate Limiting & Validation** — Redis-backed counters and Zod schemas on every entry point.

---

## 🏗️ Architecture at a Glance

```text
┌────────────────────────────────────────────────────────────────┐
│                    Orivex PWA (mobile web)                    │
└─────────────────────────────┬──────────────────────────────────┘
                              │ HTTPS · JWT · /api/v1
                              │
┌─────────────────────────────▼──────────────────────────────────┐
│                       Orivex Backend (this repo)              │
│                                                                │
│  [ Auth ]──[ Modules ]──[ Rewards ]──[ Credentials ]──[ Search ]│
│       Express · Zod · Winston · Helmet · Rate-Limit            │
└────┬───────────────────────────┬──────────────────────────┬────┘
     │                           │                          │
     │                           │                          │
┌────▼─────────┐         ┌───────▼────────┐         ┌───────▼────────┐
│  PostgreSQL   │         │ Stellar Ledger │         │ Soroban RPC   │
│  (Prisma ORM) │         │  Horizon ·     │         │  Credential   │
│  Users · Mods │         │  Assets · Memos│         │  Contracts    │
└──────────────┘         └────────────────┘         └───────────────┘
```

**Layered internals:** `routes` (HTTP framing) → `middleware` (auth, validation, rate-limit)
→ `controllers` (request orchestration) → `services` (business logic) →
`Prisma` / Stellar RPC (persistence and settlement).

For the full system design, see **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)**.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20 or newer
- **pnpm** 10 or newer
- **PostgreSQL** 14 or newer (or Docker)
- _Optional:_ Redis for distributed rate-limiting
- _Optional:_ Rust toolchain if you'll be hacking on linked Soroban contracts

### Install & Run

```bash
# 1. Clone
git clone https://github.com/Kqirox/Orivex-Backend.git
cd Orivex-Backend

# 2. Install
pnpm install

# 3. Configure
cp .env.example .env
# edit .env with your DATABASE_URL and Stellar testnet secrets

# 4. Provision the database
pnpm db:migrate
pnpm db:seed       # optional: load demo modules / sample users

# 5. Run
pnpm dev           # starts Express + nodemon on the configured PORT
```

The API will be live at `http://localhost:<PORT>/api/v1`. Swagger UI is mounted in dev mode — see **[`docs/API.md`](./docs/API.md)** for the canonical endpoint reference.

> 📦 Detailed database instructions live in **[`prisma/SETUP.md`](./prisma/SETUP.md)**.

### Everyday Commands

| Script | What it does |
|:--|:--|
| `pnpm dev` | Run the API with hot reload (nodemon + ts-node) |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Boot the compiled build (production) |
| `pnpm test` | Run the Vitest suite (unit + integration) |
| `pnpm test:coverage` | Generate coverage report |
| `pnpm lint` | ESLint over `src/` and `tests/` |
| `pnpm db:migrate` | Apply Prisma migrations |
| `pnpm db:seed` | Load demo data |
| `pnpm db:studio` | Open Prisma Studio |

---

## 🌐 API Surface (skim)

```
POST   /api/v1/auth/register         sign up
POST   /api/v1/auth/login            sign in
GET    /api/v1/modules               list catalogue
POST   /api/v1/modules/:id/complete  submit progress (idempotent)
GET    /api/v1/credentials           list my credentials
GET    /api/v1/credentials/verify/:id   public verification (no auth)
GET    /api/v1/employer/search       talent pool query
POST   /api/v1/referrals             register a referral
```

Full schemas, error envelopes, and example payloads: **[`docs/API.md`](./docs/API.md)**.

---

## 🛠️ Tech Stack

| Layer | Choice |
|:--|:--|
| Runtime | Node.js 20 LTS |
| Language | TypeScript (strict) |
| HTTP | Express 5 |
| ORM / DB | Prisma · PostgreSQL 14+ |
| Validation | Zod |
| Auth | JWT · bcrypt |
| Blockchain | `@stellar/stellar-sdk` · Soroban RPC |
| Notifications | Firebase Cloud Messaging |
| Testing | Vitest · Supertest |
| Tooling | ESLint · Prettier · Swagger UI · nodemon |

---

## 📚 Documentation

Every operational concern is documented.

| Doc | Purpose |
|:--|:--|
| **[`docs/API.md`](./docs/API.md)** | Endpoint reference and request/response schemas |
| **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)** | System design, layers, deployment topology |
| **[`docs/DEVELOPING.md`](./docs/DEVELOPING.md)** | Local setup, coding conventions, test strategy |
| **[`docs/OPERATIONS.md`](./docs/OPERATIONS.md)** | Deploying, scaling, logging, observability |
| **[`docs/ERROR_HANDLING.md`](./docs/ERROR_HANDLING.md)** | `AppError` hierarchy, HTTP mapping, troubleshooting |
| **[`docs/SECURITY.md`](./docs/SECURITY.md)** | Threat model, secrets, reporting vulnerabilities |
| **[`docs/ROADMAP.md`](./docs/ROADMAP.md)** | Current quarter priorities and later bets |
| **[`docs/CHANGELOG.md`](./docs/CHANGELOG.md)** | Notable versioned changes |

---

## 🤝 Contributing

We welcome PRs of every shape: bug fixes, features, docs, tests, examples.

1. Skim **[`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md)** for workflow and style.
2. Read **[`docs/CODE_OF_CONDUCT.md`](./docs/CODE_OF_CONDUCT.md)** — be kind, stay constructive.
3. Pick an open issue or propose one via RFC. Tag-heavy work? Check **[`docs/ROADMAP.md`](./docs/ROADMAP.md)** first.
4. Open a PR. CI will run lint, typecheck, and the test suite.

> Conventional Commits are encouraged. Tags follow Semantic Versioning. Releases are cut from `main`.

---

## 🛡️ Security

If you discover a vulnerability, **do not** open a public issue. Follow the disclosure process in **[`docs/SECURITY.md`](./docs/SECURITY.md)** and we'll respond within 72 hours.

---

## 📜 License

This project is licensed under the **MIT License** — see **[`LICENSE`](./LICENSE)**.

---

## 🌟 Acknowledgements

- **[Stellar Development Foundation](https://stellar.org)** — for the rails our payouts run on.
- **Every contributor** who has shipped a PR, filed a thoughtful issue, or helped a learner onboard.
- **The Orivex community** — testers, educators, and learners in equal measure.

---

## ✉️ Contact

- 🌍 Web: [orivex.io](https://orivex.io)
- 💌 Email: [orivex@toneflix.net](mailto:orivex@toneflix.net)
- 💬 Discord: [Join the community](https://discord.gg)
- 🐙 GitHub: [Kqirox](https://github.com/Kqirox)

<sub align="center">Built with care by the Orivex team — and a lot of ☕</sub>
