# SMS Gateway — PDF testing guide

How each client requirement works and how to test it in ServiceM8 + the SMS Dashboard add-on.

**Version:** 1.2.0  
**Scope:** SMS Gateway only. Client Portal items (photos, documents, job description, upcoming-job dates) are a **separate product** — not this repo.

---

## Before you start

1. Open **ServiceM8 → Add-ons → SMS Dashboard** (hard-refresh if you just deployed).
2. Confirm footer shows **v1.2.0** or newer.
3. **Settings → Test / UAT mode:** ON, redirect number = your mobile.
4. **Settings → Save** (dashboard UAT overrides `.env` after first save).
5. If badge list is empty: **disconnect and reconnect OAuth** (manifest needs `manage_badges` scope).
6. On server after deploy: `npm run db:migrate` (adds `daily_send_cap` column).

---

## §1 Client Portal (not in SMS repo)

| # | Requirement | Status | How to test |
|---|-------------|--------|-------------|
| 1.1 | Manual photo publish only | Not this repo | N/A — Client Portal team |
| 1.2 | Document keyword filter | Not this repo | N/A |
| 1.3 | Job description from services | Not this repo | N/A |
| 1.4 | Upcoming jobs = visit date | Not this repo | N/A |

---

## §2.1 Trigger types

### Badge added

**How it works:** ServiceM8 webhook includes `badges` in `changed_fields` → app fetches full job → compares badge UUIDs to `job_badge_snapshot` → fires rules with trigger **Badge added** whose badge list matches (UUID match).

**First deploy safety:** The **first time** a job is ever seen, badges are stored only — **no SMS**. After that, only **newly added** badges fire.

**Test:**

1. Automation tab → Add automation → **When:** Badge added → pick e.g. **Booking Reminder** badge → template → Save automations.
2. Use a **test job** that has **never** been touched by the gateway (or remove its row from `job_badge_snapshot` on dev only).
3. Add the badge on the job in ServiceM8 → **no SMS** (first sight seed).
4. Remove badge, add again → SMS to UAT number → **Log** shows rule name + badge name.
5. Turn UAT off → repeat on another test job → SMS goes to customer mobile.

### Scheduled send (offset)

**How it works:** When a matching badge is added (or job completed, for “after completed” rules), a row is inserted in `scheduled_sends` with `fire_at` = anchor time + offset (Melbourne calendar for months). A background worker polls every 60s, respects quiet hours (slides to end of quiet window), daily cap, then sends.

**Test:**

1. Add automation → **When:** Scheduled → Start from **Badge added** → badge **Rodent 3 month** → Wait **1 days** (use 1 day for UAT, not 3 months) → optional **Daily send cap** e.g. 5.
2. Save. Add badge on test job (after first-seed step above).
3. **Pending** tab → row appears with future `fire_at`.
4. For fast test on dev: temporarily set `fire_at` in DB to `datetime('now')` or wait until due.
5. When due → SMS sent → Pending row → **sent**; Log shows automation + badge.

**After job completed anchor:**

1. Scheduled → Start from **Job completed** → e.g. 1 week.
2. Complete the job → Pending row created → fires after offset.

---

## §2.1 Safety controls (all triggers)

