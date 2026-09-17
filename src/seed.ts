import "dotenv/config";

import bcrypt from "bcryptjs";
import { pool, resetDatabase } from "./db";
import { addEvent, addReceivedAtCenterEvent, verifyChain } from "./services/chain";
import { encryptPaper } from "./services/crypto";
import type { Role } from "./types";

interface SeedUser {
  name: string;
  email: string;
  password: string;
  role: Role;
}

const SEED_USERS: SeedUser[] = [
  { name: "Exam Board Admin", email: "board@exam.com", password: "board123", role: "EXAM_BOARD" },
  { name: "Press Operator", email: "press@exam.com", password: "press123", role: "PRESS" },
  { name: "Center Manager", email: "center@exam.com", password: "center123", role: "DISTRIBUTION_CENTER" },
  { name: "Chief Invigilator", email: "invigilator@exam.com", password: "inv123", role: "INVIGILATOR" },
];

async function insertUser(user: SeedUser): Promise<number> {
  const passwordHash = bcrypt.hashSync(user.password, 10);
  const result = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id",
    [user.name, user.email, passwordHash, user.role]
  );
  return Number(result.rows[0].id);
}

async function insertPaper(
  title: string,
  examDatetime: string,
  createdBy: number
): Promise<number> {
  const result = await pool.query(
    "INSERT INTO exam_papers (title, exam_datetime, created_by) VALUES ($1, $2, $3) RETURNING id",
    [title, examDatetime, createdBy]
  );
  return Number(result.rows[0].id);
}

async function uploadPaperContent(paperId: number, content: string): Promise<void> {
  const { ciphertext, iv, authTag } = encryptPaper(content);
  await pool.query(
    "UPDATE exam_papers SET ciphertext = $1, iv = $2, auth_tag = $3, is_encrypted = 1 WHERE id = $4",
    [ciphertext, iv, authTag, paperId]
  );
}

async function main(): Promise<void> {
  console.log("Resetting database...");
  await resetDatabase();

  console.log("Creating demo users...");
  const userIds = {} as Record<Role, number>;
  for (const user of SEED_USERS) {
    userIds[user.role] = await insertUser(user);
  }

  const board = { id: userIds.EXAM_BOARD, role: "EXAM_BOARD" as const };
  const press = { id: userIds.PRESS, role: "PRESS" as const };
  const center = { id: userIds.DISTRIBUTION_CENTER, role: "DISTRIBUTION_CENTER" as const };
  const invigilator = { id: userIds.INVIGILATOR, role: "INVIGILATOR" as const };

  console.log("Creating Paper A (completed, unlocked, full chain)...");
  const paperAExamDatetime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const paperAId = await insertPaper("Mathematics Final 2026", paperAExamDatetime, board.id);
  await addEvent(paperAId, "PRINTED", board, {});
  await addEvent(paperAId, "SEALED", press, {});
  await addEvent(paperAId, "DISPATCHED", center, {});
  await addReceivedAtCenterEvent(paperAId, center, {});
  await pool.query("UPDATE exam_papers SET center_code_used = 1 WHERE id = $1", [paperAId]);
  await addEvent(paperAId, "CENTER_CONFIRMED", invigilator, {});
  await addEvent(paperAId, "OPENED", invigilator, { downloadedAt: new Date().toISOString() });
  await uploadPaperContent(
    paperAId,
    "PAPER A - Q1: Solve x^2+5x+6=0. Q2: Find derivative of sin(x)."
  );

  const paperAVerify = await verifyChain(paperAId);
  if (!paperAVerify.valid) {
    throw new Error(
      `Paper A's chain failed to verify right after seeding it — this should never happen: ${JSON.stringify(paperAVerify)}`
    );
  }

  console.log("Creating Paper B (locked, in progress, for live demo)...");
  const paperBExamDatetime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const paperBId = await insertPaper("Physics Board Exam 2026", paperBExamDatetime, board.id);
  await addEvent(paperBId, "PRINTED", board, {});
  await addEvent(paperBId, "SEALED", press, {});
  await addEvent(paperBId, "DISPATCHED", center, {});
  const { centerCode: paperBCode } = await addReceivedAtCenterEvent(paperBId, center, {});
  await uploadPaperContent(
    paperBId,
    "PAPER B - Q1: State Newton's second law. Q2: Define acceleration."
  );

  await printDemoScript({
    paperAId,
    paperAVerified: paperAVerify.valid,
    paperBId,
    paperBCode,
    paperBExamDatetime,
  });

  await pool.end();
}

async function printDemoScript(info: {
  paperAId: number;
  paperAVerified: boolean;
  paperBId: number;
  paperBCode: string;
  paperBExamDatetime: string;
}): Promise<void> {
  const line = "=".repeat(70);

  console.log(`\n${line}`);
  console.log("SECUREEXAM DEMO — SEED COMPLETE");
  console.log(line);

  console.log("\nLogin credentials (all 4 roles):\n");
  for (const user of SEED_USERS) {
    console.log(`  ${user.role.padEnd(20)} ${user.email.padEnd(24)} ${user.password}`);
  }

  console.log("\n--- Paper A: Mathematics Final 2026 (id " + info.paperAId + ") ---");
  console.log("  Status: complete, unlocked, full custody chain");
  console.log(
    "  PRINTED -> SEALED -> DISPATCHED -> RECEIVED_AT_CENTER -> CENTER_CONFIRMED -> OPENED"
  );
  console.log(`  Chain verify: ${info.paperAVerified ? "VALID" : "INVALID (unexpected!)"}`);

  console.log("\n--- Paper B: Physics Board Exam 2026 (id " + info.paperBId + ") ---");
  console.log("  Status: locked, in progress — for the live demo");
  console.log("  PRINTED -> SEALED -> DISPATCHED -> RECEIVED_AT_CENTER");
  console.log(`  Unlocks at: ${info.paperBExamDatetime} (5 minutes from seed time)`);
  console.log(`  CENTER CONFIRMATION CODE: ${info.paperBCode}`);

  console.log(`\n${line}`);
  console.log("LIVE DEMO SCRIPT");
  console.log(line);
  console.log(`
  1. Start both servers:      npm run dev
  2. Log in as EXAM_BOARD (board@exam.com / board123):
       - Show Paper A in the dashboard with a green VERIFIED integrity badge.
       - Click "View Chain" to show the full custody timeline.
       - (Optional) call POST /dev/tamper/:eventId on one of Paper A's events,
         then "Verify Chain" again to show the badge flip to red TAMPERED.
  3. Log in as DISTRIBUTION_CENTER (center@exam.com / center123):
       - Show Paper B already marked RECEIVED_AT_CENTER.
       - The confirmation code above (${info.paperBCode}) is what the center
         phones/radios through to the invigilator on site.
  4. Log in as INVIGILATOR (invigilator@exam.com / inv123):
       - Show Paper B locked, with the live countdown ticking down.
       - Call POST /papers/${info.paperBId}/confirm-receipt with
         { "code": "${info.paperBCode}" } to confirm receipt.
       - Once the countdown reaches zero, download Paper B to show the
         decrypted content.
       - Try downloading BEFORE the countdown ends (or with a wrong code) to
         show the 403 and the resulting EARLY_ACCESS_ATTEMPT /
         TAMPER_SUSPECTED entries in Paper B's chain.
`);
  console.log(line + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
