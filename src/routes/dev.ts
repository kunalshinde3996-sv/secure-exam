import { Router, Request, Response } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/auth";
import { CustodyEvent } from "../types";

const router = Router();

router.post(
  "/tamper/:eventId",
  authMiddleware,
  (req: Request, res: Response) => {
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

    const existing = db
      .prepare("SELECT * FROM custody_events WHERE id = ?")
      .get(eventId) as CustodyEvent | undefined;
    if (!existing) {
      return res.status(404).json({ error: "custody event not found" });
    }

    const { metadata } = req.body ?? {};
    const tamperedMetadata = JSON.stringify(
      metadata !== undefined
        ? metadata
        : { tampered: true, at: new Date().toISOString() }
    );

    db.prepare("UPDATE custody_events SET metadata = ? WHERE id = ?").run(
      tamperedMetadata,
      eventId
    );

    const updated = db
      .prepare("SELECT * FROM custody_events WHERE id = ?")
      .get(eventId);

    return res
      .status(200)
      .json({ warning: "metadata tampered without recomputing hash", event: updated });
  }
);

export default router;