| Control | Where set | How it works | Test |
|---------|-----------|--------------|------|
| Exclusion keywords | Settings | Blocks send if job/company text matches keyword | Add keyword `TESTBLOCK` → put in job description → trigger automation → Log: **Blocked exclusion** |
| Quiet hours | Settings | Melbourne time window; immediate sends blocked; scheduled sends **slide** to quiet end | Set quiet to include now → trigger → **Blocked quiet hours**; scheduled due in quiet → Pending `fire_at` moves forward |
| Duplicate cooldown | Settings | Same job + same body within N minutes | Trigger twice quickly → second: **Blocked duplicate** |
| UAT redirect | Settings | All SMS to redirect number; body prefixed `[TEST — was …]` | UAT on → any send → your phone, not customer |
| Suppress badge | Per rule | If job has badge (e.g. **Don't Chase**), rule skipped | On chase rule set Suppress = Don't Chase → add Don't Chase to job → add Chase badge → no chase SMS; Log may show **Suppressed badge** |

---

## §2.2 Automations to cover (staff-built — not hardcoded)

Staff create one dashboard rule per row below. Client supplies template wording.

| Automation | Badge(s) | Trigger | Dashboard setup |
|------------|----------|---------|-----------------|
| Booking confirmation | (job event) | Job created | When: Job created |
| Unpaid invoice / payment chases | Chase payment, Debt Collection | Badge added + scheduled escalations | One **Badge added** rule per immediate chase; separate **Scheduled** rules for day 3/7/14 etc. |
| Booking Reminder | Booking Reminder | Badge added | Badge added → pick badge |
| Follow-up visits | 2 Week, 1 Month, 3 Month, 6 Month, 1 Year, Annual followup | Scheduled (badge + offset) | **Separate rule per badge** — do not merge 1 Year vs Annual |
| Review requests | Review National, Adelaide, … | Badge added or scheduled | One rule per review badge or multi-select on one rule |
| Rodent follow ups | Rodent 3 month | Scheduled | Badge added anchor + 3 months |
| Trelona reminders | Trelona 3 month, Trelona 6 month | Scheduled | Two rules, different offsets |

**Don't Chase:** On every payment-chase rule → **Suppress if job has badge** → tick **Don't Chase**.

**Test cutover (§2.4):**

1. UAT on → enable **one** gateway rule → add badge on test job → confirm Log.
2. Disable matching ServiceM8 automation.
3. UAT off → live test on internal job.
4. Repeat one automation at a time.

---

## §2.3 Dashboard configurability

| Setting | Tab | Test |
|---------|-----|------|
| UAT on/off + number | Settings | Toggle, Save, send test SMS |
| Automations CRUD | Automation | Add/edit/disable without deploy |
| Templates | Templates | Edit body, use in rule |
| Exclusion / quiet / cooldown | Settings | Change → immediate effect on next send |
| En-route status labels | Settings | Change labels → en-route trigger uses new list |
| Daily send cap | Automation modal (scheduled rules) | Set cap 1 → queue 2 due sends same day → only 1 sends; other stays Pending until next Melbourne day |

---

## §2.4 Rollout & audit

| Requirement | How it works | Test |
|-------------|--------------|------|
| UAT first | `guardOutbound()` reads dashboard UAT | All testing with UAT on |
| One-at-a-time cutover | Process | Enable gateway rule → disable SM8 automation |
| Outbound log audit | Every attempt logged with `rule_name`, `badge_name`, status | Log tab after each test |
| Scheduled cancel audit | Cancelled scheduled sends → Log **Scheduled cancelled** + reason in detail | Remove badge before fire → cancel; deactivate job → `job_inactive`; manual cancel on Pending tab |

---

## Radinal technical guideline (extra behaviours)

| Item | Behaviour | Test |
|------|-----------|------|
| First-seen seeding | Zero SMS on first job sight | Add badge on brand-new job → no send; remove/re-add → send |
| Send-time re-validation | Before scheduled send: job active, badge still on job | Remove badge before `fire_at` → Log: cancelled `badge_removed`; mark job inactive → `job_inactive` |
| Daily cap | Per scheduled rule, Melbourne day, oldest due first | Cap=1, two pending same rule same day → one sends |
| UUID badge match | Rules match ServiceM8 badge UUID from checkbox list | Rename badge in SM8 (UUID unchanged) → rule still matches |
| 24h stale catch-up | Due >24h ago → status **missed** | Dev: set old `fire_at`, wait for worker |

---

## Inbox reply (bonus, not in PDF)

**How:** Inbox tab → select conversation → type reply → Send. Goes via Yeastar queue; optional job note if prior outbound had `job_uuid`.

**Test:** Reply to inbound SMS from UAT phone → appears in thread; check Yeastar / recipient phone.

**Note:** Customer replies appear in **Dashboard Inbox only**, not on the ServiceM8 job card SMS thread.

---

## Job lifecycle triggers (already live)

| Trigger | Test |
|---------|------|
| Job created | Create job with mobile → SMS |
| Status changed | Rule with exact status label → change status |
| En route | Set status to configured en-route label |
| Completed | Complete job → completed template |

---

## Quick smoke checklist

- [ ] UAT on → badge add → Log entry with rule + badge
- [ ] UAT off → live number (one test only)
- [ ] Scheduled → Pending → fires at due time
- [ ] Don't Chase suppresses chase rules
- [ ] Quiet hours block / slide
- [ ] First-seen job does not blast historical badges
- [ ] Log shows cancelled scheduled with reason
- [ ] Inbox reply sends

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Badges list empty | Reconnect OAuth; confirm `manage_badges` in manifest |
| No webhook | Check ServiceM8 add-on subscribed; `badges` in changed fields |
| `scheduled_sends` error | Run `npm run db:migrate` on server |
| UI unchanged after push | Server `git pull` + `npm run build` + `sudo systemctl restart toms-sms`; hard-refresh iframe |
| First add on old job no SMS | Expected if job was already seeded — remove and re-add badge |
