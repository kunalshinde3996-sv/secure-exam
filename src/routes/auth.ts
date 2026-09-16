import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { PublicUser, Role, ROLES, User } from "../types";

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

router.post("/register", (req: Request, res: Response) => {
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

  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(normalizedEmail);

  if (existing) {
    return res.status(400).json({ error: "a user with this email already exists" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const insert = db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
  );
  const result = insert.run(name.trim(), normalizedEmail, passwordHash, role);

  const user = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(result.lastInsertRowid) as User;

  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });

  return res.status(201).json({ token, user: toPublicUser(user) });
});

router.post("/login", (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ error: "a valid email is required" });
  }
  if (typeof password !== "string" || password.length < 1) {
    return res.status(400).json({ error: "password is required" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(normalizedEmail) as User | undefined;

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
});

export default router;
