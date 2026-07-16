import type { TemplateContext } from "./templates.js";

function jobStr(job: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = job[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** ServiceM8 `{job.xxx}` / `{service.name}` placeholders from job record + context */
export function buildSm8Map(
  job: Record<string, unknown>,
  ctx: TemplateContext,
  vendorName?: string
): Record<string, string> {
  const customer = ctx.customerName || jobStr(job, "company_name") || "";
  const parts = customer.trim().split(/\s+/);
  const address = ctx.address || jobStr(job, "job_address", "address");
  const description = jobStr(job, "description");
  const category = jobStr(job, "category");
  return {
    "job.generated_job_id": ctx.jobNumber || jobStr(job, "generated_job_id"),
    "job.status": ctx.status || jobStr(job, "status"),
    "job.job_address": address,
    "job.address": address,
    "job.job_address_singleline": address.replace(/\n/g, ", "),
    "job.contact_first": jobStr(job, "contact_first") || parts[0] || customer,
    "job.contact_last": jobStr(job, "contact_last") || parts.slice(1).join(" "),
    "job.contact_name": jobStr(job, "contact_name") || customer,
    "job.company_name": jobStr(job, "company_name") || customer,
    "job.description": description,
    "job.category": category,
    "job.email": jobStr(job, "email"),
    "job.mobile": ctx.mobile || jobStr(job, "mobile"),
    "job.phone_1": jobStr(job, "phone", "phone_1"),
    "job.site_name": jobStr(job, "site_name"),
    "service.name": description || category,
    "vendor.name": vendorName || "",
    "company.name": ctx.companyName || customer,
  };
}

/** Build Handlebars context from ServiceM8 job + company records */
export function buildJobTemplateContext(
  job: Record<string, unknown>,
  company: Record<string, unknown>,
  mobile?: string,
  customerName?: string
): TemplateContext {
  const jobNumber =
    (typeof job.generated_job_id === "string" && job.generated_job_id) ||
    (typeof job.job_number === "string" && job.job_number) ||
    String(job.uuid ?? "").slice(0, 8);
  const status = typeof job.status === "string" ? job.status : undefined;
  const address =
    (typeof job.job_address === "string" && job.job_address) ||
    (typeof job.address === "string" && job.address) ||
    undefined;
  const name =
    customerName ||
    (typeof company.name === "string" && company.name) ||
    (typeof company.company_name === "string" && company.company_name) ||
    "Customer";
  return {
    customerName: name,
    jobNumber: String(jobNumber),
    status,
    address,
    companyName: name,
    mobile,
  };
}
