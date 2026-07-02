import net from "node:net";
import { env } from "../config/env.js";
import { insertInbound } from "../db/repository.js";

let client: net.Socket | undefined;

function parseSmsBlock(lines: string[]): { from?: string; content?: string; port?: number } {
  const out: { from?: string; content?: string; port?: number } = {};
  for (const line of lines) {
    const [k, ...rest] = line.split(":");
    if (!k || rest.length === 0) continue;
    const v = rest.join(":").trim();
    const key = k.trim().toLowerCase();
    if (key === "from" || key === "sender") out.from = v;
    if (key === "content" || key === "message" || key === "text") out.content = v;
    if (key === "port") out.port = Number.parseInt(v, 10);
  }
  return out;
}

export function startYeastarReceive(): void {
  if (!env.yeastarReceiveEnabled || !env.yeastarHost) {
    console.log("yeastar receive disabled or YEASTAR_HOST unset");
    return;
  }
  if (client) return;

  client = net.createConnection({ host: env.yeastarHost, port: env.yeastarApiPort }, () => {
    console.log("yeastar tcp connected", env.yeastarHost, env.yeastarApiPort);
    if (env.yeastarUsername) {
      client?.write(`Action: Login\r\nUsername: ${env.yeastarUsername}\r\nSecret: ${env.yeastarPassword}\r\n\r\n`);
    }
  });

  let buf = "";
  client.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    const parts = buf.split(/\r\n\r\n/);
    buf = parts.pop() ?? "";
    for (const block of parts) {
      const lines = block.split(/\r\n/).filter(Boolean);
      const head = lines[0]?.toLowerCase() ?? "";
      if (head.includes("sms") || lines.some((l) => l.toLowerCase().startsWith("event: sms"))) {
        const parsed = parseSmsBlock(lines);
        if (parsed.from && parsed.content) {
          insertInbound(parsed.from, parsed.content, parsed.port);
          console.log("inbound sms", parsed.from);
        }
      }
    }
  });

  client.on("error", (err) => console.error("yeastar tcp error", err.message));
  client.on("close", () => {
    client = undefined;
    setTimeout(startYeastarReceive, 5000);
  });
}
