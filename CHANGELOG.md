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
- Upload validation for product images: only `.jpg` and `.jpeg` files are accepted (backend `assertImageFile` + folder scan, and frontend guards with an `accept=".jpg,.jpeg"` input); the image label now reads "Product images (JPG/JPEG only)" / "Imágenes de producto (solo JPG/JPEG)".
- The "Configuration" view moved out of the tab navigation into a gear button in the top header (next to status and language selector); the tab bar stays visible while configuration is open so any tab can be selected to return to it.
- The validation, images, AI, sync and review tabs are disabled (non-clickable) until a CSV has been uploaded and processed, so downstream steps cannot be reached without data.
- Multiple CSV and image uploads no longer replace each other: the upload panel keeps a running counter next to the "Product catalog (CSV)" and "Product images" labels plus an "Uploaded files" list at the bottom with every file name, persisted while navigating between tabs.
- Duplicate uploads are rejected: uploading the same CSV or image file again shows a clear error in the panel and is also refused by the backend (by filename), and re-selecting an image folder skips files already present.
- Uploaded-file management in the upload panel: the "Uploaded files" list is now backed by `GET /api/uploads` and supports per-file and delete-all removal (`DELETE /api/uploads/csv/:id`, `DELETE /api/uploads/images/:id`, `DELETE /api/uploads/csv/all`, `DELETE /api/uploads/images/all`) with success messages, and the CSV/data tabs re-lock when every CSV has been deleted.
- CSV template download: a "Download template" button in the upload panel fetches `GET /api/template/csv` and saves `catalog_template.csv` (16 ordered columns: `ean,reference,name,sku,price,wholesale_price,quantity,stock,brand,manufacturer,category,tax,weight,description_short,description,image_hints`).
- CSV upload format validation: uploads are rejected when the column count differs from the 16 expected columns or the required headers are missing (`assertCsvFormat` in `backend/src/routes.ts`, with a "Download the template" hint); cell content is deliberately not validated here since data validation happens in the next tab.
- CSV upload success message now shows the uploaded file name (`upload.successUploaded`), and new i18n keys cover template download and deleted CSV/image/all messages in Spanish and English.

### Fixed
- A lint error from an empty `CSVParserConfig` interface left in the CSV parser; it is removed and `CSV_TEMPLATE_HEADERS` is exported instead.

### Fixed
- The frontend `api-service.ts` had an invalid Python-style docstring at the top and imported a non-existent `types` module; both are resolved, methods are typed against the shared API contract, and the service is exposed through a lazy singleton.
- Uploading a non-CSV file was accepted silently: `POST /api/upload/csv` now rejects files without a `.csv` extension, empty files, and binary content (NUL-byte sniff), and the frontend upload panel refuses non-`.csv` selections before any request is made.
- A garbage file that passed upload produced a misleading "0 productos": `POST /api/process/csv` now fails with a clear 400 when the file has no recognized product columns, contains no data rows, or yields zero extractable products.
- Server error messages were never shown in the UI: `getErrorMessage` only read the generic axios message. It now surfaces `error.response.data.message` / `error.response.data.error.message` from the API.
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
