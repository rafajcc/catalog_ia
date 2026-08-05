# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `LICENSE` (MIT) and `CHANGELOG.md` files referenced from the README.
- Unit tests for `logger`, `error-handler`, and `ai-text-suggester` (mock provider, no API calls).
- Integration tests for the Express app via supertest (routing, security headers, CORS, rate limiting, error handling).
- Tests for the server entry point (startup, PORT handling, graceful shutdown, error handler setup) using module mocks.
- New npm scripts `test:logger`, `test:error-handler`, `test:ai-suggester`, `test:app`, and `test:index`.

## [0.1.0] - 2026-08-05

### Added
- Initial CatalogIA project: Express backend and React frontend scaffolding.
- CSV parsing with encoding detection and field normalization.
- Product validation, normalization, image matching/ranking modules.
- Review state management, audit logging, and sync services.
- Jest test suite for the CSV parser.
- ESLint and TypeScript configuration with zero lint issues.

### Fixed
- CSV parser tests and module imports for a clean backend typecheck.
- `initializeReview` not storing products, leaving edit/filter methods operating on an empty list.
- Audit log in-memory cap (1000 entries) not being applied because `cleanOldLogs` replaced the array reference.
- Flaky CSV parser tests on Windows caused by antivirus locking freshly written temp files.

[Unreleased]: https://github.com/rafajcc/catalog_ia
[0.1.0]: https://github.com/rafajcc/catalog_ia/releases/tag/v0.1.0
