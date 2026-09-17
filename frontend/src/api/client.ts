import type {
  ChainVerifyResult,
  CustodyEvent,
  EventType,
  ExamPaper,
  PaperStatus,
  PublicUser,
} from "../types";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:3000";

const TOKEN_KEY = "secureexam_token";
const USER_KEY = "secureexam_user";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): PublicUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: PublicUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (res.status === 401) {
    clearSession();
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError("Session expired. Please log in again.", 401, data);
  }

  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

export function login(
  email: string,
  password: string
): Promise<{ token: string; user: PublicUser }> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function listPapers(): Promise<{ papers: ExamPaper[] }> {
  return request("/papers");
}

export function createPaper(
  title: string,
  examDatetime: string
): Promise<{ paper: ExamPaper }> {
  return request("/papers", {
    method: "POST",
    body: JSON.stringify({ title, exam_datetime: examDatetime }),
  });
}

export function uploadContent(
  paperId: number,
  content: string
): Promise<{ message: string }> {
  return request(`/papers/${paperId}/content`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function getChain(
  paperId: number
): Promise<{ paperId: number; events: CustodyEvent[] }> {
  return request(`/papers/${paperId}/chain`);
}

export function verifyChain(paperId: number): Promise<ChainVerifyResult> {
  return request(`/papers/${paperId}/verify`);
}

export function addEvent(
  paperId: number,
  eventType: EventType,
  metadata: Record<string, unknown> = {}
): Promise<{ event: CustodyEvent }> {
  return request(`/papers/${paperId}/events`, {
    method: "POST",
    body: JSON.stringify({ event_type: eventType, metadata }),
  });
}

export function getStatus(paperId: number): Promise<PaperStatus> {
  return request(`/papers/${paperId}/status`);
}

export function downloadPaper(paperId: number): Promise<{ content: string }> {
  return request(`/papers/${paperId}/download`);
}
