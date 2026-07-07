# CHANGELOG

All notable changes to the **Orivex-Backend** project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Project rebranded from *Learnault* to *Orivex* (`Orivex-Backend`).
- All public URLs, webhooks, transaction memos, HMAC headers, and emails moved
  off `learnault.*` and onto `orivex.*` namespaces.

### Removed
- Stale debug artifacts (`lint_results*.txt`, `server_error*.txt`, `lint_output.json`)
  accidentally tracked in the repository have been deleted and added to `.gitignore`.

### Documentation
- README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, ERROR_HANDLING, SETUP, and
  the PR template have been updated to reflect the new identity.
- Added this CHANGELOG, plus a SUPPORT, DEVELOPING, ROADMAP, ARCHITECTURE, and
  OPERATIONS guide.

## [0.1.0] — 2026-03-07

Initial public scaffold for the backend API. Authentication, modules,
rewards, credentials, referrals, employer search, notifications, sync,
and webhook delivery services are present in testable form.
