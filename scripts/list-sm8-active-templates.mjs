import Database from "better-sqlite3";

const db = new Database("./data/sms.db");
const row = db.prepare("select access_token from oauth_tokens order by updated_at desc limit 1").get();
if (!row) {
  console.log("NO_TOKEN");
  process.exit(1);
}
const r = await fetch("https://api.servicem8.com/api_1.0/smstemplate.json", {
  headers: { Authorization: "Bearer " + row.access_token },
});
const data = await r.json();
if (!Array.isArray(data)) {
  console.log("ERR", data);
  process.exit(1);
}
const active = data
  .filter((t) => t.active == 1 || t.active === "1")
  .map((t) => String(t.name))
  .sort((a, b) => a.localeCompare(b));
console.log("ACTIVE_COUNT", active.length);
for (const n of active) console.log(n);
