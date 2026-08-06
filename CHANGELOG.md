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
- PrestaShop client tests with a mocked axios instance (interceptors, XML parsing, product/stock/image sync flows).
- Sync service tests using faked collaborators (planning, execution, dry-run, summaries).
- New npm scripts `test:prestashop` and `test:sync-service`.
- Complete React frontend UI built on the scaffolding: typed API layer (`api-service.ts`), shared types, formatting/download utilities, `useApi` hook, and tabbed dashboard with upload, configuration, validation, image matching, AI suggestions, sync and review panels.
- Frontend testing infrastructure (jest + ts-jest + jsdom, RTL, user-event) and tests for services, utilities, hooks, every panel component, and the dashboard flow (96 tests, ~94% coverage).
- New frontend scripts `test:coverage`, plus `tsconfig.json`, `vite.config.ts`, `.eslintrc.json`, and `jest.setup.ts` for the frontend.
- Frontend partial test scripts (`test:app`, `test:dashboard`, `test:layout`, `test:upload`, `test:configuration`, `test:validation`, `test:images`, `test:ai`, `test:sync`, `test:review`, `test:hooks`, `test:services`, `test:utils`) mirroring the backend's per-module test commands.
- Full UI internationalization (Spanish by default, English selectable) via an `I18nProvider`/`useI18n` hook with a language toggle in the header and `localStorage` persistence (`frontend/src/i18n.tsx`).
- README reorganized with separate backend and frontend sections for running the application, running the tests, and code quality checks.
- `GET /api/status` endpoint so the frontend status indicator reports the backend as online.
- Full backend API routes (`backend/src/routes.ts`) wiring the frontend contract to the processing modules: configuration get/update + PrestaShop/AI connection tests, CSV/image/folder uploads, CSV parsing, product validation, image matching, AI text suggestions, dry-run sync sessions, review state/batch/export, downloads (path-traversal guarded), health and logs. State is held in a per-app-instance in-memory store (`backend/src/store.ts`); uploaded files are persisted under `backend/uploads/` (now gitignored).
- `ReviewStateManager.getState()` so routes can serialize the current review state.
- API route integration tests (`test/api-routes.test.ts`, supertest) covering the full upload → parse → validate → match → suggest → sync → review flow plus error cases (18 tests), and a `test:api-routes` npm script.
- Clarified the image-folder input label in both languages ("…already on the server") in the upload panel.
- Backend status recovery via a new `useBackendStatus` hook: the dashboard now polls `GET /api/status` periodically (every 5s while offline, every 30s while online, a 60s heartbeat while the tab is hidden, and never overlapping in-flight requests), so the connection chip recovers to "Online"/"En línea" automatically when the backend comes back.

### Fixed
- The frontend `api-service.ts` had an invalid Python-style docstring at the top and imported a non-existent `types` module; both are resolved, methods are typed against the shared API contract, and the service is exposed through a lazy singleton.
- PrestaShop client XML responses were never parsed to objects (`xml2json` returns a JSON string), so `resolveProduct`/`resolveStockAvailable` always returned `null` and `createProduct` read undefined ids. The parsed response is now unwrapped and normalized (single/multiple results, `_attributes`/`_cdata`/`_text` extraction).
- Product image uploads always failed because `formdata-node` rejects raw Buffers; the file buffer is now wrapped in a `Blob`.
- Image uploads used a hardcoded `/tmp/product_<id>_image_<n>.jpg` placeholder path; they now upload the actual file path from the selected image.

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
