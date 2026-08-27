import Database from "better-sqlite3";

const db = new Database("./data/sms.db");
const row = db.prepare("select access_token from oauth_tokens order by updated_at desc limit 1").get();
const r = await fetch("https://api.servicem8.com/api_1.0/smstemplate.json", {
  headers: { Authorization: "Bearer " + row.access_token },
});
const data = await r.json();

// Recently edited (since 2026-01-01) — likely candidates for our writes
const recent = data
  .filter((t) => String(t.edit_date || "") >= "2026-01-01")
  .sort((a, b) => String(b.edit_date).localeCompare(String(a.edit_date)));

console.log("Templates edited in 2026:", recent.length);
for (const t of recent) {
  console.log("---");
  console.log(t.edit_date, "|", t.name, "| active=", t.active);
  console.log(String(t.message || "").slice(0, 200));
}

console.log("\n=== Booking reminder (full) ===");
const booking = data.find((t) => t.name === "Booking reminder");
console.log(JSON.stringify(booking, null, 2));

console.log("\n=== Duplicate names? ===");
const byName = new Map();
for (const t of data) {
  const n = t.name;
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n).push({ uuid: t.uuid, edit_date: t.edit_date, active: t.active });
}
for (const [n, rows] of byName) {
  if (rows.length > 1) console.log(n, rows);
}
