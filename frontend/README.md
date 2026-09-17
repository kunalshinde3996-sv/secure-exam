# SecureExam Frontend

React + Vite + TypeScript frontend for the SecureExam custody-tracking system. Plain CSS,
plain `fetch`, plain `useState`/`useEffect` — no UI framework, no state management library.

## Install & run

```bash
npm install
npm run dev
```

This starts the dev server on **http://localhost:5173**.

The backend (`C:\SecureExam`) must already be running on **http://localhost:3000** (`npm run dev`
from the backend root) — see that project's own README for setup.

## Environment variables

| Variable        | Description                                  | Default                 |
|------------------|-----------------------------------------------|--------------------------|
| `VITE_API_URL`   | Base URL of the SecureExam backend API        | `http://localhost:3000` |

Copy `.env.example` to `.env` and edit if your backend runs somewhere else:

```bash
cp .env.example .env
```

## Logging in

There is no signup page here — register users against the backend first (e.g. via
`POST /auth/login` payloads or the backend's own test flow), one per role:
`EXAM_BOARD`, `PRESS`, `DISTRIBUTION_CENTER`, `INVIGILATOR`. Then log in at `/login`;
the dashboard at `/dashboard` renders a different view per role.

## CORS

The backend does not currently send CORS headers. If `npm run dev` here (port 5173) can't
reach the backend (port 3000) from the browser due to a CORS error, add CORS middleware to
the backend (e.g. the `cors` package, allowing `http://localhost:5173`) — that's a backend
change and is intentionally left for you to add.

## Build

```bash
npm run build
```

Type-checks with `tsc -b` and produces a production build in `dist/`.
