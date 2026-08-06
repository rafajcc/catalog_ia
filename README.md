# CatalogIA - PrestaShop Product Synchronization

A complete desktop application for preparing and uploading products to PrestaShop using its Webservice API.

## Overview

CatalogIA is a full-stack application designed to streamline the product catalog management process for PrestaShop stores. It enables users to:
- Import products from CSV files
- Select and associate images with products
- Generate missing or deficient product descriptions using AI
- Review and edit all changes before syncing
- Synchronize products, stock levels, and images to PrestaShop

## Architecture Decisions

### Backend (Node.js + TypeScript)

The backend handles all business logic, file operations, and API communication:

1. **Server Architecture**: Express.js provides a lightweight, scalable web framework
2. **Module System**: Clear separation of concerns with each module having a single responsibility
3. **File Handling**: Local file system operations for CSV and image management
4. **No Database**: State is managed in-memory and persisted to disk via logs and state files
5. **Security**: All credentials are stored in environment variables, never exposed in frontend

### Frontend (React + TypeScript)

The frontend provides the user interface and visual feedback:

1. **Component-Based**: Modular React components for each screen/purpose
2. **State Management**: React state and context API for application state
3. **Real-time Updates**: WebSocket or polling for progress tracking
4. **Responsive Design**: Mobile and desktop compatible interface
5. **Internationalization**: Spanish is the default UI language, English is selectable via a toggle in the header; the preference is persisted in `localStorage`

### File Selection Strategy

To overcome browser security limitations for reading arbitrary files:
- Use a Node.js backend that handles file uploads via HTTP endpoints
- Frontend provides file selection through standard HTML file inputs
- Backend processes files and stores temporary copies
- This ensures proper security and cross-platform compatibility

## Installation and Setup

### Prerequisites
- Node.js 18+ (for both backend and frontend)
- TypeScript compiler
- Git for version control

### Installation Steps

1. Clone the repository:
```bash
git clone https://github.com/rafajcc/catalog_ia.git
cd catalog_ia
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

4. Create environment file:
```bash
cp backend/.env.example backend/.env
```

5. Configure environment variables in `backend/.env`:
```dotenv
# PrestaShop Configuration
PRESTASHOP_BASE_URL=https://your-shop.com
PRESTASHOP_API_KEY=your-api-key-here
PRESTASHOP_LANGUAGE=1 (default language ID)

# AI Provider Configuration (optional)
AI_PROVIDER=openai
AI_API_KEY=your-openai-key-here
AI_MODEL=gpt-4-turbo
AI_MAX_TOKENS=1000

# Application Configuration
DRY_RUN=true (set to false to actually sync)
UPLOAD_DIR=./uploads
LOG_DIR=./logs
PORT=3000
FRONTEND_URL=http://localhost:5173

# Image Processing
MAX_IMAGES_PER_PRODUCT=5
IMAGE_MIN_SIZE=1024 (minimum image dimension)
IMAGE_ALLOWED_FORMATS=image/jpeg,image/png,image/webp
```

### Running the Application

The app has two parts that run together: the **backend** (API on `http://localhost:3000`) and the **frontend** (web UI on `http://localhost:5173`). The frontend dev server proxies all `/api` and `/uploads` requests to the backend.

You do **not** need to run all the commands below — only the ones for the scenario you are in (development, production, or testing).

| Command (in `backend/`) | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload — http://localhost:3000 |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build (run `npm run build` first) |

| Command (in `frontend/`) | What it does |
|---|---|
| `npm run dev` | Vite dev server — http://localhost:5173 |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run preview` | Preview the production build |

#### Development (daily work)

Open **two terminals** and run one command in each:

```bash
# Terminal 1 — backend
cd backend
npm run dev

# Terminal 2 — frontend
cd frontend
npm run dev
```

Then open **http://localhost:5173** in your browser. `npm run dev` already compiles and reloads on changes, so this is all you need for development.

#### Production (deploy)

