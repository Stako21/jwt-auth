import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Fingerprint from "express-fingerprint";
import AuthRootRouter from "./routers/Auth.js";
import TokenService from "./services/Token.js";
import cookieParser from "cookie-parser";

dotenv.config();

const PORT = process.env.PORT || 5000;

const app = express();

// const cors = require('cors');

app.use(cookieParser());
app.use(express.json());
// app.use(cors({ credentials: true, origin: process.env.CLIENT_URL }));
app.use(cors({ credentials: true, origin: process.env.CLIENT_URL }));

app.use(
  Fingerprint({
    parameters: [Fingerprint.useragent, Fingerprint.acceptHeaders],
  })
);

app.use("/auth", AuthRootRouter);

app.get("/resource/protected", TokenService.checkAccess, (req, res) => {
  return res.status(200).json("Ласкаво прошу!" + Date.now());
})

app.listen(PORT, () => {
  console.log("Сервер успешно запущен!!!");
});
