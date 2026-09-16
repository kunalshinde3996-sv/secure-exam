# SecureExam

Secure exam-paper distribution and custody-tracking system — backend foundation.

## Stack

- Node.js + Express + TypeScript (strict mode)
- SQLite via `better-sqlite3` (synchronous API, raw prepared statements — no ORM)
- JWT auth via `jsonwebtoken`, passwords hashed with `bcryptjs`

## Install & run

```bash
npm install
cp .env.example .env   # then edit PORT / JWT_SECRET if needed
npm run dev             # starts the dev server with auto-reload
```

Build and run a production build:

```bash
npm run build
npm start
```

## Environment variables

| Variable    | Description                       |
|-------------|------------------------------------|
| `PORT`      | Port the server listens on         |
| `JWT_SECRET`| Secret used to sign/verify JWTs    |

## API

### `GET /health`

Returns `{ "status": "ok" }`.

### `POST /auth/register`

Body:

```json
{ "name": "Jane Doe", "email": "jane@example.com", "password": "at-least-8-chars", "role": "EXAM_BOARD" }
```

`role` must be one of `EXAM_BOARD`, `PRESS`, `DISTRIBUTION_CENTER`, `INVIGILATOR`.

Returns `201` with `{ token, user }` on success, `400` with a clear error message on invalid input.

### `POST /auth/login`

Body:

```json
{ "email": "jane@example.com", "password": "at-least-8-chars" }
```

Returns `200` with `{ token, user }` on success, `401` on bad credentials, `400` on malformed input.

### `GET /test/exam-board-only`

Protected example route. Requires `Authorization: Bearer <token>` and role `EXAM_BOARD`. Returns `403` for any other role, `401` if unauthenticated.

## Data model

- `users` — id, name, email (unique), password_hash, role, created_at
- `exam_papers` — id, title, exam_datetime, status, created_by, created_at
- `custody_events` — id, paper_id, event_type, actor_id, actor_role, prev_hash, hash, metadata, is_flagged, created_at

Schema is created automatically on server startup if it doesn't already exist.
