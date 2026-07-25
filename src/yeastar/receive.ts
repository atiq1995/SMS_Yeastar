import net from "node:net";
import { env } from "../config/env.js";
import { insertInbound } from "../db/repository.js";
import { decodeYeastarSmsContent } from "./sms-decode.js";

let client: net.Socket | undefined;

type ParsedSms = {
  from?: string;
  content?: string;
  port?: number;
  id?: string;
  index?: number;
  total?: number;
};

type PendingParts = {
  from: string;
  port?: number;
  total: number;
  parts: Map<number, string>;
  timer: ReturnType<typeof setTimeout>;
};

/** ponytail: in-memory only — lost on restart; ceiling = one process, fine for TG400 volume */
const pending = new Map<string, PendingParts>();
const PART_WAIT_MS = 45_000;

function parseSmsBlock(lines: string[]): ParsedSms {
  const out: ParsedSms = {};
  for (const line of lines) {
    const [k, ...rest] = line.split(":");
    if (!k || rest.length === 0) continue;
    const v = rest.join(":").trim();
    const key = k.trim().toLowerCase();
    if (key === "from" || key === "sender") out.from = v;
    if (key === "content" || key === "message" || key === "text") out.content = v;
    if (key === "port" || key === "gsmport" || key === "gsmspan") out.port = Number.parseInt(v, 10);
    if (key === "id") out.id = v;
    if (key === "index") out.index = Number.parseInt(v, 10);
    if (key === "total") out.total = Number.parseInt(v, 10);
  }
  return out;
}

function flushPending(key: string): void {
  const p = pending.get(key);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(key);
  const indexes = [...p.parts.keys()].sort((a, b) => a - b);
  if (!indexes.length) return;
  const body = indexes.map((i) => p.parts.get(i) ?? "").join("");
  if (!body) return;
  insertInbound(p.from, body, p.port);
  console.log("inbound sms", p.from, indexes.length > 1 ? `(${indexes.length} parts)` : "");
}

function storeInbound(parsed: ParsedSms): void {
  if (!parsed.from || parsed.content == null || parsed.content === "") return;

  const text = decodeYeastarSmsContent(parsed.content);
  const total = Number.isFinite(parsed.total) && (parsed.total as number) > 0 ? (parsed.total as number) : 1;
  const index = Number.isFinite(parsed.index) ? (parsed.index as number) : 1;

  if (total <= 1) {
    insertInbound(parsed.from, text, parsed.port);
    console.log("inbound sms", parsed.from);
    return;
  }

  // Yeastar: same ID for all parts of one long SMS
  const key = parsed.id?.trim() || `${parsed.from}:${text.slice(0, 24)}`;
  let slot = pending.get(key);
  if (!slot) {
    slot = {
      from: parsed.from,
      port: parsed.port,
      total,
      parts: new Map(),
      timer: setTimeout(() => flushPending(key), PART_WAIT_MS),
    };
    pending.set(key, slot);
  } else {
    clearTimeout(slot.timer);
    slot.timer = setTimeout(() => flushPending(key), PART_WAIT_MS);
    if (parsed.port != null) slot.port = parsed.port;
    slot.total = Math.max(slot.total, total);
  }
  slot.parts.set(index, text);

  if (slot.parts.size >= slot.total) flushPending(key);
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
      const isSms =
        head.includes("receivedsms") ||
        head.includes("sms") ||
        lines.some((l) => {
          const low = l.toLowerCase();
          return low.startsWith("event: receivedsms") || low.startsWith("event: sms");
        });
      if (!isSms) continue;
      storeInbound(parseSmsBlock(lines));
    }
  });

  client.on("error", (err) => console.error("yeastar tcp error", err.message));
  client.on("close", () => {
    client = undefined;
    setTimeout(startYeastarReceive, 5000);
  });
}
