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
