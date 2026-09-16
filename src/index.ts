import "dotenv/config";

import cors from "cors";
import express, { Request, Response } from "express";
import { initSchema } from "./db";
import { authMiddleware, requireRole } from "./middleware/auth";
import authRoutes from "./routes/auth";
import devRoutes from "./routes/dev";
import healthRoutes from "./routes/health";
import papersRoutes from "./routes/papers";

initSchema();

const app = express();
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

app.use(healthRoutes);
app.use("/auth", authRoutes);
app.use("/papers", papersRoutes);

if (process.env.NODE_ENV !== "production") {
  console.warn(
    "[DEV DEMO ROUTE] Mounting /dev/tamper/:eventId — this bypasses the custody chain's hashing " +
      "on purpose for demo use only. Set NODE_ENV=production to disable it."
  );
  app.use("/dev", devRoutes);
}

// Test route to verify role-based access control works end to end.
app.get(
  "/test/exam-board-only",
  authMiddleware,
  requireRole("EXAM_BOARD"),
  (_req: Request, res: Response) => {
    res.status(200).json({ message: "welcome, exam board member" });
  }
);

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`SecureExam backend listening on port ${PORT}`);
});
