import type { YeastarSendResult } from "./send.js";

/** Text for outbound log / debugging when Yeastar rejects a send */
export function yeastarResultDetail(result: YeastarSendResult): string | undefined {
  const detail = (result.rawResponse || result.errorCode || "").trim();
  return detail || (result.accepted ? undefined : "rejected");
}
