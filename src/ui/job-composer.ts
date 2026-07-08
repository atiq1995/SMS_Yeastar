import { SHARED_STYLES, COMPOSER_STYLES } from "./styles.js";
import { listJobThread } from "../db/repository.js";
import { getJob, getCompany, jobCompanyUuid, listJobRecipients, listSmsTemplates, getVendorName } from "../servicem8/api.js";
import { resolveAccessToken } from "../servicem8/oauth.js";
import { buildJobTemplateContext } from "../engine/job-context.js";

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
  error?: string;
  hint?: string;
};

export async function loadJobComposerModel(
  accountUuid: string,
  jobUuid: string,
  auth?: { accessToken?: string }
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
    const ctx = buildJobTemplateContext(job, company);
    const recipients = await listJobRecipients(token, job, company);
    const [templates, thread, vendorName] = await Promise.all([
      listSmsTemplates(token),
      Promise.resolve(listJobThread(jobUuid)),
      getVendorName(token),
    ]);
    const enRoute = templates.find((t) => /en.?route/i.test(t.name));

    return {
      accountUuid,
      jobUuid,
      jobNumber: ctx.jobNumber ?? "",
      status: ctx.status ?? "",
      customerName: ctx.customerName ?? "Customer",
      address: ctx.address ?? "—",
      recipients,
      templates,
      thread,
      vendorName: vendorName ?? "",
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

function renderError(model: JobComposerModel): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Send SMS</title>
<script src="https://platform.servicem8.com/sdk/1.0/sdk.js"></script>
<style>${SHARED_STYLES}${COMPOSER_STYLES}</style></head>
<body>
<div class="composer">
  <div class="composer-header">
    <h1>Send SMS</h1>
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
  });
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
    <h1 id="composerTitle">Send SMS</h1>
    <button type="button" class="icon-btn" title="Close" id="btnClose">×</button>
  </div>

  <div id="toast" class="toast" style="margin:12px 16px 0"></div>

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
      <span id="charCount">0 / 160</span>
    </div>

    <div class="preview-bubble"><strong>Preview</strong><span id="preview"></span></div>

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

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function renderPreview(text) {
  const customer = CTX.customerName || '';
  const parts = customer.trim().split(/\\s+/);
  const sm8 = {
    'job.generated_job_id': CTX.jobNumber || '',
    'job.status': CTX.status || '',
    'job.job_address': CTX.address || '',
    'job.address': CTX.address || '',
    'job.contact_first': parts[0] || customer,
    'job.contact_last': parts.slice(1).join(' '),
    'job.contact_name': customer,
    'company.name': customer,
    'vendor.name': CTX.vendorName || '',
  };
  let out = text.replace(/\\{([a-z0-9_.]+)\\}/gi, (_, k) => sm8[k.toLowerCase()] ?? '{' + k + '}');
  out = out.replace(/\\{\\{(\\w+)\\}\\}/g, (_, k) => CTX[k] ?? '');
  return out;
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

function updateCtxFromRecipient() {
  if (!recipientEl) return;
  const opt = recipientEl.selectedOptions[0];
  if (opt?.dataset.name) CTX.customerName = opt.dataset.name;
  refresh();
}

function refresh() {
  if (!msgEl || !previewEl) return;
  const rendered = renderPreview(msgEl.value);
  previewEl.textContent = rendered || '(empty)';
  const len = rendered.length;
  const segs = len === 0 ? 0 : len <= 160 ? 1 : Math.ceil(len / 153);
  charCountEl.textContent = len + ' / 160';
  segInfoEl.textContent = segs <= 1 ? '1 SMS segment' : segs + ' SMS segments';
  charRowEl.className = 'char-row' + (len > 160 ? ' warn' : '') + (len > 306 ? ' over' : '');
  if (btnSend) btnSend.disabled = !rendered.trim();
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
  btnSend.disabled = true;
  btnSend.textContent = 'Sending…';
  try {
    const res = await invoke('sms_dashboard_send', {
      job_uuid: jobUuid,
      to_number: to,
      recipient_name: recipientName,
      message: msgEl.value,
    });
    if (res.error) {
      showToast(res.hint ? res.error + ' — ' + res.hint : res.error, true);
      btnSend.disabled = false;
      btnSend.textContent = 'Send SMS';
      return;
    }
    showToast(res.queued ? 'SMS queued — sending shortly' : 'SMS sent');
    const thread = el('thread');
    const text = renderPreview(msgEl.value);
    const div = document.createElement('div');
    div.className = 'msg out';
    div.innerHTML = '<div class="msg-bubble">' + escHtml(text) + '</div><div class="msg-meta">Sent · just now</div>';
    thread.appendChild(div);
    thread.scrollTop = thread.scrollHeight;
    setTimeout(closeModal, 1200);
  } catch (e) {
    showToast(String(e), true);
    btnSend.disabled = false;
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
