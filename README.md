# EasyRakh

EasyRakh is a modern Khata (ledger) management system built with Next.js. It helps businesses manage customers, suppliers, custom ledgers, daily cash records, inventory, invoices, payments, and searchable transaction history from one place.

## Features

- Customer, supplier, and custom ledger management
- Debit, credit, balance, and transaction tracking
- Daily cash book with bill attachments and PDF export
- Inventory and stock management with search and PDF export
- Invoice creation, payment tracking, and downloadable PDFs
- Dashboard analytics and global search
- Installable PWA experience
- English and Hindi AI voice assistant powered by Google Gemini
- Redis-backed caching and rate limiting
- Cloudinary-backed file storage

## Prerequisites

Install these before starting:

- [Node.js](https://nodejs.org/) 22.13 or newer
- Corepack (included with supported Node.js 22 releases) or pnpm 11.8.0
- MongoDB and Redis, either locally or through compatible hosted services
- A [Cloudinary](https://cloudinary.com/) account for uploads and production builds

Optional integrations:

- A [Google Gemini API key](https://aistudio.google.com/app/apikey) for the voice assistant
- SMTP credentials for password-reset emails

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/Alok-Automobiles/EasyRakh.git
cd EasyRakh
```

### 2. Install dependencies

The repository pins the supported pnpm version in `package.json`.

```bash
corepack enable
pnpm install --frozen-lockfile
```

### 3. Install and start MongoDB and Redis

The Next.js development server runs directly on your machine and connects to MongoDB and Redis. If both services are already installed or hosted, skip to the connection settings below.

On macOS with Homebrew, install and start the local services with:

```bash
brew tap mongodb/brew
brew install mongodb-community@8.0
brew services start mongodb-community@8.0

brew tap redis/redis
brew install --cask redis
redis-server "$(brew --prefix)/etc/redis.conf"
```

The Redis server stays attached to that terminal. Keep it open while developing, or configure Redis as a background service for your operating system.

For other operating systems, follow the official [MongoDB Community installation guide](https://www.mongodb.com/docs/manual/administration/install-community/) and [Redis Open Source installation guide](https://redis.io/docs/latest/operate/oss_and_stack/install/install-redis/).

Verify locally installed services before starting EasyRakh:

```bash
mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok'
redis-cli ping
```

The commands should print `1` for MongoDB and `PONG` for Redis.

When using hosted services:

- Put the MongoDB connection string in `MONGODB_URI`.
- Configure Redis with `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD` when required.
- `REDIS_URL` and TLS-only Redis endpoints are not currently supported.

### 4. Configure environment variables

Copy the maintained environment template:

```bash
cp .env.example .env.local
```

Generate a secure JWT secret:

```bash
openssl rand -base64 32
```

Open `.env.local`, replace the placeholder values, and paste the generated value into `JWT_SECRET`. Never commit `.env.local`.

The variables are grouped by purpose in `.env.example`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `REDIS_HOST`, `REDIS_PORT` | Yes | Redis connection details |
| `REDIS_PASSWORD` | When applicable | Password for authenticated Redis instances |
| `JWT_SECRET` | Yes | Signs authentication tokens |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Yes | File uploads, attachments, and production builds |
| `GEMINI_API_KEY` | No | Enables the AI voice assistant |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | No | Enables password-reset emails |
| `ADMIN_EMAILS` | No | Comma-separated email addresses allowed to view admin usage |

For example, `ADMIN_EMAILS=owner@example.com,manager@example.com`. Each address must match the email of a registered EasyRakh account.

Without SMTP credentials, password-reset codes are written to the development server log. Do not rely on this fallback in production.

### 5. Start the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Create the first account at [http://localhost:3000/register](http://localhost:3000/register); MongoDB collections and indexes are initialized automatically.

### 6. Verify the setup

Check MongoDB and Redis together:

```bash
curl --fail http://localhost:3000/api/health
```

A correct setup returns HTTP 200 and reports both `redis` and `database` as `healthy`.

## Available Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm build` | Create a production build |
| `pnpm start` | Run the production build |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run unit tests in watch mode |
| `pnpm test:unit` | Run the unit test suite once |
| `pnpm test:e2e` | Run Playwright end-to-end tests |

Install the Playwright browser once before running end-to-end tests:

```bash
pnpm exec playwright install chromium
```

## Production Check

Before deploying, configure all required environment variables and run:

```bash
pnpm test:unit
pnpm lint
pnpm build
pnpm start
```

The production server listens on port 3000 by default.

## Maintenance Commands

These commands are intended for existing databases, not fresh installations. Back up production data before running a migration.

| Command | Description |
| --- | --- |
| `pnpm migrate:quantity-date` | Populate inventory quantity update dates |
| `pnpm migrate:invoice-profit` | Populate invoice profit data |
| `pnpm backfill:read-models` | Rebuild cached read-model collections |
| `pnpm check:query-shapes` | Inspect frequently used MongoDB query shapes |

## Troubleshooting

- **`JWT_SECRET environment variable is required`**: add a non-empty `JWT_SECRET` to `.env.local`, then restart the server.
- **`REDIS_HOST and REDIS_PORT are required`**: check the Redis values in `.env.local`. A `REDIS_URL` alone will not work.
- **Cloudinary configuration error during build**: provide all three `CLOUDINARY_*` variables.
- **`/api/health` returns HTTP 503**: inspect its JSON response to identify whether MongoDB or Redis is unavailable.
- **Port 3000 is already in use**: run `pnpm dev --port 3001` and open `http://localhost:3001`.

## Contributing

1. Fork and clone the repository.
2. Create a branch: `git switch -c feature/your-feature`.
3. Make the change and run the relevant tests.
4. Commit and push your branch.
5. Open a pull request describing the change and its validation.

## Reporting Issues

Please open a GitHub issue for bugs and feature requests. For security concerns, follow [SECURITY.md](SECURITY.md).
