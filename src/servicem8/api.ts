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
  for (const k of ["mobile", "phone", "mobile_phone", "primary_phone", "Phone"]) {
    const v = company[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}
