import { env } from "../config/env.js";

export type ServiceM8Job = Record<string, unknown>;
export type ServiceM8Company = Record<string, unknown>;
export type ServiceM8Staff = Record<string, unknown>;

async function sm8Fetch(path: string, accessToken: string): Promise<Response> {
  const base = env.servicem8ApiBaseUrl.replace(/\/$/, "");
  return fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
}

export async function getJob(accessToken: string, jobUuid: string): Promise<ServiceM8Job> {
  const res = await sm8Fetch(`/api_1.0/job/${encodeURIComponent(jobUuid)}.json`, accessToken);
  if (!res.ok) throw new Error(`getJob ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<ServiceM8Job>;
}

export async function getCompany(accessToken: string, companyUuid: string): Promise<ServiceM8Company> {
  const res = await sm8Fetch(`/api_1.0/company/${encodeURIComponent(companyUuid)}.json`, accessToken);
  if (!res.ok) throw new Error(`getCompany ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<ServiceM8Company>;
}

export async function getLocation(accessToken: string, locationUuid: string): Promise<Record<string, unknown>> {
  const res = await sm8Fetch(`/api_1.0/locations/${encodeURIComponent(locationUuid)}.json`, accessToken);
  if (!res.ok) throw new Error(`getLocation ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<Record<string, unknown>>;
}

export async function getStaff(accessToken: string, staffUuid: string): Promise<ServiceM8Staff> {
  const res = await sm8Fetch(`/api_1.0/staff/${encodeURIComponent(staffUuid)}.json`, accessToken);
  if (!res.ok) throw new Error(`getStaff ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<ServiceM8Staff>;
}

export async function getVendorUuid(accessToken: string): Promise<string | undefined> {
  const res = await sm8Fetch("/api_1.0/vendor.json", accessToken);
  if (!res.ok) {
    console.error("getVendorUuid failed", res.status);
    return undefined;
  }
  const data = (await res.json()) as unknown;
  if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
    const uuid = (data[0] as Record<string, unknown>).uuid;
    if (typeof uuid === "string" && uuid) return uuid;
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const uuid = (data as Record<string, unknown>).uuid;
    if (typeof uuid === "string" && uuid) return uuid;
  }
  return undefined;
}

export function jobCompanyUuid(job: ServiceM8Job): string | undefined {
  for (const k of ["company_uuid", "companyUUID", "company_uuid_business", "company_uuid_contact"]) {
    const v = job[k];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

export function resolveMobile(company: ServiceM8Company): string | undefined {
  return pickPhone(company);
}

function pickPhone(record: Record<string, unknown>): string | undefined {
  for (const k of ["mobile", "phone", "mobile_phone", "primary_phone", "Phone", "contact_phone"]) {
    const v = record[k];
    if (typeof v === "string" && v.trim()) return v.trim().replace(/\s+/g, "");
  }
  return undefined;
}

function pickName(record: Record<string, unknown>): string | undefined {
  const first = typeof record.first === "string" ? record.first.trim() : "";
  const last = typeof record.last === "string" ? record.last.trim() : "";
  if (first || last) return `${first} ${last}`.trim();
  for (const k of ["name", "contact_name", "full_name"]) {
    const v = record[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export type SmsRecipient = { mobile: string; label: string; name: string };
export type ResolvedSmsRecipient = { mobile: string; name: string };

/** Job + company contacts with mobiles for the SMS composer */
export async function listJobRecipients(
  accessToken: string,
  job: ServiceM8Job,
  company: ServiceM8Company
): Promise<SmsRecipient[]> {
  const seen = new Set<string>();
  const out: SmsRecipient[] = [];
  const add = (mobile: string | undefined, name: string, label: string) => {
    if (!mobile) return;
    if (seen.has(mobile)) return;
    seen.add(mobile);
    out.push({ mobile, name, label });
  };

  const jobUuid = typeof job.uuid === "string" ? job.uuid : undefined;
  if (jobUuid) {
    for (const c of await listJobContacts(accessToken, jobUuid)) {
      const name = pickName(c) || "Contact";
      add(pickPhone(c), name, `${name} — job contact`);
    }
  }

  const companyName =
    (typeof company.name === "string" && company.name) ||
    (typeof company.company_name === "string" && company.company_name) ||
    "Company";
  const companyUuid = jobCompanyUuid(job) || (typeof company.uuid === "string" ? company.uuid : undefined);
  if (companyUuid) {
    const contacts = await listCompanyContacts(accessToken, companyUuid);
    const primary = contacts.find((c) => c.is_primary_contact === "1" || c.is_primary_contact === 1);
    if (primary) {
      const name = pickName(primary) || companyName;
      add(pickPhone(primary), name, `${name} — primary contact`);
    }
    for (const c of contacts) {
      if (c === primary) continue;
      const name = pickName(c) || companyName;
      add(pickPhone(c), name, `${name} — company contact`);
    }
  }

  add(pickPhone(company), companyName, `${companyName} — company record`);
  return out;
}

export async function listSmsTemplates(accessToken: string): Promise<{ id: string; name: string; body: string }[]> {
  const res = await sm8Fetch("/api_1.0/smstemplate.json", accessToken);
  if (!res.ok) {
    console.warn("listSmsTemplates failed", res.status);
    return [];
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data
    .filter((t) => t && typeof t === "object" && ((t as Record<string, unknown>).active === 1 || (t as Record<string, unknown>).active === "1"))
    .map((t) => {
      const row = t as Record<string, unknown>;
      return {
        id: String(row.uuid ?? ""),
        name: String(row.name ?? "Untitled"),
        body: String(row.message ?? ""),
      };
    })
    .filter((t) => t.id && t.body)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getVendorName(accessToken: string): Promise<string | undefined> {
  const res = await sm8Fetch("/api_1.0/vendor.json", accessToken);
  if (!res.ok) return undefined;
  const data = (await res.json()) as unknown;
  const row = Array.isArray(data) ? data[0] : data;
  if (row && typeof row === "object") {
    const name = (row as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return undefined;
}

export async function createSmsTemplate(
  accessToken: string,
  input: { name: string; message: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = env.servicem8ApiBaseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api_1.0/smstemplate.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: input.name, message: input.message }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    return { ok: false, error: `createSmsTemplate ${res.status}: ${(await res.text()).slice(0, 300)}` };
  }
  return { ok: true };
}

export async function createJobNote(
  accessToken: string,
  jobUuid: string,
  note: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = env.servicem8ApiBaseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api_1.0/note.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      related_object: "job",
      related_object_uuid: jobUuid,
      note,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    return { ok: false, error: `createJobNote ${res.status}: ${(await res.text()).slice(0, 300)}` };
  }
  return { ok: true };
}

async function listFiltered(accessToken: string, resource: string, filter: string): Promise<Record<string, unknown>[]> {
  const res = await sm8Fetch(`/api_1.0/${resource}.json?$filter=${encodeURIComponent(filter)}`, accessToken);
  if (!res.ok) {
    console.warn(`listFiltered ${resource} failed`, res.status);
    return [];
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

export async function listJobActivities(accessToken: string, jobUuid: string): Promise<Record<string, unknown>[]> {
  return listFiltered(accessToken, "jobactivity", `job_uuid eq '${jobUuid}' and active eq 1`);
}

export async function listLocations(accessToken: string): Promise<Record<string, unknown>[]> {
  return listFiltered(accessToken, "locations", "active eq 1");
}

function parseDateParts(raw: string): { year: number; month: number; day: number; hour: number; minute: number } | undefined {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2})?)?$/);
  if (!m) return undefined;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4] ?? "0"),
    minute: Number(m[5] ?? "0"),
  };
}

function formatShortDate(raw: string): string {
  const parts = parseDateParts(raw);
  if (!parts) return "";
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`;
}

function formatExtendedDate(raw: string): string {
  const parts = parseDateParts(raw);
  if (!parts) return "";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0)));
}

function formatTime(raw: string): string {
  const parts = parseDateParts(raw);
  if (!parts) return "";
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, parts.hour, parts.minute, 0)));
}

function nextActivity(activities: Record<string, unknown>[]): Record<string, unknown> | undefined {
  const dated = activities
    .map((activity) => {
      const start = typeof activity.start_date === "string" ? activity.start_date.trim() : "";
      return { activity, start };
    })
    .filter((x) => x.start)
    .sort((a, b) => a.start.localeCompare(b.start));
  return dated[0]?.activity;
}

export async function getNextBookingContext(
  accessToken: string,
  job: ServiceM8Job
): Promise<{ nextBookingDate?: string; nextBookingDateExtended?: string; nextBookingTime?: string; assignedStaffUuid?: string }> {
  const nextBookingDate = typeof job.next_booking_date === "string" ? job.next_booking_date.trim() : "";
  const nextBookingDateExtended =
    typeof job.next_booking_date_extended === "string" ? job.next_booking_date_extended.trim() : "";
  const nextBookingTime = typeof job.next_booking_time === "string" ? job.next_booking_time.trim() : "";
  const assignedStaffUuid =
    (typeof job.staff_uuid === "string" && job.staff_uuid.trim()) ||
    (typeof job.queue_assigned_staff_uuid === "string" && job.queue_assigned_staff_uuid.trim()) ||
    (typeof job.assigned_staff_uuid === "string" && job.assigned_staff_uuid.trim()) ||
    "";
  if (nextBookingDate || nextBookingDateExtended || nextBookingTime) {
    return {
      nextBookingDate: nextBookingDate || undefined,
      nextBookingDateExtended: nextBookingDateExtended || undefined,
      nextBookingTime: nextBookingTime || undefined,
      assignedStaffUuid: assignedStaffUuid || undefined,
    };
  }
  const jobUuid = typeof job.uuid === "string" ? job.uuid : "";
  if (!jobUuid) return { assignedStaffUuid: assignedStaffUuid || undefined };
  const activity = nextActivity(await listJobActivities(accessToken, jobUuid));
  const start = typeof activity?.start_date === "string" ? activity.start_date.trim() : "";
  return {
    nextBookingDate: start ? formatShortDate(start) || undefined : undefined,
    nextBookingDateExtended: start ? formatExtendedDate(start) || undefined : undefined,
    nextBookingTime: start ? formatTime(start) || undefined : undefined,
    assignedStaffUuid:
      (typeof activity?.staff_uuid === "string" && activity.staff_uuid.trim()) || assignedStaffUuid || undefined,
  };
}

export async function getLocationPhone1(accessToken: string, job: ServiceM8Job): Promise<string | undefined> {
  const locationUuid =
    (typeof job.location_uuid === "string" && job.location_uuid.trim()) ||
    (typeof job.company_location_uuid === "string" && job.company_location_uuid.trim()) ||
    "";
  if (locationUuid) {
    const location = await getLocation(accessToken, locationUuid).catch(() => undefined);
    const phone = location && typeof location.phone_1 === "string" ? location.phone_1.trim() : "";
    if (phone) return phone;
  }
  const first = (await listLocations(accessToken).catch(() => [])).find(
    (location) => typeof location.phone_1 === "string" && location.phone_1.trim()
  );
  return first && typeof first.phone_1 === "string" ? first.phone_1.trim() : undefined;
}

export async function listJobContacts(accessToken: string, jobUuid: string): Promise<Record<string, unknown>[]> {
  return listFiltered(accessToken, "jobcontact", `job_uuid eq '${jobUuid}' and active eq 1`);
}

export async function listCompanyContacts(accessToken: string, companyUuid: string): Promise<Record<string, unknown>[]> {
  return listFiltered(accessToken, "companycontact", `company_uuid eq '${companyUuid}' and active eq 1`);
}

/** Primary company contact mobile, then company record phone */
export async function resolveCompanyPrimaryMobile(
  accessToken: string,
  job: ServiceM8Job,
  company: ServiceM8Company
): Promise<string | undefined> {
  const recipient = await resolveCompanyPrimaryRecipient(accessToken, job, company);
  return recipient?.mobile;
}

export async function resolveCompanyPrimaryRecipient(
  accessToken: string,
  job: ServiceM8Job,
  company: ServiceM8Company
): Promise<ResolvedSmsRecipient | undefined> {
  const companyUuid = jobCompanyUuid(job) || (typeof company.uuid === "string" ? company.uuid : undefined);
  if (companyUuid) {
    const contacts = await listCompanyContacts(accessToken, companyUuid);
    const primary = contacts.find((c) => c.is_primary_contact === "1" || c.is_primary_contact === 1);
    if (primary) {
      const mobile = pickPhone(primary);
      if (mobile) return { mobile, name: pickName(primary) || resolveCompanyName(company) };
    }
  }
  const mobile = pickPhone(company);
  return mobile ? { mobile, name: resolveCompanyName(company) } : undefined;
}

/** Mobile is often on job/company contacts, not the company record itself */
export async function resolveJobMobile(
  accessToken: string,
  job: ServiceM8Job,
  company: ServiceM8Company
): Promise<string | undefined> {
  const recipient = await resolveJobRecipient(accessToken, job, company);
  return recipient?.mobile;
}

function resolveCompanyName(company: ServiceM8Company): string {
  return (
    (typeof company.name === "string" && company.name) ||
    (typeof company.company_name === "string" && company.company_name) ||
    "Company"
  );
}

export async function resolveJobRecipient(
  accessToken: string,
  job: ServiceM8Job,
  company: ServiceM8Company
): Promise<ResolvedSmsRecipient | undefined> {
  let mobile = pickPhone(company);
  if (mobile) return { mobile, name: resolveCompanyName(company) };

  const jobUuid = typeof job.uuid === "string" ? job.uuid : undefined;
  if (jobUuid) {
    for (const c of await listJobContacts(accessToken, jobUuid)) {
      mobile = pickPhone(c);
      if (mobile) return { mobile, name: pickName(c) || "Contact" };
    }
  }

  const companyUuid =
    jobCompanyUuid(job) || (typeof company.uuid === "string" ? company.uuid : undefined);
  if (companyUuid) {
    const contacts = await listCompanyContacts(accessToken, companyUuid);
    const primary = contacts.find((c) => c.is_primary_contact === "1" || c.is_primary_contact === 1);
    if (primary) {
      mobile = pickPhone(primary);
      if (mobile) return { mobile, name: pickName(primary) || resolveCompanyName(company) };
    }
    for (const c of contacts) {
      mobile = pickPhone(c);
      if (mobile) return { mobile, name: pickName(c) || resolveCompanyName(company) };
    }
  }
  return undefined;
}
