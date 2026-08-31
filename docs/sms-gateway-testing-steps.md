# SMS Gateway — complete testing steps

Step-by-step manual for UAT of the SMS Gateway against:

1. **TPC-Portal-SMS-Testing-Feedback.pdf** (24 Aug 2026) — section **2 only** (SMS Gateway)
2. **SMS-Gateway-Badge-Automations-Technical-Guideline.pdf** (31 Aug 2026, Radinal)

**Not covered here:** Client Portal (PDF §1 — photos, documents, job description, upcoming jobs). That is a different product.

**App version:** 1.2.0+

---

## Table of contents

1. [One-time setup](#1-one-time-setup)
2. [Test data — jobs and badges](#2-test-data--jobs-and-badges)
3. [PDF §2.3 — Dashboard settings (configurable without deploy)](#3-pdf-23--dashboard-settings)
4. [PDF §2.1 — Trigger: Badge added](#4-pdf-21--trigger-badge-added)
5. [PDF §2.1 — Trigger: Scheduled send](#5-pdf-21--trigger-scheduled-send)
6. [PDF §2.1 — Safety controls (all triggers)](#6-pdf-21--safety-controls)
7. [PDF §2.2 / Radinal §5 — Each automation type](#7-pdf-22--each-automation-type)
8. [Radinal §1 — Badge data / webhooks](#8-radinal-1--badge-data--webhooks)
9. [Radinal §2 — Badge diff & first-seen seeding](#9-radinal-2--badge-diff--first-seen-seeding)
10. [Radinal §3 — Rule engine & UI](#10-radinal-3--rule-engine--ui)
11. [Radinal §4 — Scheduled queue behaviour](#11-radinal-4--scheduled-queue-behaviour)
12. [Radinal §5 — Don't Chase suppression](#12-radinal-5--dont-chase-suppression)
13. [Radinal §6 — Safety & audit log](#13-radinal-6--safety--audit-log)
14. [Radinal §7 — Daily send cap & volume](#14-radinal-7--daily-send-cap)
15. [PDF §2.4 / Radinal §8 — Rollout & acceptance](#15-pdf-24--rollout--acceptance)
16. [Job lifecycle triggers (existing)](#16-job-lifecycle-triggers)
17. [Inbox reply](#17-inbox-reply)
18. [Master sign-off checklist](#18-master-sign-off-checklist)
19. [Troubleshooting](#19-troubleshooting)

---

## 1. One-time setup

Do this once before any test case.

### 1.1 Server deploy (if you just pushed code)

On EC2 (`ubuntu@15.135.181.227`, path `/opt/toms-sms`):

```bash
cd /opt/toms-sms
git pull
npm run db:migrate
npm run build
sudo systemctl restart toms-sms
```

**Pass:** `systemctl status toms-sms` shows `active (running)`.

### 1.2 Open the dashboard

| Step | Action | Expected |
|------|--------|----------|
| 1 | Log into ServiceM8 | — |
| 2 | Open **Add-ons** → **SMS Dashboard** | Dashboard loads |
| 3 | Hard-refresh the iframe (Ctrl+Shift+R) | Latest UI |
| 4 | Check footer / version line | Shows **v1.2.0** or newer |

### 1.3 OAuth & badges

| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to **Automation** tab → click **Add automation** | Rule modal opens |
| 2 | Set **When** = **Badge added** | Badge checkbox list appears |
| 3 | If list says *"No badges loaded"* | Reconnect OAuth (step 4–6) |
| 4 | Go to **Settings** (or add-on auth flow) | Disconnect / reconnect ServiceM8 |
| 5 | Approve OAuth including badge permissions | Connection succeeds |
| 6 | Open **Add automation** again | Active ServiceM8 badges listed by name |

### 1.4 Turn on UAT (required for all testing)

| Step | Action | Expected |
|------|--------|----------|
| 1 | **Settings** tab | Settings panel visible |
| 2 | Enable **Test / UAT mode** | Checkbox on |
| 3 | Enter **redirect mobile** (your phone, e.g. `04xx xxx xxx`) | Number saved in field |
| 4 | Click **Save settings** | Toast / success |
| 5 | **Settings** → **Send test SMS** (if available) | SMS arrives on redirect number |

**Important:** After the first **Save settings**, dashboard UAT overrides `.env`. Turning UAT **off** in Settings really turns it off.

### 1.5 Confirm Yeastar path (optional smoke)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Settings → test Yeastar / connection test | `ok` or accepted |
| 2 | Check `YEASTAR_SEND_ENABLED` on server | `true` for real sends; `false` = dry-run only |

---

## 2. Test data — jobs and badges

Use dedicated test jobs — never live customer jobs until final sign-off.

### 2.1 Create test jobs

Create **three** jobs in ServiceM8:

| Job label | Purpose | Requirements |
|-----------|---------|--------------|
| **JOB-A** | First-seen / seeding tests | New job, mobile = your UAT phone or a test contact |
| **JOB-B** | Badge + scheduled tests | Different job number, valid mobile |
| **JOB-C** | Don't Chase / suppress tests | Valid mobile |

Each job needs:

- A **job contact mobile** (or company primary if rules use that recipient)
- Permission to add/remove badges freely

### 2.2 Note badge names in your account

These are the badges from the PDF (names must match ServiceM8 exactly):

**Immediate (Badge added):**

- Booking Reminder
- Chase payment
- Debt Collection
- Review National, Review Adelaide, Review Brisbane, Review Canberra, Review GC, Review Melb, Review Perth, Review Sydney, Product Review

**Scheduled (badge + offset):**

- 2 Week Follow-up, 1 Month Follow-up, 3 Month Follow-up, 6 Month Follow-up, **1 Year Follow-up**, **Annual followup** (separate rules — do not merge)
- Rodent 3 month
- Trelona 3 month, Trelona 6 month

**Suppress:**

- Don't Chase

---

## 3. PDF §2.3 — Dashboard settings

**Requirement:** All behaviour configurable from dashboard without code deploy or vendor reconnect.

### Test 3.1 — UAT on/off and redirect number

| Step | Action | Expected |
|------|--------|----------|
| 1 | Settings → UAT **ON**, redirect = your mobile → **Save** | Saved |
| 2 | Trigger any automation (e.g. add badge on JOB-B after seeding — see §4) | SMS to **redirect** number, body contains `[TEST — was …]` |
| 3 | Settings → UAT **OFF** → **Save** | Saved |
| 4 | Trigger again on a **different** test job | SMS to **customer** mobile on job |
| 5 | Settings → UAT **ON** again for remaining tests | — |

**Pass:** Redirect toggles without server restart.

### Test 3.2 — Create / edit / disable automation

| Step | Action | Expected |
|------|--------|----------|
| 1 | **Automation** → **Add automation** | Modal opens |
| 2 | Name: `UAT Test Badge Rule` | — |
| 3 | **When:** Badge added → tick **Booking Reminder** | — |
| 4 | Pick a template → **Done** | Rule in list |
| 5 | Click **Save automations** | Success toast |
| 6 | Toggle rule **off** (disable) → Save | Rule disabled |
| 7 | Add Booking Reminder badge on JOB-B | **No SMS** (rule disabled) |
| 8 | Enable rule → Save → remove/re-add badge | SMS fires |

**Pass:** CRUD works from UI only.

### Test 3.3 — Templates

| Step | Action | Expected |
|------|--------|----------|
| 1 | **Templates** tab → edit a template body | Editor works |
| 2 | Save templates | Saved |
| 3 | Use that template in an automation | SMS body matches template |

### Test 3.4 — Exclusion keywords

| Step | Action | Expected |
|------|--------|----------|
| 1 | **Settings** → Exclusion keywords | Field visible |
| 2 | Add keyword: `UATEXCLUDE` → **Save** | Saved |
| 3 | On JOB-B, put `UATEXCLUDE` in job **description** | — |
| 4 | Trigger an automation on JOB-B | **Log:** status **Blocked exclusion** |
| 5 | Remove keyword from job description | — |
| 6 | Remove `UATEXCLUDE` from settings (or leave for next test) | — |

### Test 3.5 — Quiet hours

| Step | Action | Expected |
|------|--------|----------|
| 1 | Note current Melbourne time | — |
| 2 | **Settings** → Quiet hours **ON** → set window to **include now** (e.g. start 0, end 23) → **Save** | Saved |
| 3 | Trigger **immediate** automation (badge add) | **Log:** **Blocked quiet hours** |
| 4 | Set quiet hours to **exclude** now (e.g. 20:00–07:00 if testing midday) → **Save** | — |
| 5 | Trigger again | SMS sends (or other block reason, not quiet hours) |

### Test 3.6 — Duplicate cooldown

| Step | Action | Expected |
|------|--------|----------|
| 1 | **Settings** → Cooldown = **15** minutes (default) → **Save** | — |
| 2 | On JOB-B, remove then re-add same badge **twice within 1 minute** | — |
| 3 | Check **Log** | First: sent (or UAT redirect); second: **Blocked duplicate** |

### Test 3.7 — En-route status labels

| Step | Action | Expected |
|------|--------|----------|
| 1 | **Settings** → En-route statuses (e.g. `En Route,Dispatched`) → **Save** | Saved |
| 2 | Ensure automation exists: **When** = Technician en route | — |
| 3 | Change JOB-B status to **En Route** (exact label) | SMS fires per en-route rule |
| 4 | Change setting to a different label → Save → use that status | Rule matches new label |

**Pass §2.3:** Every row above works without SSH, git pull, or manifest update.

---

## 4. PDF §2.1 — Trigger: Badge added

**Requirement:** Fire when a selected badge is added to a job.

### Test 4.1 — Basic badge added

| Step | Action | Expected |
|------|--------|----------|
| 1 | **Templates** → create template `T-Booking Reminder` with test body → Save | — |
| 2 | **Automation** → Add → Name: `Booking Reminder` | — |
| 3 | **When:** Badge added → tick **Booking Reminder** badge | — |
| 4 | Message = `T-Booking Reminder` → Send to **Customer** → **Done** | — |
| 5 | **Save automations** | Saved |
| 6 | On **JOB-B**: ensure gateway has **seeded** this job (see §9.1 first) | — |
| 7 | In ServiceM8 job card → **add** badge **Booking Reminder** | — |
| 8 | Wait ~30 seconds | — |
| 9 | Dashboard → **Log** tab | Row: rule **Booking Reminder**, badge **Booking Reminder**, status **sent** or **test_redirected** |
| 10 | Your UAT phone | SMS received |

**Pass:** Exactly one SMS per badge add.

### Test 4.2 — Re-save job without badge change

| Step | Action | Expected |
|------|--------|----------|
| 1 | On JOB-B (badge still on), edit job description only → Save | — |
| 2 | Check **Log** | **No new** badge automation entry |

**Pass:** No false triggers on non-badge edits.

### Test 4.3 — Multiple badges on one rule

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create rule: Badge added → tick **Chase payment** AND **Debt Collection** | — |
| 2 | Save → on JOB-C add **Chase payment** only | One SMS |
| 3 | Remove Chase → add **Debt Collection** | One SMS |

**Pass:** Multi-select badges work.

---

## 5. PDF §2.1 — Trigger: Scheduled send

**Requirement:** Fire X days/weeks/months after badge added or after job completion.

### Test 5.1 — Scheduled after badge added (short offset for UAT)

| Step | Action | Expected |
|------|--------|----------|
| 1 | **Automation** → Add → Name: `UAT Rodent 3 month` | — |
| 2 | **When:** Scheduled send | — |
| 3 | **Start from:** Badge added | — |
| 4 | Tick badge **Rodent 3 month** (or any test badge) | — |
| 5 | **Wait:** `1` **Days** (use 1 day for UAT, not 3 months) | — |
| 6 | Pick template → **Done** → **Save automations** | — |
| 7 | On JOB-B (seeded): add **Rodent 3 month** badge | — |
| 8 | **Pending** tab | New row: job, rule name, `fire_at` ≈ tomorrow |
| 9 | Either wait until due OR on server set `fire_at` to now (dev only) | — |
| 10 | After worker runs (~60s) | **Pending** → status **sent**; **Log** has entry |
| 11 | UAT phone | One SMS |

### Test 5.2 — Scheduled after job completed

| Step | Action | Expected |
|------|--------|----------|
| 1 | Add rule: Scheduled → **Start from:** Job completed → Wait **1** Days | — |
| 2 | Save → set JOB-B to **Completed** | — |
| 3 | **Pending** tab | Row created |
| 4 | When due | SMS + log entry |

### Test 5.3 — Calendar months (Melbourne)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create scheduled rule: **3** **Months** after badge added | — |
| 2 | Add badge on test job | Pending `fire_at` = same calendar day 3 months ahead (Melbourne) |

**Pass:** Month math uses Melbourne calendar (Radinal §4).

### Test 5.4 — Quiet hours defer (scheduled)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Set quiet hours so **due time** falls inside window | — |
| 2 | When row becomes due | SMS **not** sent immediately |
| 3 | **Pending** tab | `fire_at` **moved** to end of quiet window |
| 4 | After new `fire_at` | SMS sends |

**Pass:** Scheduled sends slide, not drop (Radinal §4).

---

## 6. PDF §2.1 — Safety controls

Confirm each control applies to **badge_added** and **scheduled** triggers.

| # | Control | Steps | Pass criteria |
|---|---------|-------|---------------|
| 6.1 | Exclusion keywords | §3.4 on badge-triggered job | Log: Blocked exclusion |
| 6.2 | Quiet hours | §3.5 on immediate badge trigger | Log: Blocked quiet hours |
| 6.3 | Duplicate cooldown | §3.6 on double badge add | Log: Blocked duplicate |
| 6.4 | UAT redirect | §3.1 with badge trigger | SMS to redirect only |
| 6.5 | Suppress badge | §12 Don't Chase | Chase rules blocked |

---

## 7. PDF §2.2 — Each automation type

Staff must **create** each rule in the dashboard (not hardcoded). Use client-supplied template wording for production; use test templates for UAT.

For each automation below:

1. Create template (or pick existing)
2. Create automation with trigger shown
3. Set **Suppress** = **Don't Chase** on all **payment chase** rules
4. **Save automations**
5. Test on JOB-B or JOB-C with UAT **ON**
6. Verify **Log** (rule name + badge name)
7. Before go-live: disable matching ServiceM8 automation (§15)

### 7.1 Booking confirmation

| Field | Value |
|-------|-------|
| PDF automation | Booking confirmation |
| ServiceM8 badge | Booking Reminder |
| Trigger | **Badge added** → tick Booking Reminder |

**Test steps:** §4.1 (same flow).

---

### 7.2 Unpaid invoice / payment chases

| Field | Value |
|-------|-------|
| Badges | Chase payment, Debt Collection |
| Trigger | **Badge added** (immediate) + **Scheduled** rows for escalations (e.g. 3 days, 7 days, 14 days) |

| Step | Action |
|------|--------|
| 1 | Rule `Chase payment immediate`: Badge added → Chase payment → Suppress **Don't Chase** |
| 2 | Rule `Debt Collection immediate`: Badge added → Debt Collection → Suppress **Don't Chase** |
| 3 | Rule `Chase day 3`: Scheduled → Badge added → Chase payment → 3 days → Suppress **Don't Chase** |
| 4 | Add more scheduled rules for day 7, 14 as per client process |
| 5 | Save → add **Chase payment** on JOB-C | Immediate SMS |
| 6 | **Pending** | Escalation rows appear |
| 7 | Add **Don't Chase** to JOB-C → add Chase payment again | **No** chase SMS (§12) |

---

### 7.3 Booking Reminder

| Trigger | Badge added → **Booking Reminder** |

**Test:** §4.1

---

### 7.4 Follow-up visits (scheduled)

Create **one separate rule per badge** — never merge **1 Year Follow-up** and **Annual followup**.

| Badge | Suggested offset (production) | UAT offset |
|-------|--------------------------------|------------|
| 2 Week Follow-up | 2 weeks | 1 day |
| 1 Month Follow-up | 1 month | 1 day |
| 3 Month Follow-up | 3 months | 1 day |
| 6 Month Follow-up | 6 months | 1 day |
| 1 Year Follow-up | 1 year | 1 day |
| Annual followup | per client (separate template) | 1 day |

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create 6 rules (example: 3 Month Follow-up, 1 Year, Annual as three separate rules) | 6 rows in Automation list |
| 2 | Each: Scheduled → Badge added → correct badge → offset | — |
| 3 | Add **3 Month Follow-up** badge on JOB-B | Pending row for that rule only |
| 4 | Add **Annual followup** on another job | Pending row for Annual rule only — **not** 1 Year rule |

---

### 7.5 Review requests

| Badges | Review National, Review Adelaide, Review Brisbane, Review Canberra, Review GC, Review Melb, Review Perth, Review Sydney, Product Review |
| Trigger | Badge added (one rule with multi-select, or one rule per region) |

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create rule(s) with review badge(s) | Saved |
| 2 | Add **Review Melbourne** (or Melb) on test job | SMS + log with badge name |

---

### 7.6 Rodent follow ups

| Badge | Rodent 3 month |
| Trigger | Scheduled → Badge added → **3 months** (UAT: 1 day) |

**Test:** §5.1

---

### 7.7 Trelona termite reminders

| Badge | Rule |
|-------|------|
| Trelona 3 month | Scheduled → 3 months after badge added |
| Trelona 6 month | Scheduled → 6 months after badge added |

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create both rules (separate templates if client requires) | 2 rules |
| 2 | Add **Trelona 3 month** on JOB-B | Pending for 3-month rule only |
| 3 | Add **Trelona 6 month** on JOB-C | Pending for 6-month rule only |

---

## 8. Radinal §1 — Badge data & webhooks

| Step | Action | Expected |
|------|--------|----------|
| 1 | Add or remove any badge on a job | Webhook received by gateway |
| 2 | Server logs / event log (if exposed) | `changed_fields` includes `badges` |
| 3 | **Automation** → Add automation → badge list | Names from `badge.json` (active badges) |
| 4 | `manifest.json` on server includes `badges` in webhook fields | Explicit subscription |

**Pass:** Badge events arrive; picker populated.

---

## 9. Radinal §2 — Badge diff & first-seen seeding

**Critical:** First time a job is seen → store badges, **send nothing**.

### Test 9.1 — First-seen seed (no blast)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Use **JOB-A** — brand-new, never opened by gateway OR never had badge webhook | — |
| 2 | In ServiceM8, add **Booking Reminder** badge (first interaction) | — |
| 3 | Check **Log** | **No** sent SMS for badge automation |
| 4 | Remove badge → wait → add **Booking Reminder** again | **Now** SMS fires |

**Pass:** Deploy does not message historical badges.

### Test 9.2 — Diff detects only new UUIDs

| Step | Action | Expected |
|------|--------|----------|
| 1 | JOB-B has badges A + B already seeded | — |
| 2 | Add badge C only | One event for C |
| 3 | Save job without badge change | No new log entries |

### Test 9.3 — Badge removal updates state (no SMS)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Remove a badge from JOB-B | No outbound SMS for removal |
| 2 | Scheduled rows for that badge | Cancelled (§11) |

---

## 10. Radinal §3 — Rule engine & UI

| Step | Action | Expected |
|------|--------|----------|
| 1 | **When** dropdown includes **Badge added** and **Scheduled send** | Present |
| 2 | Badge picker shows **names**, stores **UUIDs** internally | Match by UUID |
| 3 | Scheduled fields: Start from, Wait, Unit (days/weeks/months) | Present |
| 4 | Create rule → Save → **disable** → **delete** (remove from list) → Save | All work without deploy |
| 5 | Rename badge in ServiceM8 (UUID unchanged) | Rule still matches |

**Pass:** Full rule lifecycle from dashboard.

---

## 11. Radinal §4 — Scheduled queue behaviour

### Test 11.1 — Queue survives restart

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create pending scheduled row (§5.1) | Row in **Pending** |
| 2 | `sudo systemctl restart toms-sms` on server | — |
| 3 | After due time | SMS still fires **once** |

### Test 11.2 — Send-time re-validation (job inactive)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Pending row exists for JOB-B | — |
| 2 | **Deactivate** job in ServiceM8 (or set inactive) before `fire_at` | — |
| 3 | When due | No SMS |
| 4 | **Log** | **Scheduled cancelled**, reason `job_inactive` |
| 5 | **Pending** | Row not pending (cancelled) |

### Test 11.3 — Send-time re-validation (badge removed)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Pending row for badge **Rodent 3 month** | — |
| 2 | Remove **Rodent 3 month** badge before due | — |
| 3 | When due | No SMS |
| 4 | **Log** | **Scheduled cancelled**, reason `badge_removed` |

### Test 11.4 — Manual cancel from Pending tab

| Step | Action | Expected |
|------|--------|----------|
| 1 | **Pending** → click **Cancel** on a row | Row removed / cancelled |
| 2 | **Log** | **Scheduled cancelled**, reason `cancelled_manual` |

### Test 11.5 — Stale catch-up (>24h overdue)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Dev only: set `fire_at` more than 24 hours in the past | — |
| 2 | Wait for worker | Status **missed**, no SMS |

### Test 11.6 — Outbound log for cancelled scheduled

| Step | Action | Expected |
|------|--------|----------|
| 1 | Complete any cancel scenario above | — |
| 2 | **Log** tab | Entry with status **Scheduled cancelled**, detail shows reason |

---

## 12. Radinal §5 — Don't Chase suppression

**Requirement:** Don't Chase suppresses **all payment-chase** messages at **send time**.

| Step | Action | Expected |
|------|--------|----------|
| 1 | On chase rule(s): **Suppress if job has badge** → tick **Don't Chase** → Save | — |
| 2 | JOB-C: add **Don't Chase** badge | — |
| 3 | Add **Chase payment** badge | No chase SMS |
| 4 | **Log** | **Suppressed badge** and/or **Scheduled cancelled** |
| 5 | Remove **Don't Chase** → add Chase payment again | Chase SMS fires |
| 6 | For **scheduled** chase: Don't Chase on job when due | Cancelled at send time, not sent |

**Pass:** Suppress checked on every payment-chase rule.

---

## 13. Radinal §6 — Safety & audit log

| Step | Action | Expected |
|------|--------|----------|
| 1 | Run any successful badge send | **Log** columns: time, number, status, **rule name**, **badge name**, body |
| 2 | Run blocked send (exclusion) | Log row still created with blocked status |
| 3 | Open job in ServiceM8 | Diary note added for successful sends (existing behaviour) |
| 4 | Filter mentally by job UUID in log | Can audit per-job history |

---

## 14. Radinal §7 — Daily send cap

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create scheduled rule with **Daily send cap** = `1` | — |
| 2 | Queue **two** pending rows for same rule due **today** (two jobs, same rule) | 2 rows in Pending |
| 3 | Let worker run | Only **1** SMS today |
| 4 | Second row | Stays **pending** until next Melbourne day |
| 5 | Next day | Second SMS sends |

**Pass:** Cap configurable in automation modal; oldest due first.

---

## 15. PDF §2.4 — Rollout & acceptance

Per automation, repeat:

| Step | Action |
|------|--------|
| 1 | UAT **ON** → test automation end-to-end |
| 2 | Confirm **Log**: correct rule, badge, template, one message per event |
| 3 | In ServiceM8 **Automations**, **disable** the old matching automation |
| 4 | Enable gateway rule (if not already) |
| 5 | UAT **OFF** → one live test on internal/staff job |
| 6 | Sign off this automation → move to next |

**Never** enable gateway + ServiceM8 automation for the same message at the same time.

### Acceptance criteria (Radinal §8)

For **each** automation in §7:

- [ ] Correct trigger timing (immediate or scheduled offset)
- [ ] Correct template rendering (placeholders filled)
- [ ] Exactly **one** message per event
- [ ] Full log entry with badge and rule name
- [ ] ServiceM8 counterpart disabled
- [ ] No messages for pre-existing badges on first deploy (§9.1)

---

## 16. Job lifecycle triggers

These were live before badge work; re-verify quickly.

### 16.1 Job created

| Step | Action | Expected |
|------|--------|----------|
| 1 | Rule exists: **When** = Job created | Enabled |
| 2 | Create new job with mobile | SMS + log |

### 16.2 Status changed

| Step | Action | Expected |
|------|--------|----------|
| 1 | Rule: Status changed → status match e.g. `Quote` | — |
| 2 | Change job to **Quote** | SMS |

### 16.3 Technician en route

| Step | Action | Expected |
|------|--------|----------|
| 1 | Rule: Technician en route | — |
| 2 | Set status to **En Route** (or label from Settings) | SMS |

### 16.4 Job completed

| Step | Action | Expected |
|------|--------|----------|
| 1 | Rule: Job completed | — |
| 2 | Complete job | SMS |

---

## 17. Inbox reply

Not in PDF; useful for office workflow.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Send SMS to a number that can reply (your UAT phone) | Inbound appears in **Inbox** |
| 2 | Select conversation → type reply → **Send** | Outbound in thread |
| 3 | Recipient phone | SMS received |
| 4 | ServiceM8 job card | Replies **not** shown on job SMS thread (dashboard only) |

---

## 18. Master sign-off checklist

Copy and tick when done.

### Setup
- [ ] Server on v1.2.0+, migrated, running
- [ ] OAuth connected, badges visible
- [ ] UAT on, redirect number verified

### PDF §2.1 Triggers
- [ ] Badge added — fires once
- [ ] Scheduled — Pending queue + fires at due time
- [ ] Scheduled after job completed
- [ ] All safety controls on badge triggers

### PDF §2.2 Automations (each tested under UAT)
- [ ] Booking confirmation (Booking Reminder)
- [ ] Payment chases + escalations + Don't Chase
- [ ] Booking Reminder
- [ ] Follow-ups (6 badges, 1 Year ≠ Annual)
- [ ] Review badges
- [ ] Rodent 3 month
- [ ] Trelona 3 month & 6 month

### PDF §2.3 Dashboard
- [ ] UAT, automations, templates, safety, en-route labels — all editable live

### PDF §2.4 Rollout
- [ ] One-at-a-time cutover plan agreed
- [ ] Audit log verified per job

### Radinal technical
- [ ] First-seen seeding (no blast)
- [ ] UUID badge match
- [ ] Send-time re-validation (inactive job, badge removed)
- [ ] Quiet hours slide for scheduled
- [ ] Cancelled rows in outbound log
- [ ] Daily send cap
- [ ] Restart does not lose pending sends

### Job lifecycle (regression)
- [ ] Created, status, en route, completed

---

## 19. Troubleshooting

| Problem | What to do |
|---------|------------|
| Badge list empty | Reconnect OAuth; confirm manifest has `manage_badges` scope |
| No SMS at all | Check UAT redirect phone; Yeastar connection; `YEASTAR_SEND_ENABLED` |
| First badge add does nothing | **Expected** first-seen seed — remove badge, add again |
| Old job never fires | Job already seeded — remove and re-add badge |
| Pending never sends | Check quiet hours; daily cap; job still active; badge still on job |
| `scheduled_sends` SQL error | Run `npm run db:migrate` on server |
| UI old after deploy | Server pull + build + restart; hard-refresh iframe |
| 403 on badges | OAuth reconnect after manifest scope fix |

---

## Document map

| PDF section | Tests in this doc |
|-------------|-------------------|
| Testing Feedback §2.1 | §4, §5, §6 |
| Testing Feedback §2.2 | §7 |
| Testing Feedback §2.3 | §3 |
| Testing Feedback §2.4 | §15 |
| Radinal §1 | §8 |
| Radinal §2 | §9 |
| Radinal §3 | §10 |
| Radinal §4 | §5, §11 |
| Radinal §5 | §7.2, §12 |
| Radinal §6 | §6, §13 |
| Radinal §7 | §14 |
| Radinal §8 | §15, §18 |

---

*Last updated for SMS Dashboard v1.2.0*
