import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Fingerprint from "express-fingerprint";
import AuthRootRouter from "./routers/Auth.js";
import TokenService from "./services/Token.js";
import cookieParser from "cookie-parser";
import documentRoutes from "./routes/documents.js";
import "./services/scheduler.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const PORT = process.env.PORT || 5000;

const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(cors({ credentials: true, origin: process.env.CLIENT_URL }));

////////// Debug static files
app.use("/_debug/pdf", express.static(path.join(__dirname, "tmp-pdf")));
//////////

app.use(
  Fingerprint({
    parameters: [Fingerprint.useragent, Fingerprint.acceptHeaders],
  }),
);

app.use("/auth", AuthRootRouter);

app.get("/resource/protected", TokenService.checkAccess, (req, res) => {
  return res.status(200).json("Ласкаво прошу!" + Date.now());
});

app.use("/documents", documentRoutes);

app.listen(PORT, "0.0.0.0", () => {
  console.log("Сервер успішно запущено!!!");
});
