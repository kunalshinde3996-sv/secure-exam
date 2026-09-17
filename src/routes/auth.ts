import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { PublicUser, Role, ROLES, User } from "../types";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET as string;
const TOKEN_EXPIRY = "12h";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.created_at,
  };
}

router.post("/register", asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length < 1) {
    return res.status(400).json({ error: "name is required" });
  }
  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ error: "a valid email is required" });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res
      .status(400)
      .json({ error: "password is required and must be at least 8 characters" });
  }
  if (typeof role !== "string" || !ROLES.includes(role as Role)) {
    return res
      .status(400)
      .json({ error: `role must be one of: ${ROLES.join(", ")}` });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
    normalizedEmail,
  ]);

  if (existing.rowCount && existing.rowCount > 0) {
    return res.status(400).json({ error: "a user with this email already exists" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const insertResult = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *",
    [name.trim(), normalizedEmail, passwordHash, role]
  );
  const user = insertResult.rows[0] as User;

  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });

  return res.status(201).json({ token, user: toPublicUser(user) });
}));

router.post("/login", asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ error: "a valid email is required" });
  }
  if (typeof password !== "string" || password.length < 1) {
    return res.status(400).json({ error: "password is required" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const result = await pool.query("SELECT * FROM users WHERE email = $1", [
    normalizedEmail,
  ]);
  const user = result.rows[0] as User | undefined;

  if (!user) {
    return res.status(401).json({ error: "invalid email or password" });
  }

  const passwordMatches = bcrypt.compareSync(password, user.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: "invalid email or password" });
  }

  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });

  return res.status(200).json({ token, user: toPublicUser(user) });
}));

export default router;
