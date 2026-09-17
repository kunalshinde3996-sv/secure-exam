import { Router, Request, Response } from "express";
import { pool } from "../db";
import { authMiddleware } from "../middleware/auth";
import { CustodyEvent } from "../types";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.post(
  "/tamper/:eventId",
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "not found" });
    }

    console.warn(
      `[DEV DEMO ROUTE] POST /dev/tamper/${req.params.eventId} called by user ${req.user?.userId} — ` +
        "directly mutating custody_events.metadata WITHOUT recomputing hashes, purely to demonstrate " +
        "that verifyChain() detects it. This route must never be reachable in production."
    );

    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ error: "invalid event id" });
    }

    const existingResult = await pool.query(
      "SELECT * FROM custody_events WHERE id = $1",
      [eventId]
    );
    const existing = existingResult.rows[0] as CustodyEvent | undefined;
    if (!existing) {
      return res.status(404).json({ error: "custody event not found" });
    }

    const { metadata } = req.body ?? {};
    const tamperedMetadata = JSON.stringify(
      metadata !== undefined
        ? metadata
        : { tampered: true, at: new Date().toISOString() }
    );

    await pool.query("UPDATE custody_events SET metadata = $1 WHERE id = $2", [
      tamperedMetadata,
      eventId,
    ]);

    const updatedResult = await pool.query(
      "SELECT * FROM custody_events WHERE id = $1",
      [eventId]
    );

    return res
      .status(200)
      .json({ warning: "metadata tampered without recomputing hash", event: updatedResult.rows[0] });
  })
);

export default router;
