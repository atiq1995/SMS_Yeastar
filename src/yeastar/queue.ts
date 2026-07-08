import { sendSms, type YeastarSendResult } from "./send.js";
import { guardOutbound } from "./guard.js";

type Job = {
  destination: string;
  message: string;
  jobUuid?: string;
  resolve: (r: YeastarSendResult) => void;
};

const queue: Job[] = [];
let busy = false;
let lastSentAt = 0;
const MIN_GAP_MS = 10_000;

async function pump(): Promise<void> {
  if (busy || queue.length === 0) return;
  busy = true;
  const job = queue.shift()!;
  const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastSentAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  try {
    const guarded = guardOutbound(job.destination, job.message, job.jobUuid);
    if (!guarded.ok) {
      job.resolve({
        accepted: false,
        dryRun: true,
        rawResponse: guarded.reason,
      });
      return;
    }
    const result = await sendSms(guarded.destination, guarded.message);
    lastSentAt = Date.now();
    job.resolve(result);
  } catch (e) {
    job.resolve({ accepted: false, dryRun: false, errorCode: String(e), rawResponse: undefined });
  } finally {
    busy = false;
    void pump();
  }
}

export function enqueueSend(
  destination: string,
  message: string,
  opts?: { jobUuid?: string }
): Promise<YeastarSendResult> {
  return new Promise((resolve) => {
    queue.push({ destination, message, jobUuid: opts?.jobUuid, resolve });
    void pump();
  });
}
