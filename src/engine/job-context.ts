import type { TemplateContext } from "./templates.js";

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
