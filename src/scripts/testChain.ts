import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

const TEST_DB_FILENAME = "secureexam.test.sqlite";

function removeDbFiles(dbPath: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const filePath = dbPath + suffix;
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
    }
  }
}

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  PASS - ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL - ${message}`);
  }
}

async function main(): Promise<void> {
  const dbPath = path.join(process.cwd(), TEST_DB_FILENAME);
  removeDbFiles(dbPath);
  process.env.DB_PATH = TEST_DB_FILENAME;

  // dynamic import so DB_PATH is set before db.ts opens its connection
  const { db, initSchema } = await import("../db");
  const { addEvent, verifyChain, GENESIS_HASH } = await import(
    "../services/chain"
  );

  initSchema();

  const passwordHash = bcrypt.hashSync("password123", 10);
  const userResult = db
    .prepare(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
    )
    .run("Chain Tester", "chaintester@example.com", passwordHash, "EXAM_BOARD");
  const userId = Number(userResult.lastInsertRowid);

  const paperResult = db
    .prepare(
      "INSERT INTO exam_papers (title, exam_datetime, created_by) VALUES (?, ?, ?)"
    )
    .run(
      "Chain Test Paper",
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      userId
    );
  const paperId = Number(paperResult.lastInsertRowid);

  const actor = { id: userId, role: "EXAM_BOARD" as const };

  console.log("== Building a clean custody chain ==");
  const printed = addEvent(paperId, "PRINTED", actor, { printedBy: "press-1" });
  assert(printed.prev_hash === GENESIS_HASH, "genesis event links to GENESIS_HASH");

  const sealed = addEvent(paperId, "SEALED", actor, { seal: "A1" });
  assert(sealed.prev_hash === printed.hash, "SEALED links to PRINTED's hash");

  const dispatched = addEvent(paperId, "DISPATCHED", actor, { vehicle: "V-102" });
  assert(dispatched.prev_hash === sealed.hash, "DISPATCHED links to SEALED's hash");

  const received = addEvent(paperId, "RECEIVED_AT_CENTER", actor, { center: "C-7" });
  assert(
    received.prev_hash === dispatched.hash,
    "RECEIVED_AT_CENTER links to DISPATCHED's hash"
  );

  const opened = addEvent(paperId, "OPENED", actor, { invigilator: "inv-1" });
  assert(opened.prev_hash === received.hash, "OPENED links to RECEIVED_AT_CENTER's hash");

  console.log("\n== (a) verifying the clean chain ==");
  const cleanResult = verifyChain(paperId);
  console.log(" ", cleanResult);
  assert(cleanResult.valid === true, "clean chain verifies as valid");
  assert(cleanResult.totalEvents === 5, "clean chain reports 5 total events");
  assert(cleanResult.brokenAtEventId === undefined, "clean chain has no brokenAtEventId");

  console.log("\n== (b) tampering with a past event's metadata directly ==");
  db.prepare("UPDATE custody_events SET metadata = ? WHERE id = ?").run(
    JSON.stringify({ seal: "TAMPERED" }),
    sealed.id
  );

  const tamperedResult = verifyChain(paperId);
  console.log(" ", tamperedResult);
  assert(tamperedResult.valid === false, "tampered chain verifies as invalid");
  assert(
    tamperedResult.brokenAtEventId === sealed.id,
    "brokenAtEventId points at the tampered SEALED event"
  );

  db.close();
  removeDbFiles(dbPath);

  console.log();
  if (failures > 0) {
    console.error(`${failures} assertion(s) failed.`);
    process.exit(1);
  }

  console.log("All custody chain assertions passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
