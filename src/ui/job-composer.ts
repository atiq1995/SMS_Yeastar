import { SHARED_STYLES, COMPOSER_STYLES } from "./styles.js";
import { LIVE_FIELD_SUPPORT } from "../engine/field-support.js";
import { listJobThread } from "../db/repository.js";
import {
  getJob,
  getCompany,
  getLocationPhone1,
  getNextBookingContext,
  getStaff,
  jobCompanyUuid,
  listJobRecipients,
  listSmsTemplates,
  getVendorName,
} from "../servicem8/api.js";
import { resolveAccessToken } from "../servicem8/oauth.js";
import { buildJobTemplateContext } from "../engine/job-context.js";
import { isTestMode, testModeLabel } from "../yeastar/guard.js";
import { APP_VERSION } from "../config/version.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatPhone(mobile: string): string {
  const d = mobile.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return mobile;
}

export type JobComposerModel = {
  accountUuid: string;
  jobUuid: string;
  jobNumber: string;
  status: string;
  customerName: string;
  address: string;
  recipients: { mobile: string; label: string; name: string }[];
  templates: { id: string; name: string; body: string }[];
  thread: { dir: "out" | "in"; body: string; at: string; number: string }[];
  defaultTemplateId: string | null;
  vendorName: string;
  jobDescription: string;
  jobCategory: string;
  totalPrice: string;
  mergeFields: Record<string, string>;
  testMode: boolean;
  testModeLabel: string;
  error?: string;
  hint?: string;
};

export async function loadJobComposerModel(
  accountUuid: string,
  jobUuid: string,
  auth?: { accessToken?: string; staffUUID?: string }
): Promise<JobComposerModel> {
  const empty = (error: string, hint?: string): JobComposerModel => ({
    accountUuid,
    jobUuid,
    jobNumber: "",
    status: "",
    customerName: "",
    address: "",
    recipients: [],
    templates: [],
    thread: [],
    defaultTemplateId: null,
    vendorName: "",
    jobDescription: "",
    jobCategory: "",
    totalPrice: "",
    mergeFields: {},
    testMode: isTestMode(),
    testModeLabel: testModeLabel(),
    error,
    hint,
  });

  if (!jobUuid) return empty("No job selected");

  const token = await resolveAccessToken(accountUuid, auth);
  if (!token) {
    return empty("OAuth not connected", "Open SMS Dashboard → Settings → Reconnect OAuth");
  }

  try {
    const job = await getJob(token, jobUuid);
    const companyUuid = jobCompanyUuid(job);
    if (!companyUuid) return empty("Job has no linked customer");

    const company = await getCompany(token, companyUuid);
    const booking = await getNextBookingContext(token, job);
    const ctx = buildJobTemplateContext(job, company);
    const recipients = await listJobRecipients(token, job, company);
    const initialRecipientName = recipients[0]?.name || ctx.customerName || "Customer";
    const currentStaffUuid = typeof auth?.staffUUID === "string" && auth.staffUUID.trim() ? auth.staffUUID : "";
    const assignedStaffUuid =
      booking.assignedStaffUuid ||
      (typeof job.staff_uuid === "string" && job.staff_uuid.trim() && job.staff_uuid) ||
      (typeof job.queue_assigned_staff_uuid === "string" && job.queue_assigned_staff_uuid.trim() && job.queue_assigned_staff_uuid) ||
      (typeof job.assigned_staff_uuid === "string" && job.assigned_staff_uuid.trim() && job.assigned_staff_uuid) ||
      "";
    const [templates, thread, vendorName, vendorPhone1, currentStaff, assignedStaff] = await Promise.all([
      listSmsTemplates(token),
      Promise.resolve(listJobThread(jobUuid)),
      getVendorName(token),
      getLocationPhone1(token, job).catch(() => undefined),
      currentStaffUuid ? getStaff(token, currentStaffUuid).catch(() => ({})) : Promise.resolve({}),
      assignedStaffUuid ? getStaff(token, assignedStaffUuid).catch(() => ({})) : Promise.resolve({}),
    ]);
    const enRoute = templates.find((t) => /en.?route/i.test(t.name));
    const jobDescription = typeof job.description === "string" ? job.description : "";
    const jobCategory = typeof job.category === "string" ? job.category : "";
    const totalPrice = moneyText(job);
    const mergeFields = buildComposerMergeFields({
      job,
      company,
      vendorName: vendorName ?? "",
      vendorPhone1: vendorPhone1 ?? "",
      customerName: initialRecipientName,
      companyName: ctx.companyName ?? ctx.customerName ?? "Customer",
      address: ctx.address ?? "",
      status: ctx.status ?? "",
      jobNumber: ctx.jobNumber ?? "",
      totalPrice,
      nextBookingDate: booking.nextBookingDate,
      nextBookingDateExtended: booking.nextBookingDateExtended,
      nextBookingTime: booking.nextBookingTime,
      currentStaff,
      assignedStaff,
    });

    return {
      accountUuid,
      jobUuid,
      jobNumber: ctx.jobNumber ?? "",
      status: ctx.status ?? "",
      customerName: initialRecipientName,
      address: ctx.address ?? "—",
      recipients,
      templates,
      thread,
      vendorName: vendorName ?? "",
      jobDescription,
      jobCategory,
      totalPrice,
      mergeFields,
      testMode: isTestMode(),
      testModeLabel: testModeLabel(),
      defaultTemplateId: enRoute?.id ?? templates[0]?.id ?? null,
    };
  } catch (e) {
    return empty("Could not load job", String(e));
  }
}

