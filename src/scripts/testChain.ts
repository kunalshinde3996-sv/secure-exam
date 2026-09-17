import "dotenv/config";

import bcrypt from "bcryptjs";

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
  const { pool, initSchema } = await import("../db");
  const { addEvent, verifyChain, GENESIS_HASH } = await import(
    "../services/chain"
  );

  await initSchema();

  const testEmail = `chaintester+${Date.now()}@example.com`;
  const passwordHash = bcrypt.hashSync("password123", 10);
  const userResult = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id",
    ["Chain Tester", testEmail, passwordHash, "EXAM_BOARD"]
  );
  const userId = Number(userResult.rows[0].id);

  const paperResult = await pool.query(
    "INSERT INTO exam_papers (title, exam_datetime, created_by) VALUES ($1, $2, $3) RETURNING id",
    [
      "Chain Test Paper",
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      userId,
    ]
  );
  const paperId = Number(paperResult.rows[0].id);

  try {
    const actor = { id: userId, role: "EXAM_BOARD" as const };

    console.log("== Building a clean custody chain ==");
    const printed = await addEvent(paperId, "PRINTED", actor, { printedBy: "press-1" });
    assert(printed.prev_hash === GENESIS_HASH, "genesis event links to GENESIS_HASH");

    const sealed = await addEvent(paperId, "SEALED", actor, { seal: "A1" });
    assert(sealed.prev_hash === printed.hash, "SEALED links to PRINTED's hash");

    const dispatched = await addEvent(paperId, "DISPATCHED", actor, { vehicle: "V-102" });
    assert(dispatched.prev_hash === sealed.hash, "DISPATCHED links to SEALED's hash");

    const received = await addEvent(paperId, "RECEIVED_AT_CENTER", actor, { center: "C-7" });
    assert(
      received.prev_hash === dispatched.hash,
      "RECEIVED_AT_CENTER links to DISPATCHED's hash"
    );

    const opened = await addEvent(paperId, "OPENED", actor, { invigilator: "inv-1" });
    assert(opened.prev_hash === received.hash, "OPENED links to RECEIVED_AT_CENTER's hash");

    console.log("\n== (a) verifying the clean chain ==");
    const cleanResult = await verifyChain(paperId);
    console.log(" ", cleanResult);
    assert(cleanResult.valid === true, "clean chain verifies as valid");
    assert(cleanResult.totalEvents === 5, "clean chain reports 5 total events");
    assert(cleanResult.brokenAtEventId === undefined, "clean chain has no brokenAtEventId");

    console.log("\n== (b) tampering with a past event's metadata directly ==");
    await pool.query("UPDATE custody_events SET metadata = $1 WHERE id = $2", [
      JSON.stringify({ seal: "TAMPERED" }),
      sealed.id,
    ]);

    const tamperedResult = await verifyChain(paperId);
    console.log(" ", tamperedResult);
    assert(tamperedResult.valid === false, "tampered chain verifies as invalid");
    assert(
      tamperedResult.brokenAtEventId === sealed.id,
      "brokenAtEventId points at the tampered SEALED event"
    );
  } finally {
    await pool.query("DELETE FROM custody_events WHERE paper_id = $1", [paperId]);
    await pool.query("DELETE FROM exam_papers WHERE id = $1", [paperId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    await pool.end();
  }

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
