export type Role =
  | "EXAM_BOARD"
  | "PRESS"
  | "DISTRIBUTION_CENTER"
  | "INVIGILATOR";

export const ROLES: Role[] = [
  "EXAM_BOARD",
  "PRESS",
  "DISTRIBUTION_CENTER",
  "INVIGILATOR",
];

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: string;
}

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  created_at: string;
}

export interface ExamPaper {
  id: number;
  title: string;
  exam_datetime: string;
  status: string;
  created_by: number;
  created_at: string;
  ciphertext: string | null;
  iv: string | null;
  auth_tag: string | null;
  is_encrypted: number;
}

export type EventType =
  | "PRINTED"
  | "SEALED"
  | "DISPATCHED"
  | "RECEIVED_AT_CENTER"
  | "OPENED"
  | "EARLY_ACCESS_ATTEMPT"
  | "TAMPER_SUSPECTED";

export const EVENT_TYPES: EventType[] = [
  "PRINTED",
  "SEALED",
  "DISPATCHED",
  "RECEIVED_AT_CENTER",
  "OPENED",
  "EARLY_ACCESS_ATTEMPT",
  "TAMPER_SUSPECTED",
];

export interface CustodyEvent {
  id: number;
  paper_id: number;
  event_type: EventType;
  actor_id: number;
  actor_role: Role;
  prev_hash: string | null;
  hash: string;
  metadata: string | null;
  is_flagged: number;
  created_at: string;
}

export interface JwtPayload {
  userId: number;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
