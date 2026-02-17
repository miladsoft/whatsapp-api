# WhatsApp API Service (Next.js + whatsapp-web.js)

Production-ready WhatsApp messaging API using:
- Next.js (latest, App Router, TypeScript)
- whatsapp-web.js + Puppeteer
- BullMQ + Redis queue/worker
- Multi-session support via `sessionId`

## Features

- Multi-session WhatsApp clients (`main`, `sales`, etc.)
- Persistent login sessions with `LocalAuth` (`WWEBJS_DATA_DIR`)
- Restart-safe auth (no re-scan if session already persisted)
- API key protection for `/api/v1/*`
- Optional Basic Auth for `/admin` and `/api/admin/*`
- Admin dashboard:
  - session status
  - QR display
  - reconnect/logout
  - send test message
- Queue-based sending with BullMQ worker:
  - exponential retries
  - per-session sequential processing
  - send pacing (1.5s minimum interval per session)

## Project Structure

- `src/app/(admin)/admin/page.tsx`
- `src/app/(admin)/admin/components/*`
- `src/app/api/v1/*`
- `src/server/whatsapp/manager.ts`
- `src/server/whatsapp/client.ts`
- `src/server/queue/queue.ts`
- `src/server/queue/worker.ts`
- `src/server/auth/apiKey.ts`
- `src/server/store/statusStore.ts`

## Environment Variables

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Required/important:
- `API_KEY=...`
- `REDIS_URL=redis://localhost:6379`
- `WWEBJS_DATA_DIR=.data/wwebjs` (local dev)
- `BASE_URL=http://localhost:3000`
- `DEFAULT_SESSION_ID=main`
- `WORKER_TOKEN=...` (worker -> internal route auth)

Optional:
- `ADMIN_PASSWORD=...` (if set, enables Basic Auth on admin routes)
- `ADMIN_USERNAME=admin`
- `CORS_ORIGINS=http://localhost:3000,https://your-app.com`
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` (usually for Docker)

In Docker, keep `WWEBJS_DATA_DIR=/data/wwebjs` (already configured in `docker-compose.yml`).

## Local Development

1) Install dependencies

```bash
npm install
```

2) Start Redis

```bash
docker run --rm -p 6379:6379 redis:7-alpine
```

3) Start web + worker

```bash
npm run dev:all
```

Or in separate terminals:

```bash
npm run dev
npm run dev:worker
```

4) Open admin

`http://localhost:3000/admin`

Scan QR from the dashboard for your session.

## Docker

```bash
docker compose up --build
```

Services:
- `web`: Next.js API/admin app
- `worker`: BullMQ worker consuming send jobs
- `redis`: Redis backend

Auth/session data persists in Docker volume `wwebjs_data` mounted at `/data/wwebjs`.

## Troubleshooting

- If messages stay in `queued`, verify the worker is running.
- Local dev: run `npm run dev:all` (or start `npm run dev:worker` in a second terminal).
- Docker: ensure the `worker` service is up (`docker compose ps`).
- API now returns `503 UNAVAILABLE` when no active queue worker is detected, instead of accepting jobs that cannot be consumed.

## API

All `/api/v1/*` routes require header:

`x-api-key: <API_KEY>`

Interactive docs:

- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/api/openapi`

### Send text

`POST /api/v1/messages/text`

Body:

```json
{
  "sessionId": "main",
  "to": "15551234567",
  "text": "Hello from API"
}

`sessionId` is optional. If omitted, the currently active session from the admin dashboard is used.
```

### Send media (URL-based)

`POST /api/v1/messages/media`

Body:

```json
{
  "sessionId": "main",
  "to": "15551234567",
  "caption": "Invoice",
  "mediaUrl": "https://example.com/file.pdf",
  "filename": "file.pdf"
}

`sessionId` is optional. If omitted, the currently active session from the admin dashboard is used.
```

### Sessions

- `GET /api/v1/sessions`
- `GET /api/v1/sessions/:id/status`
- `GET /api/v1/sessions/:id/qr` (PNG)
- `POST /api/v1/sessions/:id/logout`
- `POST /api/v1/sessions/:id/reconnect`

## Curl Examples

```bash
curl -X POST http://localhost:3000/api/v1/messages/text \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"sessionId":"main","to":"15551234567","text":"Hello from API"}'
```

```bash
curl -X POST http://localhost:3000/api/v1/messages/media \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"sessionId":"main","to":"15551234567","caption":"Test media","mediaUrl":"https://example.com/image.jpg","filename":"image.jpg"}'
```

```bash
curl -X GET http://localhost:3000/api/v1/sessions \
  -H "x-api-key: $API_KEY"
```

## Response Format

Success:

```json
{ "ok": true, "data": { ... } }
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "..."
  }
}
```
