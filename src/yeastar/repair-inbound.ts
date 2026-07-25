import type Database from "better-sqlite3";
import { normalizeInboundBody } from "./sms-decode.js";

type InboundRow = {
  id: number;
  from_number: string;
  body: string;
  received_at: string;
};

function phoneKey(n: string): string {
  const d = String(n || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : d;
}

function parseAt(at: string): number {
  const s = String(at || "");
  const t = Date.parse(s.includes("T") || s.includes("Z") ? s : s.replace(" ", "T") + "Z");
  return Number.isFinite(t) ? t : 0;
}

/** Segments of one long SMS: same sender, close in time, first looks cut off */
function looksLikeSegmentPair(a: string, b: string): boolean {
  const left = a.trimEnd();
  const right = b.trimStart();
  if (!left || !right) return false;
  if (left.length < 40 && right.length < 40) return false;
  // mid-word split: "...open th" + "e invoice..." or "...th" + "invoice"
  if (/[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9*]/.test(right)) return true;
  // first doesn't end a sentence and second continues (common Yeastar split)
  if (!/[.!?…]$/.test(left) && right.length > 30) return true;
  return false;
}

/**
 * Rewrite stored inbound rows: URL-decode bodies, merge multi-part fragments.
 * Safe to run multiple times.
 */
export function repairInboundMessages(database: Database.Database): { decoded: number; merged: number } {
  const select = database.prepare(
    "SELECT id, from_number, body, received_at FROM inbound_messages ORDER BY id ASC"
  );
  const updateBody = database.prepare("UPDATE inbound_messages SET body = ? WHERE id = ?");
  const remove = database.prepare("DELETE FROM inbound_messages WHERE id = ?");

  let decoded = 0;
  const rows = select.all() as InboundRow[];
  for (const r of rows) {
    const next = normalizeInboundBody(r.body);
    if (next !== r.body) {
      updateBody.run(next, r.id);
      r.body = next;
      decoded++;
    }
  }

  let merged = 0;
  // ponytail: O(n) scan; SMS volume is tiny
  for (let i = 0; i < rows.length - 1; ) {
    const a = rows[i];
    const b = rows[i + 1];
    const dt = Math.abs(parseAt(b.received_at) - parseAt(a.received_at));
    const close = dt === 0 || dt <= 20_000;
    if (phoneKey(a.from_number) === phoneKey(b.from_number) && close && looksLikeSegmentPair(a.body, b.body)) {
      const joined = a.body + b.body;
      updateBody.run(joined, a.id);
      remove.run(b.id);
      a.body = joined;
      rows.splice(i + 1, 1);
      merged++;
      continue;
    }
    i++;
  }

  return { decoded, merged };
}
