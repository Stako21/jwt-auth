import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Fingerprint from "express-fingerprint";
import AuthRootRouter from "./routers/Auth.js";
import TokenService from "./services/Token.js";
import cookieParser from "cookie-parser";
import documentRoutes from "./routes/documents.js";
import directoryRoutes from "./routes/directoryes.js";
import securityHeaders from "./middlewares/securityHeaders.js";
import { createRateLimit } from "./middlewares/rateLimit.js";
import "./services/scheduler.js";

dotenv.config();

const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(securityHeaders);
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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

app.get("/health", (req, res) => {
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

app.use("/auth", authRateLimit, AuthRootRouter);

app.get("/resource/protected", TokenService.checkAccess, (req, res) => {
  return res.status(200).json("Ласкаво прошу!" + Date.now());
});

app.use("/documents", documentsRateLimit, documentRoutes);
app.use("/directories", directoryRoutes);

app.listen(PORT, "0.0.0.0", () => {
  console.log("Сервер успішно запущено!!!");
});
