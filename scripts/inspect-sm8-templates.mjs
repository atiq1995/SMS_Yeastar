import Database from "better-sqlite3";

const db = new Database("./data/sms.db");
const row = db.prepare("select access_token from oauth_tokens order by updated_at desc limit 1").get();
const r = await fetch("https://api.servicem8.com/api_1.0/smstemplate.json", {
  headers: { Authorization: "Bearer " + row.access_token },
});
const data = await r.json();
if (!Array.isArray(data)) {
  console.log("not array", data);
  process.exit(1);
}

const interesting = [];
for (const t of data) {
  const msg = String(t.message || "");
  const name = String(t.name || "");
  const hasOurPlaceholders = /\{job\.(next_booking|contact_|generated_|total_|status|job_address)/i.test(msg);
  const isBooking = /booking reminder/i.test(name);
  if (hasOurPlaceholders || isBooking) {
    interesting.push({
      name,
      uuid: t.uuid,
      active: t.active,
      edit_date: t.edit_date,
      message: msg,
      hasOurPlaceholders,
    });
  }
}

console.log("total templates:", data.length);
console.log("interesting:", interesting.length);
for (const t of interesting) {
  console.log("---");
  console.log(JSON.stringify(t, null, 2));
}
