/** Yeastar AMI delivers SMS Content URL-encoded (+ for space, %XX for specials). */

export function decodeYeastarSmsContent(raw: string): string {
  const withSpaces = String(raw ?? "").replace(/\+/g, " ");
  let decoded = withSpaces;
  try {
    decoded = decodeURIComponent(withSpaces);
  } catch {
    // partial/invalid sequences — keep +→space result
  }
  return decoded.replace(/^\uFEFF/, "").trimEnd();
}

/** Fix already-stored garbled rows without double-decoding plain text. */
export function normalizeInboundBody(body: string): string {
  const s = String(body ?? "");
  const looksEncoded = /%[0-9A-Fa-f]{2}/.test(s) || (s.includes("+") && !/\s/.test(s));
  if (!looksEncoded) return s.replace(/^\uFEFF/, "");
  return decodeYeastarSmsContent(s);
}
