export type BadgeRef = { uuid: string; name: string };

export function parseBadgeJson(raw: string | null | undefined): BadgeRef[] {
  if (!raw?.trim()) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const uuid = String((row as BadgeRef).uuid ?? "").trim();
        const name = String((row as BadgeRef).name ?? "").trim();
        if (!uuid && !name) return null;
        return { uuid, name };
      })
      .filter((x): x is BadgeRef => !!x);
  } catch {
    return [];
  }
}

export function stringifyBadgeJson(badges: BadgeRef[]): string {
  return JSON.stringify(badges.map((b) => ({ uuid: b.uuid, name: b.name })));
}

export function parseJobBadgesField(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export function badgeMatches(haystack: BadgeRef[], needle: BadgeRef): boolean {
  const nUuid = needle.uuid.toLowerCase();
  const nName = needle.name.toLowerCase();
  return haystack.some((b) => {
    if (nUuid && b.uuid && b.uuid.toLowerCase() === nUuid) return true;
    if (nName && b.name && b.name.toLowerCase() === nName) return true;
    return false;
  });
}

export function anyBadgeMatches(haystack: BadgeRef[], needles: BadgeRef[]): boolean {
  if (!needles.length) return false;
  return needles.some((n) => badgeMatches(haystack, n));
}

export function diffAddedUuids(prev: string[], next: string[]): string[] {
  const before = new Set(prev.map((u) => u.toLowerCase()));
  return next.filter((u) => !before.has(u.toLowerCase()));
}

export function diffRemovedUuids(prev: string[], next: string[]): string[] {
  const after = new Set(next.map((u) => u.toLowerCase()));
  return prev.filter((u) => !after.has(u.toLowerCase()));
}

/** Calendar months in Australia/Melbourne wall time → UTC ISO. */
export function addOffsetMelbourne(from: Date, value: number, unit: "days" | "weeks" | "months"): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(from);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  let y = get("year");
  let m = get("month");
  let d = get("day");
  let h = get("hour");
  let min = get("minute");
  let s = get("second");
  if (unit === "days") d += value;
  else if (unit === "weeks") d += value * 7;
  else {
    m += value;
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > dim) d = dim;
  }
  // ponytail: Melbourne is always AEST/AEDT — use formatToParts offset via Date ctor trick
  const asLocal = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return melbourneWallToUtc(asLocal);
}

function melbourneWallToUtc(wall: string): Date {
  // Binary-search UTC that formats to this Melbourne wall clock (handles DST).
  let lo = Date.parse(wall + "Z") - 14 * 3600_000;
  let hi = Date.parse(wall + "Z") + 14 * 3600_000;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  for (let i = 0; i < 40; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const parts = fmt.formatToParts(new Date(mid));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    const got = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
    if (got === wall) return new Date(mid);
    if (got < wall) lo = mid + 1;
    else hi = mid - 1;
  }
  return new Date(Math.floor((lo + hi) / 2));
}

export function slidePastQuietHours(fireAt: Date, startHour: number, endHour: number, enabled: boolean): Date {
  if (!enabled || startHour === endHour) return fireAt;
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", {
      hour: "numeric",
      hour12: false,
      timeZone: "Australia/Melbourne",
    }).format(fireAt)
  );
  const inQuiet = startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
  if (!inQuiet) return fireAt;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  }).formatToParts(fireAt);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  let y = get("year");
  let m = get("month");
  let d = get("day");
  // Move to quiet-hours end on this Melbourne day (or next if end is "tomorrow" overnight window)
  if (startHour > endHour && hour >= startHour) {
    d += 1;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > dim) {
      d = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  const wall = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(endHour).padStart(2, "0")}:00:00`;
  return melbourneWallToUtc(wall);
}
