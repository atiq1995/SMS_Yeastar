import express from "express";
import { env } from "./config/env.js";
import { handleAddonPost } from "./servicem8/addon-handler.js";
import { authorizeUrl, exchangeCode } from "./servicem8/oauth.js";
import { startYeastarReceive } from "./yeastar/receive.js";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true, env: env.appEnv });
});

app.get("/oauth/activate", (req, res) => {
  const account_uuid = String(req.query.account_uuid || "");
  const url = authorizeUrl(account_uuid || undefined);
  res.redirect(url);
});

app.get("/oauth/callback", async (req, res) => {
  const code = String(req.query.code || "");
  const account_uuid = String(req.query.state || req.query.account_uuid || "default");
  if (!code) {
    res.status(400).send("missing code");
    return;
  }
  try {
    await exchangeCode(code, account_uuid);
    res.send("<p>OAuth connected. You can close this window and return to ServiceM8.</p>");
  } catch (e) {
    res.status(500).send(String(e));
  }
});

app.post("/addon", express.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
  void handleAddonPost(req, res);
});

app.listen(env.port, () => {
  console.log(`listening ${env.port}`);
  startYeastarReceive();
});
