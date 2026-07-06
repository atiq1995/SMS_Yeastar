import { env, requireYeastarSend } from "../config/env.js";

export type YeastarSendResult = {
  accepted: boolean;
  dryRun: boolean;
  rawResponse?: string;
  errorCode?: string;
};

/** Yeastar TG WebCGI — account/password/destination params per firmware docs */
export async function sendSms(destination: string, message: string): Promise<YeastarSendResult> {
  const port = env.yeastarHttpPort;
  const base = `http://${env.yeastarHost}:${port}/cgi/WebCGI`;
  const u = new URL(base);
  // Yeastar format: 1500101=account=USER (not a separate username= param)
  u.searchParams.set("1500101", `account=${env.yeastarUsername}`);
  u.searchParams.set("password", env.yeastarPassword);
  u.searchParams.set("port", String(env.yeastarSimPort));
  u.searchParams.set("destination", destination);
  u.searchParams.set("content", message);

  if (!env.yeastarSendEnabled) {
    return { accepted: true, dryRun: true, rawResponse: u.toString().replace(env.yeastarPassword, "***") };
  }

  requireYeastarSend();
  const res = await fetch(u.toString(), { method: "GET", signal: AbortSignal.timeout(10_000) });
  const text = await res.text().catch(() => "");
  return {
    accepted: res.ok,
    dryRun: false,
    rawResponse: text.slice(0, 2000),
    errorCode: res.ok ? undefined : String(res.status),
  };
}
