import { Router, Request, Response } from "express";
import { pool } from "../db";
import { authMiddleware, requireRole } from "../middleware/auth";
import {
  addEvent,
  addReceivedAtCenterEvent,
  getChain,
  verifyChain,
} from "../services/chain";
import { decryptPaper, encryptPaper } from "../services/crypto";
import { EVENT_TYPES, EventType, ExamPaper, Role } from "../types";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const ROLE_EVENT_PERMISSIONS: Record<Role, EventType[]> = {
  EXAM_BOARD: [...EVENT_TYPES],
  PRESS: ["SEALED"],
  DISTRIBUTION_CENTER: ["DISPATCHED", "RECEIVED_AT_CENTER"],
  INVIGILATOR: ["OPENED"],
};

function parsePaperId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

router.use(authMiddleware);

router.get(
  "/",
  requireRole("EXAM_BOARD", "DISTRIBUTION_CENTER", "PRESS", "INVIGILATOR"),
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(
      "SELECT id, title, exam_datetime, status, created_by, created_at FROM exam_papers ORDER BY id ASC"
    );

    return res.status(200).json({ papers: result.rows });
  })
);

router.post(
  "/",
  requireRole("EXAM_BOARD"),
  asyncHandler(async (req: Request, res: Response) => {
    const { title, exam_datetime } = req.body ?? {};

    if (typeof title !== "string" || title.trim().length < 1) {
      return res.status(400).json({ error: "title is required" });
    }
    if (
      typeof exam_datetime !== "string" ||
      Number.isNaN(Date.parse(exam_datetime))
    ) {
      return res
        .status(400)
        .json({ error: "exam_datetime must be a valid ISO date string" });
    }

    const insertResult = await pool.query(
      "INSERT INTO exam_papers (title, exam_datetime, created_by) VALUES ($1, $2, $3) RETURNING id",
      [title.trim(), exam_datetime, req.user!.userId]
    );
    const paperId = Number(insertResult.rows[0].id);

    await addEvent(
      paperId,
      "PRINTED",
      { id: req.user!.userId, role: req.user!.role },
      {}
    );

    const paperResult = await pool.query(
      "SELECT * FROM exam_papers WHERE id = $1",
      [paperId]
    );
    const paper = paperResult.rows[0] as ExamPaper;

    return res.status(201).json({ paper });
  })
);

router.post(
  "/:id/content",
  requireRole("EXAM_BOARD"),
  asyncHandler(async (req: Request, res: Response) => {
    const paperId = parsePaperId(req.params.id);
    if (paperId === null) {
      return res.status(400).json({ error: "invalid paper id" });
    }

    const paperResult = await pool.query(
      "SELECT id FROM exam_papers WHERE id = $1",
      [paperId]
    );
    if (paperResult.rowCount === 0) {
      return res.status(404).json({ error: "exam paper not found" });
    }

    const { content } = req.body ?? {};
    if (typeof content !== "string" || content.length < 1) {
      return res
        .status(400)
        .json({ error: "content is required and must be a non-empty string" });
    }

    const { ciphertext, iv, authTag } = encryptPaper(content);

    await pool.query(
      "UPDATE exam_papers SET ciphertext = $1, iv = $2, auth_tag = $3, is_encrypted = 1 WHERE id = $4",
      [ciphertext, iv, authTag, paperId]
    );

    return res.status(200).json({ message: "content encrypted and stored" });
  })
);

router.get(
  "/:id/download",
  requireRole("INVIGILATOR", "EXAM_BOARD"),
  asyncHandler(async (req: Request, res: Response) => {
    const paperId = parsePaperId(req.params.id);
    if (paperId === null) {
      return res.status(400).json({ error: "invalid paper id" });
    }

    const paperResult = await pool.query(
      "SELECT * FROM exam_papers WHERE id = $1",
      [paperId]
    );
    const paper = paperResult.rows[0] as ExamPaper | undefined;
    if (!paper) {
      return res.status(404).json({ error: "exam paper not found" });
    }

    // Server clock only — a client-supplied timestamp is never trusted here.
    const now = new Date();
    const unlockAt = new Date(paper.exam_datetime);

    if (now.getTime() < unlockAt.getTime()) {
      await addEvent(
        paperId,
        "EARLY_ACCESS_ATTEMPT",
        { id: req.user!.userId, role: req.user!.role },
        { attemptedBy: req.user!.userId, attemptedAt: now.toISOString() },
        true
      );

      return res.status(403).json({
        error: "paper is locked until its exam_datetime",
        exam_datetime: paper.exam_datetime,
        unlocksAt: paper.exam_datetime,
      });
    }

    if (req.user!.role !== "EXAM_BOARD") {
      const centerConfirmedResult = await pool.query(
        "SELECT id FROM custody_events WHERE paper_id = $1 AND event_type = 'CENTER_CONFIRMED' LIMIT 1",
        [paperId]
      );
      if (centerConfirmedResult.rowCount === 0) {
        return res.status(403).json({
          error: "center receipt has not been confirmed for this paper yet",
        });
      }
    }

    if (!paper.is_encrypted || !paper.ciphertext || !paper.iv || !paper.auth_tag) {
      return res
        .status(409)
        .json({ error: "no content has been uploaded for this paper" });
    }

    const alreadyOpenedResult = await pool.query(
      "SELECT id FROM custody_events WHERE paper_id = $1 AND event_type = 'OPENED' AND actor_id = $2 LIMIT 1",
      [paperId, req.user!.userId]
    );

    if (alreadyOpenedResult.rowCount === 0) {
      await addEvent(
        paperId,
        "OPENED",
        { id: req.user!.userId, role: req.user!.role },
        { downloadedAt: now.toISOString() }
      );
    }

    const content = decryptPaper(paper.ciphertext, paper.iv, paper.auth_tag);

    return res.status(200).json({ content });
  })
);

