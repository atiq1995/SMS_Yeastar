import { env } from "../config/env.js";

export type ServiceM8Job = Record<string, unknown>;
export type ServiceM8Company = Record<string, unknown>;

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

async function listFiltered(accessToken: string, resource: string, filter: string): Promise<Record<string, unknown>[]> {
  const res = await sm8Fetch(`/api_1.0/${resource}.json?$filter=${encodeURIComponent(filter)}`, accessToken);
  if (!res.ok) {
    console.warn(`listFiltered ${resource} failed`, res.status);
    return [];
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

export async function listJobContacts(accessToken: string, jobUuid: string): Promise<Record<string, unknown>[]> {
  return listFiltered(accessToken, "jobcontact", `job_uuid eq '${jobUuid}' and active eq 1`);
}

export async function listCompanyContacts(accessToken: string, companyUuid: string): Promise<Record<string, unknown>[]> {
  return listFiltered(accessToken, "companycontact", `company_uuid eq '${companyUuid}' and active eq 1`);
}

/** Mobile is often on job/company contacts, not the company record itself */
export async function resolveJobMobile(
  accessToken: string,
  job: ServiceM8Job,
  company: ServiceM8Company
): Promise<string | undefined> {
  let mobile = pickPhone(company);
  if (mobile) return mobile;

  const jobUuid = typeof job.uuid === "string" ? job.uuid : undefined;
  if (jobUuid) {
    for (const c of await listJobContacts(accessToken, jobUuid)) {
      mobile = pickPhone(c);
      if (mobile) return mobile;
    }
  }

  const companyUuid =
    jobCompanyUuid(job) || (typeof company.uuid === "string" ? company.uuid : undefined);
  if (companyUuid) {
    const contacts = await listCompanyContacts(accessToken, companyUuid);
    const primary = contacts.find((c) => c.is_primary_contact === "1" || c.is_primary_contact === 1);
    if (primary) {
      mobile = pickPhone(primary);
      if (mobile) return mobile;
    }
    for (const c of contacts) {
      mobile = pickPhone(c);
      if (mobile) return mobile;
    }
  }
  return undefined;
}
