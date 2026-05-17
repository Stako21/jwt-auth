import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Fingerprint from "express-fingerprint";
import cookieParser from "cookie-parser";
import AuthRootRouter from "./routers/Auth.js";
import documentRoutes from "./routes/documents.js";
import directoryRoutes from "./routes/directoryes.js";
import reportRoutes from "./routes/reports.js";
import regionNotificationsRoutes from "./routes/regionNotifications.js";
import configRoutes from "./routes/config.js";
import balanceRoutes from "./routes/balances.js";
import securityHeaders from "./middlewares/securityHeaders.js";
import { createRateLimit } from "./middlewares/rateLimit.js";
import authMiddleware from "./middlewares/authMiddleware.js";
import { startScheduler } from "./services/scheduler.js";

dotenv.config();

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isProduction = process.env.NODE_ENV === "production";
const privateDevOriginPattern =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(?::\d+)?$/;

function isAllowedOrigin(origin) {
  if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    return true;
  }

  if (!isProduction && privateDevOriginPattern.test(origin)) {
    return true;
  }

  return false;
}

const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(securityHeaders);
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
  }),
);

app.use(
  Fingerprint({
    parameters: [Fingerprint.useragent, Fingerprint.acceptHeaders],
  }),
);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyPrefix: "auth",
});

const documentsRateLimit = createRateLimit({
  windowMs: 60 * 1000,
  max: 300,
  keyPrefix: "documents",
});

app.use("/api/auth", authRateLimit, AuthRootRouter);
app.use("/api/config", authMiddleware, configRoutes);
app.use("/api/balances", authMiddleware, balanceRoutes);
app.use("/api/reports", authMiddleware, reportRoutes);
app.use("/api/region-notifications", authMiddleware, regionNotificationsRoutes);
app.use("/api/documents", documentsRateLimit, authMiddleware, documentRoutes);
app.use("/api/directories", authMiddleware, directoryRoutes);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server started successfully on port ${PORT}`);

  startScheduler()
    .then(() => {
      console.log("Scheduler started successfully");
    })
    .catch((error) => {
      console.error("Scheduler startup failed:", error);
      process.exit(1);
    });
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Server failed to start: port ${PORT} is already in use`);
  } else {
    console.error("Server failed to start:", error);
  }

  process.exit(1);
});