router.get(
  "/:id/status",
  asyncHandler(async (req: Request, res: Response) => {
    const paperId = parsePaperId(req.params.id);
    if (paperId === null) {
      return res.status(400).json({ error: "invalid paper id" });
    }

    const paperResult = await pool.query(
      "SELECT exam_datetime FROM exam_papers WHERE id = $1",
      [paperId]
    );
    const paper = paperResult.rows[0] as { exam_datetime: string } | undefined;
    if (!paper) {
      return res.status(404).json({ error: "exam paper not found" });
    }

    const now = Date.now();
    const unlockAt = new Date(paper.exam_datetime).getTime();
    const locked = now < unlockAt;
    const secondsUntilUnlock = Math.max(0, Math.ceil((unlockAt - now) / 1000));

    return res
      .status(200)
      .json({ locked, exam_datetime: paper.exam_datetime, secondsUntilUnlock });
  })
);

router.post(
  "/:id/events",
  asyncHandler(async (req: Request, res: Response) => {
    const paperId = parsePaperId(req.params.id);
    if (paperId === null) {
      return res.status(400).json({ error: "invalid paper id" });
    }

    const paperResult = await pool.query(
      "SELECT * FROM exam_papers WHERE id = $1",
      [paperId]
    );
    const paper = paperResult.rows[0] as ExamPaper | undefined;
    if (!paper) {
      return res.status(404).json({ error: "exam paper not found" });
    }

    const { event_type, metadata } = req.body ?? {};

    if (
      typeof event_type !== "string" ||
      !EVENT_TYPES.includes(event_type as EventType)
    ) {
      return res
        .status(400)
        .json({ error: `event_type must be one of: ${EVENT_TYPES.join(", ")}` });
    }
    if (metadata !== undefined && !isPlainObject(metadata)) {
      return res.status(400).json({ error: "metadata must be a JSON object" });
    }

    const role = req.user!.role;
    const allowed = ROLE_EVENT_PERMISSIONS[role] ?? [];
    if (!allowed.includes(event_type as EventType)) {
      return res.status(403).json({
        error: `role ${role} is not permitted to add event type ${event_type}`,
      });
    }

    const actor = { id: req.user!.userId, role };

    if (event_type === "RECEIVED_AT_CENTER") {
      const { event, centerCode } = await addReceivedAtCenterEvent(
        paperId,
        actor,
        metadata ?? {}
      );
      return res.status(201).json({ event, centerCode });
    }

    const event = await addEvent(paperId, event_type as EventType, actor, metadata ?? {});

    return res.status(201).json({ event });
  })
);

router.post(
  "/:id/confirm-receipt",
  requireRole("INVIGILATOR", "EXAM_BOARD"),
  asyncHandler(async (req: Request, res: Response) => {
    const paperId = parsePaperId(req.params.id);
    if (paperId === null) {
      return res.status(400).json({ error: "invalid paper id" });
    }

    const paperResult = await pool.query(
      "SELECT id, center_code, center_code_used FROM exam_papers WHERE id = $1",
      [paperId]
    );
    const paper = paperResult.rows[0] as
      | { id: number; center_code: string | null; center_code_used: number }
      | undefined;
    if (!paper) {
      return res.status(404).json({ error: "exam paper not found" });
    }

    const { code } = req.body ?? {};
    if (typeof code !== "string" || code.trim().length === 0) {
      return res.status(400).json({ error: "code is required" });
    }
    const submittedCode = code.trim();

    if (!paper.center_code) {
      return res.status(409).json({
        error: "no confirmation code has been generated for this paper yet",
      });
    }
    if (paper.center_code_used) {
      return res
        .status(409)
        .json({ error: "this paper's receipt has already been confirmed" });
    }

    const actor = { id: req.user!.userId, role: req.user!.role };

    if (submittedCode !== paper.center_code) {
      await addEvent(
        paperId,
        "TAMPER_SUSPECTED",
        actor,
        { reason: "invalid center confirmation code", attemptedCode: submittedCode },
        true
      );
      return res.status(403).json({ error: "invalid code" });
    }

    await pool.query(
      "UPDATE exam_papers SET center_code_used = 1 WHERE id = $1",
      [paperId]
    );
    await addEvent(paperId, "CENTER_CONFIRMED", actor, {});

    return res.status(200).json({ success: true });
  })
);

router.get(
  "/:id/chain",
  asyncHandler(async (req: Request, res: Response) => {
    const paperId = parsePaperId(req.params.id);
    if (paperId === null) {
      return res.status(400).json({ error: "invalid paper id" });
    }

    const paperResult = await pool.query(
      "SELECT id FROM exam_papers WHERE id = $1",
      [paperId]
    );
    if (paperResult.rowCount === 0) {
      return res.status(404).json({ error: "exam paper not found" });
    }

    const events = await getChain(paperId);

    return res.status(200).json({ paperId, events });
  })
);

router.get(
  "/:id/verify",
  asyncHandler(async (req: Request, res: Response) => {
    const paperId = parsePaperId(req.params.id);
    if (paperId === null) {
      return res.status(400).json({ error: "invalid paper id" });
    }

    const paperResult = await pool.query(
      "SELECT id FROM exam_papers WHERE id = $1",
      [paperId]
    );
    if (paperResult.rowCount === 0) {
      return res.status(404).json({ error: "exam paper not found" });
    }

    const result = await verifyChain(paperId);

    return res.status(200).json(result);
  })
);

export default router;
