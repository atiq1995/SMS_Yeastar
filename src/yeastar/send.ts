import http from "node:http";
import https from "node:https";
import { env, requireYeastarSend } from "../config/env.js";

export type YeastarSendResult = {
  accepted: boolean;
  dryRun: boolean;
  rawResponse?: string;
  errorCode?: string;
};

/** Build WebCGI URL — matches working TG400 pattern: `?1500101=account&username=...&number=...` */
function yeastarUrl(destination: string, message: string): string {
  const protocol = env.yeastarUseHttps ? "https" : "http";
  const base = `${protocol}://${env.yeastarHost}:${env.yeastarHttpPort}${env.yeastarWebCgiPath}`;
  const u = new URL(base);
  const accountKey = env.yeastarAccountQueryKey;
  const [k, v] = accountKey.includes("=") ? accountKey.split("=", 2) : ["1500101", "account"];
  u.searchParams.set(k, v ?? "account");
  u.searchParams.set("username", env.yeastarUsername);
  u.searchParams.set("password", env.yeastarPassword);
  u.searchParams.set("port", String(env.yeastarSimPort));
  u.searchParams.set(env.yeastarDestParam, destination);
  u.searchParams.set("content", message);
  return u.toString();
}

function httpGet(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
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

function yeastarAccepted(status: number, body: string): boolean {
  if (/authentication failed/i.test(body)) return false;
  if (/response:\s*success/i.test(body) || /\bsuccess\b/i.test(body)) return true;
  return status >= 200 && status < 300 && body.length > 0 && !/response:\s*error/i.test(body);
}

/** Yeastar TG WebCGI — GET /cgi/WebCGI per TG400 HTTP SMS API */
export async function sendSms(destination: string, message: string): Promise<YeastarSendResult> {
  const url = yeastarUrl(destination, message);

  if (!env.yeastarSendEnabled) {
    return { accepted: true, dryRun: true, rawResponse: url.replace(env.yeastarPassword, "***") };
  }

  requireYeastarSend();
  try {
    const { status, body } = await httpGet(url, 10_000);
    const accepted = yeastarAccepted(status, body);
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
