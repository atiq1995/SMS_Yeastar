import http from "node:http";
import { env, requireYeastarSend } from "../config/env.js";

export type YeastarSendResult = {
  accepted: boolean;
  dryRun: boolean;
  rawResponse?: string;
  errorCode?: string;
};

/** Yeastar expects 1500101=account=USER — URLSearchParams encodes the inner = and breaks auth */
function yeastarUrl(destination: string, message: string): string {
  const enc = encodeURIComponent;
  const { yeastarHost, yeastarHttpPort, yeastarUsername, yeastarPassword, yeastarSimPort } = env;
  return (
    `http://${yeastarHost}:${yeastarHttpPort}/cgi/WebCGI` +
    `?1500101=account=${enc(yeastarUsername)}` +
    `&password=${enc(yeastarPassword)}` +
    `&port=${yeastarSimPort}` +
    `&destination=${enc(destination)}` +
    `&content=${enc(message)}`
  );
}

function httpGet(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
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
  return /success/i.test(body) && !/authentication failed/i.test(body);
}

/** Yeastar TG WebCGI — account/password/destination params per firmware docs */
export async function sendSms(destination: string, message: string): Promise<YeastarSendResult> {
  const url = yeastarUrl(destination, message);

  if (!env.yeastarSendEnabled) {
    return { accepted: true, dryRun: true, rawResponse: url.replace(env.yeastarPassword, "***") };
  }

  requireYeastarSend();
  try {
    const { status, body } = await httpGet(url, 10_000);
    return {
      accepted: yeastarAccepted(body),
      dryRun: false,
      rawResponse: body.slice(0, 2000),
      errorCode: yeastarAccepted(body) ? undefined : String(status),
    };
  } catch (e) {
    return { accepted: false, dryRun: false, errorCode: String(e), rawResponse: undefined };
  }
}
