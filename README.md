# SecureExam

Secure exam-paper distribution and custody-tracking system — backend, plus a React
frontend in `frontend/`.

## Stack

- Backend: Node.js + Express + TypeScript (strict mode), SQLite via `better-sqlite3`
  (synchronous API, raw prepared statements — no ORM), JWT auth via `jsonwebtoken`,
  passwords hashed with `bcryptjs`
- Frontend: React + Vite + TypeScript, plain CSS, plain `fetch` (see `frontend/README.md`)

## Quick Start

1. `npm install` (in the root, for the backend) **and** `npm install` inside `frontend/`
2. Copy `.env.example` to `.env` (root) and fill in real values — see
   [Environment variables](#environment-variables) below. Also copy
   `frontend/.env.example` to `frontend/.env` if the backend won't be on the default URL.
3. `npm run seed` — wipes and recreates the database with 4 demo users (one per role)
   and two demo papers, and prints their credentials plus a live-demo walkthrough to
   the console.
4. `npm run dev` — starts the backend (port 3000) and frontend (port 5173) together.
   Equivalent to double-clicking `run.bat` on Windows.

## Other ways to run it

Backend only, with auto-reload:

```bash
npm run dev:backend
```

Frontend only:

```bash
npm run dev:frontend
```

Build and run a production backend build:

```bash
npm run build
npm start
```

## Environment variables

| Variable        | Description                                              |
|------------------|-----------------------------------------------------------|
| `PORT`           | Port the server listens on                                |
| `JWT_SECRET`     | Secret used to sign/verify JWTs                            |
| `PAPER_ENC_KEY`  | 32-byte AES-256-GCM key as 64 hex chars — see `.env.example` for how to generate one |

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

### Papers & custody chain (`/papers/...`)

All routes below require `Authorization: Bearer <token>`. Highlights (see `src/routes/papers.ts`
for the full set — create paper, upload/download content, view chain, verify chain, etc.):

- `POST /papers/:id/events` with `{ event_type: "RECEIVED_AT_CENTER", metadata }` (DISTRIBUTION_CENTER,
  or EXAM_BOARD override) also generates a random 6-digit `center_code` for the paper and returns it
  as `{ event, centerCode }`. A later `RECEIVED_AT_CENTER` regenerates the code and resets confirmation.
- `POST /papers/:id/confirm-receipt` (INVIGILATOR or EXAM_BOARD) with `{ code }` — checks it against
  the paper's `center_code`. Right code → adds a `CENTER_CONFIRMED` custody event and returns
  `{ success: true }`. Wrong code → adds a flagged `TAMPER_SUSPECTED` event and returns `403`.
- `GET /papers/:id/download` (INVIGILATOR, EXAM_BOARD) now additionally requires a `CENTER_CONFIRMED`
  event to exist for the paper (EXAM_BOARD is exempt, consistent with its admin-override role
  elsewhere), on top of the existing time-lock check.

## Data model

- `users` — id, name, email (unique), password_hash, role, created_at
- `exam_papers` — id, title, exam_datetime, status, created_by, created_at, ciphertext, iv, auth_tag,
  is_encrypted, `center_code` (random 6-digit confirmation code, set when `RECEIVED_AT_CENTER` is
  recorded), `center_code_used` (0/1)
- `custody_events` — id, paper_id, event_type, actor_id, actor_role, prev_hash, hash, metadata,
  is_flagged, created_at. `event_type` includes `CENTER_CONFIRMED` alongside the earlier types.

Schema is created automatically on server startup if it doesn't already exist, and old database
files are migrated in place to add any columns introduced since they were created.

## Demo seed data

`npm run seed` drops and recreates every table, then creates:

- 4 users, one per role (credentials printed to the console)
- **Paper A** ("Mathematics Final 2026") — a complete, unlocked, fully-verified custody chain:
  `PRINTED → SEALED → DISPATCHED → RECEIVED_AT_CENTER → CENTER_CONFIRMED → OPENED`, with content
  already uploaded.
- **Paper B** ("Physics Board Exam 2026") — locked (`exam_datetime` 5 minutes in the future at seed
  time), chain so far `PRINTED → SEALED → DISPATCHED → RECEIVED_AT_CENTER`, content already
  uploaded, and a freshly generated `center_code` printed to the console for the live demo.

Safe to re-run any time — it always wipes and rebuilds from scratch, so nothing accumulates.
