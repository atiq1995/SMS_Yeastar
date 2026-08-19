import type { TemplateContext } from "./templates.js";

function jobStr(job: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = job[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function moneyStr(job: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = job[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(v);
    }
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(n)) {
        return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
      }
      return v.trim();
    }
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
  const currentUserFirst = ctx.currentUserFirst || "";
  const assignedStaffFirst = ctx.assignedStaffFirst || "";
  const serviceDescription =
    ctx.serviceDescription || jobStr(job, "service_description", "service_name", "service") || description || category;
  const serviceWarrantyPeriod =
    ctx.serviceWarrantyPeriod || jobStr(job, "service_warranty_period", "warranty_period", "warranty");
  // ponytail: only strings — objects become [object Object] in SMS
  const vendor = typeof vendorName === "string" ? vendorName.trim() : typeof ctx.vendorName === "string" ? ctx.vendorName.trim() : "";
  return {
    "job.generated_job_id": ctx.jobNumber || jobStr(job, "generated_job_id"),
    "job.status": ctx.status || jobStr(job, "status"),
    "job.job_address": address,
    "job.address": address,
    "job.job_address_singleline": address.replace(/\n/g, ", "),
    "job.contact_first": ctx.contactFirst || jobStr(job, "contact_first") || parts[0] || customer,
    "job.contact_last": ctx.contactLast || jobStr(job, "contact_last") || parts.slice(1).join(" "),
    "job.contact_name": jobStr(job, "contact_name") || (ctx.contactFirst ? `${ctx.contactFirst} ${ctx.contactLast || ""}`.trim() : customer),
    "job.company_name": jobStr(job, "company_name") || customer,
    "job.description": description,
    "job.category": category,
    "job.booked_by_name": jobStr(job, "booked_by_name"),
    "job.email": jobStr(job, "email"),
    "job.mobile": ctx.mobile || jobStr(job, "mobile"),
    "job.phone_1": jobStr(job, "phone", "phone_1"),
    "job.site_name": jobStr(job, "site_name"),
    "job.total_price": moneyStr(job, "total_price", "total", "invoice_total", "total_amount", "invoice_total_inc_tax", "total_invoice_amount"),
    "job.next_booking_date": ctx.nextBookingDate || jobStr(job, "next_booking_date"),
    "job.next_booking_date_extended": ctx.nextBookingDateExtended || jobStr(job, "next_booking_date_extended"),
    "job.next_booking_time": ctx.nextBookingTime || jobStr(job, "next_booking_time"),
    "job.service_warranty_period": serviceWarrantyPeriod,
    "service.name": description || category,
    "service.service_description": serviceDescription,
    "vendor.name": vendor,
    vendor,
    "company.name": ctx.companyName || customer,
    "staff.first": assignedStaffFirst || currentUserFirst,
    "calculation.current_user_first": currentUserFirst,
    "calculation.current_user_mobile": ctx.currentUserMobile || "",
    "calculation.current_user_customfield_job_title": ctx.currentUserJobTitle || "",
    "calculation.current_user_customfield_licence_number": ctx.currentUserLicenceNumber || "",
    // ponytail: Yeastar can't mint ServiceM8 portal links — leave a clear marker
    document: "[invoice link]",
    and_will_be_arriving_in_approximately_x_minutes: "and will be arriving shortly",
    "location.phone_1": ctx.vendorPhone1 || jobStr(job, "phone", "phone_1") || (typeof ctx.mobile === "string" ? ctx.mobile : ""),
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
