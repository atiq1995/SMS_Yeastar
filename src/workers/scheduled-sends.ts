import {
  listDueScheduled,
  updateScheduledStatus,
  getRule,
  countRuleSendsToday,
  finalizeScheduledCancel,
} from "../db/repository.js";
import { automationQuietHours } from "../engine/automation-safety.js";
import { melbourneDayStartIso, slidePastQuietHours } from "../engine/badges.js";
import { processScheduledSend } from "./process-event.js";

const CATCHUP_MS = 24 * 3600_000;
const POLL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

export async function tickScheduledSends(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const due = listDueScheduled(now.toISOString(), 50);
    const quiet = automationQuietHours(now);

    for (const row of due) {
      const fireAt = new Date(row.fire_at);
      if (Number.isNaN(fireAt.getTime())) {
        updateScheduledStatus(row.id, "missed");
        continue;
      }
      if (now.getTime() - fireAt.getTime() > CATCHUP_MS) {
        updateScheduledStatus(row.id, "missed");
        console.warn("scheduled missed (stale)", row.id, row.job_uuid, row.rule_id);
        continue;
      }

      if (quiet.blocked) {
        const slid = slidePastQuietHours(now, quiet.start, quiet.end, true);
        updateScheduledStatus(row.id, "pending", slid.toISOString());
        continue;
      }

      const rule = getRule(row.rule_id);
      if (!rule?.enabled) {
        finalizeScheduledCancel(row, "rule_disabled");
        continue;
      }

      if (rule.daily_send_cap && rule.daily_send_cap > 0) {
        const sentToday = countRuleSendsToday(rule.id, melbourneDayStartIso(now));
        if (sentToday >= rule.daily_send_cap) continue;
      }

      try {
        const result = await processScheduledSend(row);
        if (result.ok) {
          updateScheduledStatus(row.id, "sent");
        } else if (result.cancel) {
          finalizeScheduledCancel(row, result.reason ?? "cancelled");
        } else {
          updateScheduledStatus(row.id, "failed");
          console.warn("scheduled send fail", row.id, result.reason);
        }
      } catch (err) {
        console.error("scheduled send error", row.id, err);
        updateScheduledStatus(row.id, "failed");
      }
    }
  } finally {
    running = false;
  }
}

export function startScheduledSendWorker(): void {
  if (timer) return;
  void tickScheduledSends();
  timer = setInterval(() => {
    void tickScheduledSends();
  }, POLL_MS);
  console.log("scheduled send worker started");
}
