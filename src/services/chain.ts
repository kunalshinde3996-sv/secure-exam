import crypto from "crypto";
import { pool } from "../db";
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

export async function addEvent(
  paperId: number,
  eventType: EventType,
  actor: Actor,
  metadata: unknown = {},
  isFlagged?: boolean
): Promise<CustodyEvent> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const paperExists = await client.query(
      "SELECT id FROM exam_papers WHERE id = $1",
      [paperId]
    );
    if (paperExists.rowCount === 0) {
      throw new Error(`exam paper ${paperId} does not exist`);
    }

    const latestResult = await client.query(
      "SELECT * FROM custody_events WHERE paper_id = $1 ORDER BY id DESC LIMIT 1",
      [paperId]
    );
    const latest = latestResult.rows[0] as CustodyEvent | undefined;
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

    const insertResult = await client.query(
      `INSERT INTO custody_events
        (paper_id, event_type, actor_id, actor_role, prev_hash, hash, metadata, is_flagged, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        paperId,
        eventType,
        actor.id,
        actor.role,
        prevHash,
        hash,
        canonicalJsonStringify(metadata),
        flagged ? 1 : 0,
        createdAt,
      ]
    );

    await client.query("UPDATE exam_papers SET status = $1 WHERE id = $2", [
      eventType,
      paperId,
    ]);

    await client.query("COMMIT");
    return insertResult.rows[0] as CustodyEvent;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getChain(paperId: number): Promise<CustodyEvent[]> {
  const result = await pool.query(
    "SELECT * FROM custody_events WHERE paper_id = $1 ORDER BY id ASC",
    [paperId]
  );
  return result.rows as CustodyEvent[];
}

const CENTER_CODE_LENGTH = 6;

export function generateCenterCode(): string {
  return crypto
    .randomInt(0, 10 ** CENTER_CODE_LENGTH)
    .toString()
    .padStart(CENTER_CODE_LENGTH, "0");
}

// Adds the RECEIVED_AT_CENTER custody event and, in the same step, generates
// a fresh confirmation code for the paper (resetting center_code_used), since
// a new hand-off supersedes any earlier one.
export async function addReceivedAtCenterEvent(
  paperId: number,
  actor: Actor,
  metadata: unknown = {}
): Promise<{ event: CustodyEvent; centerCode: string }> {
  const event = await addEvent(paperId, "RECEIVED_AT_CENTER", actor, metadata);
  const centerCode = generateCenterCode();
  await pool.query(
    "UPDATE exam_papers SET center_code = $1, center_code_used = 0 WHERE id = $2",
    [centerCode, paperId]
  );
  return { event, centerCode };
}

export async function verifyChain(paperId: number): Promise<ChainVerifyResult> {
  const events = await getChain(paperId);

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
