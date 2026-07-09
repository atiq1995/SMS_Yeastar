import Handlebars from "handlebars";

export type TemplateContext = {
  customerName?: string;
  jobNumber?: string;
  status?: string;
  address?: string;
  companyName?: string;
  mobile?: string;
  [key: string]: string | undefined;
};

export function renderTemplate(body: string, ctx: TemplateContext): string {
  const tpl = Handlebars.compile(body, { noEscape: true });
  return tpl(ctx).trim();
}

/** Collapse gaps left when a placeholder resolves to empty */
function tidySmsWhitespace(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

/** ServiceM8 `{job.xxx}` tokens + our `{{var}}` Handlebars syntax */
export function renderSmsBody(body: string, ctx: TemplateContext, vendorName?: string): string {
  const customer = ctx.customerName || "";
  const parts = customer.trim().split(/\s+/);
  const sm8: Record<string, string> = {
    "job.generated_job_id": ctx.jobNumber || "",
    "job.status": ctx.status || "",
    "job.job_address": ctx.address || "",
    "job.address": ctx.address || "",
    "job.contact_first": parts[0] || customer,
    "job.contact_last": parts.slice(1).join(" "),
    "job.contact_name": customer,
    "company.name": ctx.companyName || customer,
    "vendor.name": vendorName || ctx.companyName || "",
  };
  // ponytail: unknown `{job.xxx}` → "" so customers never see raw tags; known empty fields → ""
  const withSm8 = body.replace(/\{([a-z0-9_.]+)\}/gi, (_, key: string) => sm8[key.toLowerCase()] ?? "");
  const rendered = /\{\{/.test(withSm8) ? renderTemplate(withSm8, ctx) : withSm8;
  return tidySmsWhitespace(rendered);
}
