import Handlebars from "handlebars";
import { buildSm8Map } from "./job-context.js";

export type TemplateContext = {
  customerName?: string;
  jobNumber?: string;
  status?: string;
  address?: string;
  companyName?: string;
  mobile?: string;
  vendorName?: string;
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

function onlyStrings(ctx: TemplateContext, vendorName?: string): TemplateContext {
  const out: TemplateContext = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === "string") out[k] = v;
  }
  if (typeof vendorName === "string" && vendorName.trim()) out.vendorName = vendorName.trim();
  return out;
}

function sm8Value(map: Record<string, string>, key: string): string {
  const v = map[key.toLowerCase()];
  return typeof v === "string" ? v : "";
}

/** ServiceM8 `{job.xxx}` tokens + our `{{var}}` Handlebars syntax */
export function renderSmsBody(
  body: string,
  ctx: TemplateContext,
  opts?: { job?: Record<string, unknown>; vendorName?: string }
): string {
  const vendorName = typeof opts?.vendorName === "string" ? opts.vendorName : undefined;
  const hbCtx = onlyStrings(ctx, vendorName);
  const sm8 = buildSm8Map(opts?.job ?? {}, hbCtx, vendorName);
  // Leave `{{handlebars}}` alone; only replace single-brace ServiceM8 `{job.xxx}` tags.
  // ponytail: unknown tags → "" so customers never see raw placeholders; never stringify objects.
  const withSm8 = body.replace(/\{\{[\s\S]*?\}\}|\{([a-z0-9_.]+)\}/gi, (match, key: string | undefined) =>
    key == null ? match : sm8Value(sm8, key)
  );
  const rendered = /\{\{/.test(withSm8) ? renderTemplate(withSm8, hbCtx) : withSm8;
  return tidySmsWhitespace(rendered);
}
