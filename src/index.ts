import "dotenv/config";

import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { initSchema } from "./db";
import { authMiddleware, requireRole } from "./middleware/auth";
import authRoutes from "./routes/auth";
import devRoutes from "./routes/dev";
import healthRoutes from "./routes/health";
import papersRoutes from "./routes/papers";

const app = express();
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || origin.startsWith("http://localhost")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
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

// Must be registered after all routes: Express recognizes an error handler
// by its four-argument signature.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

const PORT = Number(process.env.PORT) || 3000;

async function main(): Promise<void> {
  await initSchema();
  app.listen(PORT, () => {
    console.log(`SecureExam backend listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start SecureExam backend:", err);
  process.exit(1);
});