function renderThread(messages: JobComposerModel["thread"]): string {
  if (!messages.length) {
    return '<div class="empty-thread empty">No messages for this job yet</div>';
  }
  return messages
    .map(
      (m) =>
        `<div class="msg ${m.dir}">` +
        `<div class="msg-bubble">${esc(m.body)}</div>` +
        `<div class="msg-meta">${m.dir === "out" ? "Sent" : "Received"} · ${esc(String(m.at))}</div>` +
        `</div>`
    )
    .join("");
}

function moneyText(job: Record<string, unknown>): string {
  for (const key of ["total_price", "total", "invoice_total", "total_amount", "invoice_total_inc_tax", "total_invoice_amount"]) {
    const value = job[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
    }
    if (typeof value === "string" && value.trim()) {
      const num = Number(value.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(num)) {
        return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(num);
      }
      return value.trim();
    }
  }
  return "";
}

function firstWord(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim().split(/\s+/)[0] ?? "" : "";
}

function text(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function buildComposerMergeFields(args: {
  job: Record<string, unknown>;
  company: Record<string, unknown>;
  vendorName: string;
  vendorPhone1: string;
  customerName: string;
  companyName: string;
  address: string;
  status: string;
  jobNumber: string;
  totalPrice: string;
  nextBookingDate?: string;
  nextBookingDateExtended?: string;
  nextBookingTime?: string;
  currentStaff: Record<string, unknown>;
  assignedStaff: Record<string, unknown>;
}): Record<string, string> {
  const {
    job,
    company,
    vendorName,
    vendorPhone1,
    customerName,
    companyName,
    address,
    status,
    jobNumber,
    totalPrice,
    nextBookingDate,
    nextBookingDateExtended,
    nextBookingTime,
    currentStaff,
    assignedStaff,
  } = args;
  const description = text(job, "description");
  const category = text(job, "category");
  const currentUserFirst = firstWord(currentStaff.first) || firstWord(currentStaff.full_name) || firstWord(currentStaff.name);
  const assignedStaffFirst = firstWord(assignedStaff.first) || firstWord(assignedStaff.full_name) || firstWord(assignedStaff.name);
  const serviceDescription =
    text(job, "service_description", "service_name", "service") || description || category;
  const serviceWarrantyPeriod =
    text(job, "service_warranty_period", "warranty_period", "warranty") ||
    text(company, "service_warranty_period", "warranty_period", "warranty");
  return {
    "job.generated_job_id": jobNumber,
    "job.status": status || text(job, "status"),
    "job.job_address": address,
    "job.address": address,
    "job.job_address_singleline": address.replace(/\n/g, ", "),
    "job.contact_first": text(job, "contact_first") || firstWord(customerName) || customerName,
    "job.contact_last": text(job, "contact_last") || customerName.trim().split(/\s+/).slice(1).join(" "),
    "job.contact_name": text(job, "contact_name") || customerName,
    "job.company_name": text(job, "company_name") || companyName,
    "job.description": description,
    "job.category": category,
    "job.total_price": totalPrice,
    "job.booked_by_name": text(job, "booked_by_name"),
    "job.next_booking_date": nextBookingDate || text(job, "next_booking_date"),
    "job.next_booking_date_extended": nextBookingDateExtended || text(job, "next_booking_date_extended"),
    "job.next_booking_time": nextBookingTime || text(job, "next_booking_time"),
    "job.service_warranty_period": serviceWarrantyPeriod,
    "service.name": description || category,
    "service.service_description": serviceDescription,
    "company.name": text(company, "name", "company_name") || companyName,
    "vendor.name": vendorName,
    vendor: vendorName,
    document: "[invoice link]",
    "staff.first": assignedStaffFirst || currentUserFirst,
    "location.phone_1": vendorPhone1 || text(job, "phone", "phone_1"),
    "calculation.current_user_first": currentUserFirst,
    "calculation.current_user_mobile": text(currentStaff, "mobile"),
    "calculation.current_user_customfield_job_title": text(currentStaff, "customfield_job_title", "job_title", "position"),
    "calculation.current_user_customfield_licence_number": text(
      currentStaff,
      "customfield_licence_number",
      "licence_number",
      "license_number"
    ),
    and_will_be_arriving_in_approximately_x_minutes: "and will be arriving shortly",
  };
}

function renderError(model: JobComposerModel): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Send SMS</title>
<script src="https://platform.servicem8.com/sdk/1.0/sdk.js"></script>
<style>${SHARED_STYLES}${COMPOSER_STYLES}</style></head>
<body>
<div class="composer">
  <div class="composer-header">
    <h1>Send SMS <span class="version">v${esc(APP_VERSION)}</span></h1>
    <button type="button" class="icon-btn" id="btnClose">×</button>
  </div>
  <div class="composer-error">
    <strong>${esc(model.error ?? "Error")}</strong>
    ${model.hint ? `<p>${esc(model.hint)}</p>` : ""}
  </div>
  <div class="composer-footer">
    <button type="button" class="secondary" id="btnClose2">Close</button>
  </div>
</div>
<script>
let client = null;
try { client = SMClient.init(); } catch (e) {}
function closeModal() {
  try { if (client && client.close) client.close(); } catch (e) {}
}
document.getElementById('btnClose').addEventListener('click', closeModal);
document.getElementById('btnClose2').addEventListener('click', closeModal);
</script>
</body></html>`;
}

export function renderJobComposerHtml(model: JobComposerModel): string {
  if (model.error) return renderError(model);

  const tplJson = JSON.stringify(model.templates.map((t) => ({ id: t.id, name: t.name, body: t.body })));
  const ctxJson = JSON.stringify({
    customerName: model.recipients[0]?.name ?? model.customerName,
    jobNumber: model.jobNumber,
    status: model.status,
    address: model.address,
    vendorName: model.vendorName,
    jobDescription: model.jobDescription,
    jobCategory: model.jobCategory,
    totalPrice: model.totalPrice,
    mergeFields: model.mergeFields,
  });
  const fieldSupportJson = JSON.stringify(LIVE_FIELD_SUPPORT);
  const defaultTpl = model.defaultTemplateId ?? "";

  const recipientOptions = model.recipients.length
    ? model.recipients
        .map(
          (r, i) =>
            `<option value="${esc(r.mobile)}" data-name="${esc(r.name)}"${i === 0 ? " selected" : ""}>${esc(r.label)} — ${esc(formatPhone(r.mobile))}</option>`
        )
        .join("")
    : "";

  const noRecipients = !model.recipients.length;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Send SMS</title>
<script src="https://platform.servicem8.com/sdk/1.0/sdk.js"></script>
<style>${SHARED_STYLES}${COMPOSER_STYLES}</style></head>
<body>
<div class="composer" role="dialog" aria-labelledby="composerTitle">
  <div class="composer-header">
    <h1 id="composerTitle">Send SMS <span class="version">v${esc(APP_VERSION)}</span></h1>
    <button type="button" class="icon-btn" title="Close" id="btnClose">×</button>
  </div>

  <div id="toast" class="toast" style="margin:12px 16px 0"></div>
  ${model.testMode ? `<div class="test-banner">UAT mode: ${esc(model.testModeLabel)}</div>` : ""}

  ${
    noRecipients
      ? `<div class="composer-error"><strong>No mobile number found</strong><p>Add a mobile on the job contact or company contact in ServiceM8.</p></div>`
      : !model.templates.length
        ? `<div class="composer-error"><strong>No SMS templates found</strong><p>Reconnect OAuth (Settings) so the add-on can read ServiceM8 templates, or add templates in ServiceM8.</p></div>`
        : `<div class="composer-body">
    <label for="recipient">To</label>
    <select id="recipient">${recipientOptions}</select>

    <label for="template">Template</label>
    <select id="template">
      <option value="">— Custom message —</option>
      ${model.templates.map((t) => `<option value="${t.id}"${t.id === model.defaultTemplateId ? " selected" : ""}>${esc(t.name)}</option>`).join("")}
    </select>

    <label for="message">Message</label>
    <div class="chips" id="chips"></div>
    <textarea id="message" placeholder="Type your message…"></textarea>
    <div class="char-row" id="charRow">
      <span id="segInfo">1 SMS segment</span>
      <span id="charCount">0 chars</span>
    </div>

    <div class="preview-bubble"><strong>Preview</strong><span id="preview"></span></div>
    <div id="fieldWarnings" class="field-warnings" hidden></div>

    <div class="thread">
      <h3>Recent messages (this job)</h3>
      <div class="thread-list" id="thread">${renderThread(model.thread)}</div>
    </div>
  </div>`
  }

  <div class="composer-footer">
    <button type="button" class="secondary" id="btnCancel">Cancel</button>
    <button type="button" id="btnSend"${noRecipients || !model.templates.length ? " disabled" : ""}>Send SMS</button>
  </div>
</div>

<script>
let client = null;
try { client = SMClient.init(); } catch (e) { console.warn('SMClient', e); }

const accountUuid = ${JSON.stringify(model.accountUuid)};
const jobUuid = ${JSON.stringify(model.jobUuid)};
const templates = ${tplJson};
const TEMPLATE_BODIES = Object.fromEntries(templates.map((t) => [String(t.id), t.body]));
const CTX = ${ctxJson};
const FIELD_SUPPORT = ${fieldSupportJson};
const VARS = [
  { key: 'customerName', label: 'Customer' },
  { key: 'jobNumber', label: 'Job #' },
  { key: 'status', label: 'Status' },
  { key: 'address', label: 'Address' },
];

const el = (id) => document.getElementById(id);
const msgEl = el('message');
const tplEl = el('template');
const recipientEl = el('recipient');
const previewEl = el('preview');
const charCountEl = el('charCount');
const charRowEl = el('charRow');
const segInfoEl = el('segInfo');
const toastEl = el('toast');
const btnSend = el('btnSend');
const fieldWarningsEl = el('fieldWarnings');

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function parseInvoke(res) {
  if (res == null) return {};
  if (typeof res === 'string') {
    try { return JSON.parse(res); } catch (e) { return { error: res }; }
  }
  return res;
}

function tidySmsWhitespace(text) {
  return text
    .replace(/\\u00AD/g, '')
    .replace(/[ \\t]{2,}/g, ' ')
    .replace(/\\s+([,.!?;:])/g, '$1')
    .trim();
}

function isSm8FieldTag(key) {
  const k = String(key || '').toLowerCase();
  if (k === 'document' || k === 'vendor' || k === 'and_will_be_arriving_in_approximately_x_minutes') return true;
  return /^(job|vendor|company|service|location|staff|asset|form|calculation)\\.[a-z0-9_.]+$/.test(k);
}

function templateKeys(text) {
  const keys = [];
  const seen = new Set();
  String(text || '').replace(/\\{\\{[\\s\\S]*?\\}\\}|\\{([a-z0-9_.]+)\\}/gi, (match, key) => {
    if (!key) return match;
    const k = String(key).toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
    return match;
  });
  return keys;
}

function fieldIssues(text) {
  const exactMissing = [];
  const derivedMissing = [];
  const unsupported = [];
  const mergeFields = CTX.mergeFields || {};
  templateKeys(text).forEach((key) => {
    const info = FIELD_SUPPORT[key];
    if (!info) return;
    if (info.status === 'unsupported') {
      unsupported.push(key);
      return;
    }
    const value = mergeFields[key];
    if (typeof value === 'string' && value.trim()) return;
    if (info.status === 'exact') exactMissing.push(key);
    else derivedMissing.push(key);
  });
  return { exactMissing, derivedMissing, unsupported };
}

function renderPreview(text) {
  const sm8 = Object.fromEntries(
    Object.entries(CTX.mergeFields || {}).map(([k, v]) => [String(k).toLowerCase(), typeof v === 'string' ? v : ''])
  );
  // Only known ServiceM8 tags — unknown {ss} etc. stay visible
  let out = text.replace(/\\{\\{[\\s\\S]*?\\}\\}|\\{([a-z0-9_.]+)\\}/gi, (match, k) => {
    if (k == null) return match;
    if (!isSm8FieldTag(k)) return match;
    return sm8[k.toLowerCase()] ?? '';
  });
  out = out.replace(/\\{\\{(\\w+)\\}\\}/g, (_, k) => {
    const v = CTX[k];
    return typeof v === 'string' ? v : '';
  });
  return tidySmsWhitespace(out);
}

function renderFieldWarnings(text) {
  if (!fieldWarningsEl) return { blocking: false };
  const issues = fieldIssues(text);
  const blocking = issues.unsupported.length > 0 || issues.exactMissing.length > 0;
  const lines = [];
  if (issues.unsupported.length) lines.push('Unsupported here: ' + issues.unsupported.join(', '));
  if (issues.exactMissing.length) lines.push('Missing ServiceM8 data: ' + issues.exactMissing.join(', '));
  if (issues.derivedMissing.length) lines.push('Optional derived fields are blank: ' + issues.derivedMissing.join(', '));
  fieldWarningsEl.hidden = lines.length === 0;
  fieldWarningsEl.className = 'field-warnings' + (blocking ? ' err' : '');
  fieldWarningsEl.innerHTML = lines.map((line) => '<div>' + escHtml(line) + '</div>').join('');
  return { blocking };
}

function showToast(text, err) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.className = 'toast show' + (err ? ' err' : '');
  setTimeout(() => { toastEl.className = 'toast'; }, 4000);
}

function closeModal() {
  try { if (client && client.close) client.close(); } catch (e) {}
}

function invoke(event, args) {
  if (!client) throw new Error('ServiceM8 SDK not available');
  return client.invoke(event, Object.assign({ account_uuid: accountUuid }, args || {}));
}

function setRecipientMergeFields(name) {
  const full = String(name || '').trim();
  const parts = full ? full.split(/\s+/) : [];
  if (!CTX.mergeFields) CTX.mergeFields = {};
  CTX.mergeFields['job.contact_first'] = parts[0] || full;
  CTX.mergeFields['job.contact_last'] = parts.slice(1).join(' ');
  CTX.mergeFields['job.contact_name'] = full;
}

function updateCtxFromRecipient() {
  if (!recipientEl) return;
  const opt = recipientEl.selectedOptions[0];
  if (opt?.dataset.name) {
    CTX.customerName = opt.dataset.name;
    setRecipientMergeFields(opt.dataset.name);
  }
  refresh();
}

function refresh() {
  if (!msgEl || !previewEl) return;
  const rendered = renderPreview(msgEl.value);
  const warnings = renderFieldWarnings(msgEl.value);
  previewEl.textContent = rendered || '(empty)';
  const len = rendered.length;
  const segs = len === 0 ? 0 : len <= 160 ? 1 : Math.ceil(len / 153);
  charCountEl.textContent = len + ' chars';
  segInfoEl.textContent = segs <= 1
    ? '1 SMS segment'
    : segs + ' SMS segments (OK — sends as one message)';
  charRowEl.className = 'char-row' + (len > 160 ? ' warn' : '');
  if (btnSend) btnSend.disabled = !rendered.trim() || warnings.blocking;
}

if (msgEl) {
  const chipsEl = el('chips');
  VARS.forEach((v) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = v.label;
    chip.addEventListener('click', () => {
      const tag = '{{' + v.key + '}}';
      const start = msgEl.selectionStart ?? msgEl.value.length;
      const end = msgEl.selectionEnd ?? start;
      msgEl.value = msgEl.value.slice(0, start) + tag + msgEl.value.slice(end);
      msgEl.focus();
      msgEl.selectionStart = msgEl.selectionEnd = start + tag.length;
      refresh();
    });
    chipsEl.appendChild(chip);
  });

  tplEl.addEventListener('change', () => {
    const body = TEMPLATE_BODIES[tplEl.value];
    if (body) msgEl.value = body;
    refresh();
  });

  recipientEl.addEventListener('change', updateCtxFromRecipient);
  msgEl.addEventListener('input', refresh);

  const defaultId = ${JSON.stringify(String(defaultTpl))};
  setRecipientMergeFields(CTX.customerName);
  if (defaultId && TEMPLATE_BODIES[defaultId]) {
    msgEl.value = TEMPLATE_BODIES[defaultId];
  }
  refresh();
}

el('btnClose')?.addEventListener('click', closeModal);
el('btnCancel')?.addEventListener('click', closeModal);

btnSend?.addEventListener('click', async () => {
  const opt = recipientEl.selectedOptions[0];
  const to = recipientEl.value;
  const recipientName = opt?.dataset.name || '';
  const text = renderPreview(msgEl.value);
  if (!text.trim()) return;
  btnSend.disabled = true;
  btnSend.textContent = 'Sending…';
  try {
    // Send rendered text so preview === phone (server still strips any leftover tags)
    const res = parseInvoke(await invoke('sms_dashboard_send', {
      job_uuid: jobUuid,
      to_number: to,
      recipient_name: recipientName,
      message: text,
    }));
    if (res.error) {
      showToast(res.hint ? res.error + ' — ' + res.hint : res.error, true);
      return;
    }
    showToast(res.queued ? 'SMS queued — sending shortly' : 'SMS sent');
    const thread = el('thread');
    const div = document.createElement('div');
    div.className = 'msg out';
    div.innerHTML = '<div class="msg-bubble">' + escHtml(text) + '</div><div class="msg-meta">Sent · just now</div>';
    thread.appendChild(div);
    thread.scrollTop = thread.scrollHeight;
    setTimeout(closeModal, 1200);
  } catch (e) {
    showToast(String(e), true);
  } finally {
    btnSend.disabled = !renderPreview(msgEl.value).trim();
    btnSend.textContent = 'Send SMS';
  }
});
</script>
</body></html>`;
}

export async function renderJobActionHtml(
  accountUuid: string,
  jobUuid: string,
  auth?: { accessToken?: string }
): Promise<string> {
  const model = await loadJobComposerModel(accountUuid, jobUuid, auth);
  return renderJobComposerHtml(model);
}
