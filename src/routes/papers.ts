import { Router, Request, Response } from "express";
import { db } from "../db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { addEvent, getChain, verifyChain } from "../services/chain";
import { EVENT_TYPES, EventType, ExamPaper, Role } from "../types";

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
  requireRole("EXAM_BOARD", "DISTRIBUTION_CENTER"),
  (_req: Request, res: Response) => {
    const papers = db
      .prepare(
        "SELECT id, title, exam_datetime, status, created_by, created_at FROM exam_papers ORDER BY id ASC"
      )
      .all();

    return res.status(200).json({ papers });
  }
);

router.post("/", requireRole("EXAM_BOARD"), (req: Request, res: Response) => {
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

  const insert = db.prepare(
    "INSERT INTO exam_papers (title, exam_datetime, created_by) VALUES (?, ?, ?)"
  );
  const result = insert.run(title.trim(), exam_datetime, req.user!.userId);
  const paperId = Number(result.lastInsertRowid);

  addEvent(
    paperId,
    "PRINTED",
    { id: req.user!.userId, role: req.user!.role },
    {}
  );

  const paper = db
    .prepare("SELECT * FROM exam_papers WHERE id = ?")
    .get(paperId) as ExamPaper;

  return res.status(201).json({ paper });
});

router.post("/:id/events", (req: Request, res: Response) => {
  const paperId = parsePaperId(req.params.id);
  if (paperId === null) {
    return res.status(400).json({ error: "invalid paper id" });
  }

  const paper = db
    .prepare("SELECT * FROM exam_papers WHERE id = ?")
    .get(paperId) as ExamPaper | undefined;
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

  const event = addEvent(
    paperId,
    event_type as EventType,
    { id: req.user!.userId, role },
    metadata ?? {}
  );

  return res.status(201).json({ event });
});

router.get("/:id/chain", (req: Request, res: Response) => {
  const paperId = parsePaperId(req.params.id);
  if (paperId === null) {
    return res.status(400).json({ error: "invalid paper id" });
  }

  const paper = db
    .prepare("SELECT id FROM exam_papers WHERE id = ?")
    .get(paperId);
  if (!paper) {
    return res.status(404).json({ error: "exam paper not found" });
  }

  const events = getChain(paperId);

  return res.status(200).json({ paperId, events });
});

router.get("/:id/verify", (req: Request, res: Response) => {
  const paperId = parsePaperId(req.params.id);
  if (paperId === null) {
    return res.status(400).json({ error: "invalid paper id" });
  }

  const paper = db
    .prepare("SELECT id FROM exam_papers WHERE id = ?")
    .get(paperId);
  if (!paper) {
    return res.status(404).json({ error: "exam paper not found" });
  }

  const result = verifyChain(paperId);

  return res.status(200).json(result);
});

export default router;
