import Handlebars from "handlebars";
import { buildSm8Map } from "./job-context.js";

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
export function renderSmsBody(
  body: string,
  ctx: TemplateContext,
  opts?: { job?: Record<string, unknown>; vendorName?: string }
): string {
  const sm8 = buildSm8Map(opts?.job ?? {}, ctx, opts?.vendorName);
  // ponytail: unknown `{job.xxx}` → "" so customers never see raw tags; known empty fields → ""
  const withSm8 = body.replace(/\{([a-z0-9_.]+)\}/gi, (_, key: string) => sm8[key.toLowerCase()] ?? "");
  const rendered = /\{\{/.test(withSm8) ? renderTemplate(withSm8, ctx) : withSm8;
  return tidySmsWhitespace(rendered);
}