Run these **after** you already tested in development:

```bash
# Backend
cd backend
npm run build      # compile to dist/
npm start          # serve the compiled API

# Frontend
cd ../frontend
npm run build      # generate frontend/dist/ with the optimized static files
npm run preview    # serve that build locally to check it (optional)
```

The backend serves the API; the frontend `dist/` folder is static files you deploy to any web server (nginx, Netlify, Vercel, etc.). `npm run preview` in `frontend/` only serves that build locally to check it before deploying — Vite uses `preview` instead of `start` because the frontend is a static site, not a long-running Node server (that is why only the backend has `start`).

#### Testing

Testing is separate from running the app: you do not need the servers up, just Jest. See [Running the Tests](#running-the-tests) below for the exact commands.

## Project Structure

### Root
```
catalog_ia/
├── backend/               # Express API (see below)
├── frontend/              # React UI (see below)
├── test/                  # Backend Jest test suites (e.g. test/csv-parser.test.ts)
├── examples/              # Sample CSV and images
├── docs/                  # Reserved for documentation (currently empty)
├── .gitignore
├── CHANGELOG.md
├── LICENSE
├── README.md
└── tsconfig.json          # Base TypeScript config
```

### Backend
```
backend/
├── src/
│   ├── index.ts           # Main entry point
│   ├── app.ts             # Express application setup
│   ├── routes.ts          # API routes (mounts the processing modules)
│   ├── store.ts           # In-memory data store (per app instance)
│   ├── types.ts           # Shared type definitions
│   ├── utils/             # Shared utilities
│   │   ├── logger.ts      # Logging configuration
│   │   └── error-handler.ts # Central error handling
│   └── modules/           # Business logic modules
│       ├── csv-parser/        # CSV parsing and encoding detection
│       ├── validator/        # Product validation logic
│       ├── product-normalizer/ # Field normalization
│       ├── image-matcher/   # Image product matching
│       ├── image-ranker/    # Image selection logic
│       ├── ai-text-suggester/ # AI text generation
│       ├── prestashop-client/ # PrestaShop Webservice API client
│       ├── sync-service/   # Main synchronization service
│       ├── review-state/   # Editable review state management
│       └── audit-log/      # Audit logging
├── package.json
├── .env.example
├── .eslintrc.json
├── jest.config.js
└── tsconfig.json
```

### API Endpoints

All endpoints live under `/api` and are defined in `backend/src/routes.ts`. The backend is **stateless**: uploads, parsed datasets, validation/matching/suggestion results, sync sessions and review states live in an in-memory store scoped to each app instance (uploaded files are persisted on disk under `backend/uploads/`). Sync sessions run in **dry-run mode** by default, so nothing is written to PrestaShop until the Web Service is configured and real execution is enabled.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/status`, `/api/health` | Liveness / health checks |
| GET | `/api/config` | Read the current configuration |
| PUT | `/api/config` | Update (and merge) the configuration |
| POST | `/api/config/test/prestashop` | Test the PrestaShop Web Service connection |
| POST | `/api/config/test/ai` | Test the AI provider (mock provider needs no API key) |
| POST | `/api/upload/csv` | Upload a CSV file (multipart `file`) |
| POST | `/api/upload/images` | Upload product images (multipart `files[]`) |
| POST | `/api/upload/folder` | Scan an image folder already on the server (`{ folderPath }`) |
| POST | `/api/process/csv` | Parse an uploaded CSV into a `data_id` (`{ fileId }`) |
| GET | `/api/process/csv/:fileId` | Get the parsed dataset for an upload |
| POST | `/api/validate/products/:dataId` | Validate the products of a dataset |
| GET | `/api/validate/results/:dataId` | Get stored validation results |
| POST | `/api/images/match/:dataId` | Match images to products (`{ strategy, threshold, max_images_per_product }`) |
| GET | `/api/images/results/:dataId` | Get stored image-matching results |
| POST | `/api/ai/suggest/:dataId` | Generate AI text suggestions (mock/OpenAI/Anthropic/OpenRouter) |
| GET | `/api/ai/suggestions/:dataId` | Get stored AI suggestions |
| POST | `/api/sync/session/:dataId` | Create a dry-run sync session (`{ batch_size }`) |
| GET | `/api/sync/session/:sessionId` | Get a sync session |
| POST | `/api/sync/start/:sessionId` | Execute a sync session (dry-run safe) |
| POST | `/api/sync/cancel/:sessionId` | Cancel a sync session |
| GET | `/api/sync/results/:sessionId` | Get sync results |
| GET | `/api/sync/export/:sessionId/:format` | Export sync results as `json` or `csv` |
| GET | `/api/review/state/:dataId` | Load the review state for a dataset |
| PUT | `/api/review/state/:dataId` | Update review edits |
| POST | `/api/review/apply/:dataId` | Apply field/image edits |
| POST | `/api/review/batch/:dataId` | Run a batch action (`{ action, targetIds }`) |
| GET | `/api/review/export/:dataId` | Export the review state as JSON |
| GET | `/api/download/:filePath` | Download an uploaded file (path-traversal guarded) |
| GET | `/api/logs` | Read recent logs |

### Frontend
```
frontend/
├── index.html
├── src/
│   ├── main.tsx           # React entry point
│   ├── App.tsx            # Root component
│   ├── types.ts           # Shared type definitions
│   ├── services/          # API service layer (api-service.ts)
│   ├── hooks/             # Custom React hooks (useApi)
│   ├── utils/             # Utility functions (format, download)
│   ├── styles/            # Global CSS styles
│   ├── components/        # UI components
│   │   ├── layout/          # Header and tab navigation
│   │   ├── configuration/   # Settings for PrestaShop and AI
│   │   ├── data-upload/     # CSV and image selection
│   │   ├── validation/      # Validation results display
│   │   ├── image-matching/  # Image selection interface
│   │   ├── ai-suggestions/  # AI text editing
│   │   ├── sync/            # Sync progress and results
│   │   └── review/          # Final review screen
│   └── pages/
│       └── dashboard/       # Main dashboard
├── package.json
├── .eslintrc.json
├── jest.config.cjs
├── jest.setup.ts
├── jest.styleMock.cjs
├── tsconfig.json
└── vite.config.ts
```

### Examples and Documentation
```
examples/
├── example-products.csv    # Sample CSV file
└── example-images/         # Sample images directory

docs/                       # Reserved for documentation (currently empty)
```

## PrestaShop Compatibility

### Supported PrestaShop Versions
- PrestaShop 1.7.x
- PrestaShop 2.0.x
- PrestaShop 2.1.x
- PrestaShop 2.2.x

### Webservice API Features

1. **Product Operations**
   - GET product by reference or EAN
   - Create/update products via PUT/PATCH
   - Retrieve stock information

2. **Stock Management**
   - Update stock levels via stock_availables
   - Handle multiple combinations

3. **Image Management**
   - Upload product images via multipart/form-data
   - Associate images with products

4. **Language Support**
   - Configurable default language
   - Multi-language support for fields

### API Implementation Details

- **XML Support**: All product and stock operations use XML
- **Multipart Upload**: Image uploads use multipart/form-data
- **Authentication**: Webservice API key authentication
- **Error Handling**: Comprehensive error handling with retry logic

## Features

### 1. Configuration
- PrestaShop connection settings
- AI provider configuration
- CSV field mapping
- Language and currency settings
- Dry-run mode toggle

### 2. Data Upload
- CSV file selection and parsing
- Image folder selection
- Encoding detection for CSV files
- Preview of first rows

### 3. Validation
- Required field validation
- EAN/ISBN validation
- Stock and price validation
- Duplicate detection
- Missing data detection

### 4. Image Matching
- EAN/reference-based matching
- Multi-pattern matching support
- AI-powered image selection (optional)
- Fallback to deterministic matching

### 5. AI Text Generation
- Configurable AI providers (OpenAI, Anthropic, Mock)
- Text quality and length validation
- SEO-friendly suggestions
- Editable suggestions interface

### 6. Review Interface
- Complete product preview
- Editable fields (titles, descriptions, stock, images)
- Batch operations (accept/reject)
- Validation status indicators

### 7. Synchronization
- Batch processing with progress tracking
- Retry logic for failed operations
- Comprehensive audit logging
- Detailed progress reports

## Security and Robustness

### Security Measures
- Backend secures all credentials
- Input sanitization for all user inputs
- File type validation for uploads
- Rate limiting for API endpoints
- Secure session management

### Error Handling
- Comprehensive error logging
- Graceful failure handling
- Detailed error messages
- Retry mechanisms
- Circuit breakers for API failures

## Configuration

### CSV Field Mapping
The application supports flexible CSV column mapping:
- `ean` / `ean13` - Product EAN/ISBN (required)
- `reference` - Product reference (required)
- `name` - Product name
- `description_short` - Short description
- `description` - Full description
- `price` - Price (leave empty to keep the store value)
- `wholesale_price` - Wholesale price (leave empty to keep the store value)
- `quantity` - Stock quantity (leave empty to keep the store stock)
- `brand` - Brand name
- `category` - Product category
- `tax` - PrestaShop tax rules group ID (as configured in the store)
- `image_hints` - Image file naming hints

### AI Provider Support
- **OpenAI**: GPT-4, GPT-3.5 models
- **Anthropic**: Claude models
- **Mock**: For testing without API costs
- **OpenRouter**: Access to multiple providers

### Image Processing
- Configurable maximum images per product
- Image quality validation
- Format support (JPEG, PNG, WebP)
- Size validation
- Duplicate detection

## Running the Tests

Tests use **Jest + ts-jest**. The backend and frontend are independent projects: each has its own Jest configuration, its own scripts, and must be run from its own folder.

> **Windows (PowerShell):** if `npm` is blocked by the execution policy, use `npm.cmd` instead of `npm` in every command below. PowerShell may also show git/npm output in red — that is normal and does not mean the command failed.

### Backend tests

Configuration: `backend/jest.config.js`. Test files are written in TypeScript and live in `test/` (e.g. `test/csv-parser.test.ts`); you can also place `*.test.ts` files next to the code under `backend/src/`. Shared test factories (`makeProduct`, `makeRow`) live in `test/helpers.ts`.

| Command | What it does |
|---|---|
| `npm test` | Runs the full backend test suite |
| `npm run test:watch` | Runs tests in watch mode (re-runs on changes) |
| `npm run test:coverage` | Runs tests with a coverage report |
| `npm run test:csv` | Runs only the CSV parser tests |
| `npm run test:validator` | Runs only the product validator tests |
| `npm run test:normalizer` | Runs only the product normalizer tests |
| `npm run test:image-matcher` | Runs only the image matcher tests |
| `npm run test:image-ranker` | Runs only the image ranker tests |
| `npm run test:review-state` | Runs only the review state manager tests |
| `npm run test:audit-log` | Runs only the audit log tests |
| `npm run test:logger` | Runs only the logger tests |
| `npm run test:error-handler` | Runs only the error handler tests |
| `npm run test:ai-suggester` | Runs only the AI text suggester tests (mock provider, no API calls) |
| `npm run test:app` | Runs only the Express app integration tests (supertest) |
| `npm run test:api-routes` | Runs only the API route integration tests (supertest, in-memory store) |
| `npm run test:index` | Runs only the server entry point tests |
| `npm run test:prestashop` | Runs only the PrestaShop client tests (mocked axios, no network) |
| `npm run test:sync-service` | Runs only the sync service tests (faked collaborators) |

All commands above run from the `backend/` folder:

```bash
cd backend
npm test
```

Coverage is collected from `backend/src/**/*.ts` and covers all modules: the pure-logic modules (`csv-parser`, `validator`, `product-normalizer`, `image-matcher`, `image-ranker`, `review-state`, `audit-log`, `logger`, `error-handler`, `ai-text-suggester`), the Express app and server entry point, and the network-facing `prestashop-client` and `sync-service` (tested with mocked axios / faked collaborators).

To add a new test, create a file like `test/<module>.test.ts`:

```ts
import { CSVParser } from '../backend/src/modules/csv-parser/csv-parser';

describe('CSVParser', () => {
  it('parses a CSV file', async () => {
    const parser = new CSVParser({ encoding: 'utf8' });
    const result = await parser.parseFile('../examples/example-products.csv');
    expect(result.valid_rows).toBeGreaterThan(0);
  });
});
```

#### Code quality checks (backend)

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `npm run lint` | ESLint over `src/` |
| `npm run lint:fix` | Auto-fix lint issues |

### Frontend tests

Configuration: `frontend/jest.config.cjs`. Tests run in jsdom with React Testing Library and are colocated next to their sources (e.g. `src/components/sync/SyncPanel.test.tsx`).

| Command | What it does |
|---|---|
| `npm test` | Runs the full frontend test suite |
| `npm run test:watch` | Runs tests in watch mode (re-runs on changes) |
| `npm run test:coverage` | Runs tests with a coverage report |
| `npm run test:app` | Runs only the root app tests (`App.test.tsx`) |
| `npm run test:dashboard` | Runs only the dashboard page tests |
| `npm run test:layout` | Runs only the header and tab navigation tests |
| `npm run test:upload` | Runs only the data upload panel tests |
| `npm run test:configuration` | Runs only the configuration form tests |
| `npm run test:validation` | Runs only the product validation panel tests |
| `npm run test:images` | Runs only the image matching panel tests |
| `npm run test:ai` | Runs only the AI suggestions panel tests |
| `npm run test:sync` | Runs only the synchronization panel tests |
| `npm run test:review` | Runs only the review panel tests |
| `npm run test:hooks` | Runs only the hook tests (`useApi`, `useBackendStatus`) |
| `npm run test:services` | Runs only the API service tests (mocked axios) |
| `npm run test:utils` | Runs only the utility tests (formatting, download) |

All commands above run from the `frontend/` folder:

```bash
cd frontend
npm test
```

Any subset of tests can also be run directly, e.g. `npx jest --testPathPattern=SyncPanel`.

The frontend suite covers the API layer (mocked axios, including the 401/500 interceptors), utilities, hooks, every panel component (with the API service module mocked), and the full dashboard flow end-to-end through the UI. Current coverage is ~94%.

#### Code quality checks (frontend)

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `npm run lint` | ESLint over `src/` (TS + React) |
| `npm run lint:fix` | Auto-fix lint issues |

### Suggested workflow before committing

```bash
# Backend
cd backend
npm run typecheck
npm test
npm run lint

# Frontend
cd ../frontend
npm run typecheck
npm test
npm run lint
```

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   - Change the port in `.env` files
   - Use `PORT=3001` or similar

2. **CORS Errors**
   - Configure `FRONTEND_URL` correctly
   - Check if frontend is running on expected port

3. **API Authentication**
   - Verify PrestaShop API key is correct
   - Check if API key has necessary permissions

4. **File Upload Issues**
   - Ensure files are not too large
   - Check file encoding for CSV files

## Contributing

### Code Standards
- TypeScript with strict type checking
- ESLint for code quality
- Prettier for code formatting
- Jest for testing

### Pull Request Process
1. Fork the repository
2. Create a feature branch
3. Commit changes with descriptive messages
4. Push to your branch
5. Create a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues, please visit the GitHub repository or create an issue in the issue tracker.

## Changelog

See CHANGELOG.md for recent updates and new features

---

*This project is designed to be a complete, production-ready solution for PrestaShop product catalog synchronization with comprehensive features and robust error handling.*
