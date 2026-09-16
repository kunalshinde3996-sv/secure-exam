import crypto from "crypto";
import { db } from "../db";
import { CustodyEvent, EventType, Role } from "../types";

export const GENESIS_HASH = "0".repeat(64);

const AUTO_FLAG_EVENT_TYPES = new Set<EventType>([
  "EARLY_ACCESS_ATTEMPT",
  "TAMPER_SUSPECTED",
]);

export interface Actor {
  id: number;
  role: Role;
}

export interface HashInput {
  paperId: number;
  eventType: EventType;
  actorId: number;
  actorRole: Role;
  createdAt: string;
  prevHash: string;
  metadata: unknown;
}

export interface ChainVerifyResult {
  valid: boolean;
  brokenAtEventId?: number;
  reason?: string;
  totalEvents: number;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value ?? {}));
}

export function computeHash(input: HashInput): string {
  const raw = [
    input.paperId,
    input.eventType,
    input.actorId,
    input.actorRole,
    input.createdAt,
    input.prevHash,
    canonicalJsonStringify(input.metadata),
  ].join("|");

  return crypto.createHash("sha256").update(raw).digest("hex");
}

const paperExistsStmt = db.prepare("SELECT id FROM exam_papers WHERE id = ?");

const latestEventStmt = db.prepare(
  "SELECT * FROM custody_events WHERE paper_id = ? ORDER BY id DESC LIMIT 1"
);

const allEventsStmt = db.prepare(
  "SELECT * FROM custody_events WHERE paper_id = ? ORDER BY id ASC"
);

const getEventByIdStmt = db.prepare("SELECT * FROM custody_events WHERE id = ?");

const insertEventStmt = db.prepare(`
  INSERT INTO custody_events
    (paper_id, event_type, actor_id, actor_role, prev_hash, hash, metadata, is_flagged, created_at)
  VALUES
    (@paper_id, @event_type, @actor_id, @actor_role, @prev_hash, @hash, @metadata, @is_flagged, @created_at)
`);

const updatePaperStatusStmt = db.prepare(
  "UPDATE exam_papers SET status = ? WHERE id = ?"
);

export function addEvent(
  paperId: number,
  eventType: EventType,
  actor: Actor,
  metadata: unknown = {},
  isFlagged?: boolean
): CustodyEvent {
  if (!paperExistsStmt.get(paperId)) {
    throw new Error(`exam paper ${paperId} does not exist`);
  }

  const runInsert = db.transaction(() => {
    const latest = latestEventStmt.get(paperId) as CustodyEvent | undefined;
    const prevHash = latest ? latest.hash : GENESIS_HASH;
    const createdAt = new Date().toISOString();
    const flagged = isFlagged ?? AUTO_FLAG_EVENT_TYPES.has(eventType);

    const hash = computeHash({
      paperId,
      eventType,
      actorId: actor.id,
      actorRole: actor.role,
      createdAt,
      prevHash,
      metadata,
    });

    const result = insertEventStmt.run({
      paper_id: paperId,
      event_type: eventType,
      actor_id: actor.id,
      actor_role: actor.role,
      prev_hash: prevHash,
      hash,
      metadata: canonicalJsonStringify(metadata),
      is_flagged: flagged ? 1 : 0,
      created_at: createdAt,
    });

    updatePaperStatusStmt.run(eventType, paperId);

    return getEventByIdStmt.get(result.lastInsertRowid) as CustodyEvent;
  });

  return runInsert();
}

export function getChain(paperId: number): CustodyEvent[] {
  return allEventsStmt.all(paperId) as CustodyEvent[];
}

const CENTER_CODE_LENGTH = 6;

export function generateCenterCode(): string {
  return crypto
    .randomInt(0, 10 ** CENTER_CODE_LENGTH)
    .toString()
    .padStart(CENTER_CODE_LENGTH, "0");
}

const setCenterCodeStmt = db.prepare(
  "UPDATE exam_papers SET center_code = ?, center_code_used = 0 WHERE id = ?"
);

// Adds the RECEIVED_AT_CENTER custody event and, in the same step, generates
// a fresh confirmation code for the paper (resetting center_code_used), since
// a new hand-off supersedes any earlier one.
export function addReceivedAtCenterEvent(
  paperId: number,
  actor: Actor,
  metadata: unknown = {}
): { event: CustodyEvent; centerCode: string } {
  const event = addEvent(paperId, "RECEIVED_AT_CENTER", actor, metadata);
  const centerCode = generateCenterCode();
  setCenterCodeStmt.run(centerCode, paperId);
  return { event, centerCode };
}

export function verifyChain(paperId: number): ChainVerifyResult {
  const events = allEventsStmt.all(paperId) as CustodyEvent[];

  let expectedPrevHash = GENESIS_HASH;

  for (const event of events) {
    const storedPrevHash = event.prev_hash ?? GENESIS_HASH;

    if (storedPrevHash !== expectedPrevHash) {
      return {
        valid: false,
        brokenAtEventId: event.id,
        reason: `prev_hash does not match the preceding event's hash (expected ${expectedPrevHash}, found ${storedPrevHash})`,
        totalEvents: events.length,
      };
    }

    let metadata: unknown = {};
    try {
      metadata = event.metadata ? JSON.parse(event.metadata) : {};
    } catch {
      return {
        valid: false,
        brokenAtEventId: event.id,
        reason: "stored metadata is not valid JSON",
        totalEvents: events.length,
      };
    }

    const recomputedHash = computeHash({
      paperId: event.paper_id,
      eventType: event.event_type,
      actorId: event.actor_id,
      actorRole: event.actor_role,
      createdAt: event.created_at,
      prevHash: storedPrevHash,
      metadata,
    });

    if (recomputedHash !== event.hash) {
      return {
        valid: false,
        brokenAtEventId: event.id,
        reason: "recomputed hash does not match the stored hash (event data was tampered)",
        totalEvents: events.length,
      };
    }

    expectedPrevHash = event.hash;
  }

  return { valid: true, totalEvents: events.length };
}
