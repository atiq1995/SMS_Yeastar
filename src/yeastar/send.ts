import http from "node:http";
import https from "node:https";
import { env, requireYeastarSend } from "../config/env.js";

export type YeastarSendResult = {
  accepted: boolean;
  dryRun: boolean;
  rawResponse?: string;
  errorCode?: string;
};

/** Manual query string — URLSearchParams encodes `account=user` and breaks TG auth */
function yeastarUrl(destination: string, message: string): string {
  const enc = encodeURIComponent;
  const protocol = env.yeastarUseHttps ? "https" : "http";
  return (
    `${protocol}://${env.yeastarHost}:${env.yeastarHttpPort}${env.yeastarWebCgiPath}` +
    `?1500101=account=${enc(env.yeastarUsername)}` +
    `&password=${enc(env.yeastarPassword)}` +
    `&port=${enc(String(env.yeastarSimPort))}` +
    `&${env.yeastarDestParam}=${enc(destination)}` +
    `&content=${enc(message)}`
  );
}

function httpGet(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    // ponytail: TG400 returns non-standard HTTP — curl works; strict parser fails without this
    const req = lib.get(url, { timeout: timeoutMs, insecureHTTPParser: true }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
  });
}

function yeastarAccepted(body: string): boolean {
  return /response:\s*success/i.test(body) || (/\bsuccess\b/i.test(body) && !/authentication failed/i.test(body));
}

/** Yeastar TG WebCGI — GET /cgi/WebCGI */
export async function sendSms(destination: string, message: string): Promise<YeastarSendResult> {
  const url = yeastarUrl(destination, message);

  if (!env.yeastarSendEnabled) {
    return { accepted: true, dryRun: true, rawResponse: url.replace(env.yeastarPassword, "***") };
  }

  requireYeastarSend();
  try {
    const { status, body } = await httpGet(url, 10_000);
    const accepted = yeastarAccepted(body);
    return {
      accepted,
      dryRun: false,
      rawResponse: body.slice(0, 2000) || `HTTP ${status}`,
      errorCode: accepted ? undefined : String(status),
    };
  } catch (e) {
    return { accepted: false, dryRun: false, errorCode: String(e), rawResponse: String(e) };
  }
}
