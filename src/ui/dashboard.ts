import { SHARED_STYLES } from "./styles.js";
import {
  countOutboundSince,
  getSetting,
  listInbound,
  listOutbound,
  listPendingScheduled,
  listRules,
  listTemplates,
} from "../db/repository.js";
import { env } from "../config/env.js";
import { APP_VERSION } from "../config/version.js";
import { isTestMode, resolveUatConfig, testModeLabel } from "../yeastar/guard.js";
import { resolveAccessToken } from "../servicem8/oauth.js";
import { createSmsTemplate, listBadges, listSmsTemplates } from "../servicem8/api.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function statusLabelText(s: string): string {
  return (
    {
      submitted: "Submitted",
      sent: "Submitted",
      dry_run: "Dry run",
      test_redirected: "Redirected",
      test_redirected_dry_run: "Redirected (dry run)",
      blocked_duplicate: "Blocked duplicate",
      queued: "Queued",
      blocked_quiet_hours: "Blocked quiet hours",
      blocked_exclusion: "Blocked exclusion",
      blocked_suppress_badge: "Suppressed badge",
      blocked_test_mode: "Blocked test mode",
      failed: "Failed",
    }[s] || s
  );
}

export async function renderDashboardHtml(accountUuid: string, auth?: { accessToken?: string }): Promise<string> {
  const templates = listTemplates();
  const rules = listRules();
  const outbound = listOutbound(50);
  const inbound = listInbound(50);
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const sent7d = countOutboundSince(since);
  const enRoute = getSetting("en_route_statuses") ?? "En Route,Dispatched";
  const automationCooldown = getSetting("automation_cooldown_minutes") ?? "15";
  const quietHoursEnabled = (getSetting("quiet_hours_enabled") ?? "1") !== "0";
  const quietHoursStart = getSetting("quiet_hours_start") ?? "20";
  const quietHoursEnd = getSetting("quiet_hours_end") ?? "7";
  const exclusionKeywords = getSetting("automation_exclusion_keywords") ?? "admin,internal,test";
  const uat = resolveUatConfig();
  const uatEnabled = uat.enabled;
  const uatRedirect = uat.mobile;
  const token = await resolveAccessToken(accountUuid, auth);
  const importedTemplates = token ? await listSmsTemplates(token) : [];
  const badges = token ? await listBadges(token) : [];
  const pending = listPendingScheduled(100);
  const rulesByName = new Map(rules.map((r) => [r.id, r.name]));

  const tplJson = JSON.stringify(templates.map((t) => ({ id: t.id, name: t.name, body: t.body })));
  const importedTplJson = JSON.stringify(importedTemplates);
  const rulesJson = JSON.stringify(
    rules.map((r) => ({
      id: r.id,
      name: r.name,
      trigger_type: r.trigger_type,
      status_match: r.status_match ?? "",
      template_id: r.template_id,
      enabled: !!r.enabled,
      recipient_type: r.recipient_type || "job_contact",
      recipient_number: r.recipient_number ?? "",
      badge_json: r.badge_json ?? "",
      suppress_badge_json: r.suppress_badge_json ?? "",
      schedule_offset_value: r.schedule_offset_value,
      schedule_offset_unit: r.schedule_offset_unit ?? "days",
      schedule_anchor: r.schedule_anchor ?? "badge_added",
    }))
  );
  const badgesJson = JSON.stringify(badges);
  const pendingJson = JSON.stringify(
    pending.map((p) => ({
      id: p.id,
      job_uuid: p.job_uuid,
      rule_id: p.rule_id,
      rule_name: rulesByName.get(p.rule_id) || `#${p.rule_id}`,
      badge_name: p.badge_name,
      fire_at: p.fire_at,
    }))
  );
  const maxTplId = templates.reduce((m, t) => Math.max(m, t.id), 0);
  const maxRuleId = rules.reduce((m, r) => Math.max(m, r.id), 0);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SMS Dashboard</title>
<script src="https://platform.servicem8.com/sdk/1.0/sdk.js"></script>
<style>${SHARED_STYLES}</style></head>
<body>
<h1>SMS Dashboard <span class="version">v${esc(APP_VERSION)}</span></h1>
<p class="muted">Account ${esc(accountUuid)}</p>
<div class="tabs" id="tabs">
  <button type="button" class="tab active" data-tab="overview">Overview</button>
  <button type="button" class="tab" data-tab="rules">Automation</button>
  <button type="button" class="tab" data-tab="templates">Templates</button>
  <button type="button" class="tab" data-tab="pending">Pending</button>
  <button type="button" class="tab" data-tab="log">Log</button>
  <button type="button" class="tab" data-tab="inbox">Inbox</button>
  <button type="button" class="tab" data-tab="analytics">Analytics</button>
  <button type="button" class="tab" data-tab="settings">Settings</button>
</div>

<div id="overview" class="panel active">
  <div class="panel-head">
    <div>
      <div class="stat" id="statSent7d">${sent7d}</div>
      <div class="muted">Outbound (7 days)</div>
    </div>
    <button type="button" id="refreshDashboard" class="secondary sm">Refresh</button>
  </div>
  <p>Yeastar send: <strong>${env.yeastarSendEnabled ? "enabled" : "dry-run"}</strong></p>
  <p id="uatBanner">${
    isTestMode()
      ? `<span style="background:#fef3c7;border:1px solid #fcd34d;padding:8px 12px;border-radius:6px;font-size:13px;color:#92400e;display:inline-block">UAT mode: ${esc(testModeLabel())}</span>`
      : `<span style="background:#ecfdf5;border:1px solid #a7f3d0;padding:8px 12px;border-radius:6px;font-size:13px;color:#065f46;display:inline-block">Live mode — messages go to customers</span>`
  }</p>
</div>

<div id="rules" class="panel">
  <div class="panel-head">
    <div>
      <h2>Automation</h2>
      <p class="muted" style="margin:4px 0 0">When to send, what to say, and who gets the SMS.</p>
    </div>
    <button type="button" id="addRule" class="secondary">+ Add automation</button>
  </div>
  <div class="rule-cards" id="ruleList"></div>
  <div class="actions">
    <button type="button" id="saveRules">Save automations</button>
    <span id="rulesToast" class="toast"></span>
  </div>
</div>

<div id="templates" class="panel">
  <div class="panel-head">
    <div>
      <h2>Message templates</h2>
      <p class="muted" style="margin:4px 0 0">Automation rules still use internal templates. Job Send SMS uses imported ServiceM8 SMS templates.</p>
    </div>
    <div class="row-actions">
      <button type="button" id="toggleImportedTemplates" class="secondary">Show imported templates</button>
      <button type="button" id="addImportedTemplate" class="secondary">+ Add ServiceM8 template</button>
      <button type="button" id="toggleLocalTemplates" class="secondary">Show internal templates</button>
    </div>
  </div>
  <div class="card" id="importedTemplatesCard" style="display:none">
    <div class="table-wrap" style="padding:0">
      <table>
        <thead>
          <tr><th>Name</th><th>Message preview</th></tr>
        </thead>
        <tbody id="importedTemplateList"></tbody>
      </table>
    </div>
  </div>
  <div class="card table-wrap" id="localTemplatesCard" style="padding:0;display:none">
    <table>
      <thead>
        <tr><th>Name</th><th>Message preview</th><th></th></tr>
      </thead>
      <tbody id="templateList"></tbody>
    </table>
  </div>
  <div class="actions">
    <button type="button" id="saveTemplates" style="display:none">Save templates</button>
    <span id="templatesToast" class="toast"></span>
  </div>
</div>

<div id="pending" class="panel">
  <div class="panel-head">
    <div>
      <h2>Pending scheduled sends</h2>
      <p class="muted" style="margin:4px 0 0">Follow-ups waiting to fire. Cancel if the job should not be texted.</p>
    </div>
    <button type="button" id="refreshPending" class="secondary sm">Refresh</button>
  </div>
  <div class="card table-wrap" style="padding:0">
    <table><thead><tr><th>Fire at (UTC)</th><th>Job</th><th>Automation</th><th>Badge</th><th></th></tr></thead>
    <tbody id="pendingList"></tbody></table>
  </div>
</div>

<div id="log" class="panel">
  <div class="panel-head">
    <div><h2>Outbound log</h2></div>
    <button type="button" id="refreshLog" class="secondary sm">Refresh</button>
  </div>
  <div class="card table-wrap" style="padding:0">
    <table><thead><tr><th>When</th><th>To</th><th>Status</th><th>Automation</th><th>Badge</th><th>Detail</th><th>Body</th></tr></thead>
    <tbody id="logList">${outbound.map((m) => {
      const detail = String(m.provider_response ?? "").trim();
      const detailShort = detail ? (detail.length > 80 ? detail.slice(0, 80) + "…" : detail) : (m.status === "failed" ? "No error recorded" : "");
      return `<tr><td>${esc(String(m.created_at))}</td><td>${esc(String(m.to_number))}</td><td>${esc(statusLabelText(String(m.status)))}</td><td>${esc(String(m.rule_name ?? ""))}</td><td>${esc(String(m.badge_name ?? ""))}</td><td class="muted" title="${esc(detail)}">${esc(detailShort)}</td><td>${esc(String(m.body).slice(0, 80))}</td></tr>`;
    }).join("") || '<tr><td colspan="7" class="empty">No outbound messages yet</td></tr>'}</tbody></table>
  </div>
</div>

<div id="inbox" class="panel">
  <div class="panel-head">
    <div>
      <h2>Inbox</h2>
      <p class="muted" style="margin:4px 0 0">Numbers on the left · reply from the thread on the right</p>
    </div>
    <button type="button" id="refreshInbox" class="secondary sm">Refresh</button>
  </div>
  <div class="card inbox-layout" style="padding:0">
    <div class="inbox-numbers" id="inboxNumbers"></div>
    <div class="inbox-thread" id="inboxThread">
      <div class="empty">Select a number to view the conversation</div>
    </div>
  </div>
</div>

<div id="analytics" class="panel">
  <div class="card">
    <p>Sent last 7 days: <strong id="analyticsSent7d">${sent7d}</strong></p>
    <p>Inbound stored: <strong id="analyticsInbound">${inbound.length}</strong> (latest page)</p>
  </div>
</div>

<div id="settings" class="panel">
  <div class="card">
    <h3 style="margin:0 0 8px;font-size:15px">Test / UAT mode</h3>
    <label><input type="checkbox" id="uatEnabled"${uatEnabled ? " checked" : ""} style="width:auto;margin-right:8px" /> Redirect all SMS to a test mobile</label>
    <label>Redirect number</label>
    <input id="uatRedirectNumber" value="${esc(uatRedirect)}" placeholder="04xx xxx xxx" />
    <p class="hint">When on, every automation and Send SMS goes to this number (with a TEST prefix). Save takes effect on the next send — no server restart.</p>
    <div class="row-actions" style="margin:0 0 16px">
      <button type="button" class="secondary" id="testUatRedirect">Send UAT test SMS</button>
    </div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0" />
    <label>En-route status labels (comma-separated)</label>
    <input id="enRouteStatuses" value="${esc(enRoute)}" />
    <label>Duplicate send cooldown (minutes)</label>
    <input id="automationCooldownMinutes" value="${esc(automationCooldown)}" />
    <label><input type="checkbox" id="quietHoursEnabled"${quietHoursEnabled ? " checked" : ""} style="width:auto;margin-right:8px" /> Block automation during quiet hours</label>
    <div class="row-actions" style="align-items:flex-end;margin:8px 0 12px">
      <div style="flex:1">
        <label>Quiet hours start (0-23, Melbourne time)</label>
        <input id="quietHoursStart" value="${esc(quietHoursStart)}" />
      </div>
      <div style="flex:1">
        <label>Quiet hours end (0-23, Melbourne time)</label>
        <input id="quietHoursEnd" value="${esc(quietHoursEnd)}" />
      </div>
    </div>
    <label>Automation exclusion keywords (comma-separated)</label>
    <input id="automationExclusionKeywords" value="${esc(exclusionKeywords)}" />
    <p class="hint">If any of these keywords appear in the customer, site, category, description, or address, automation will not text the customer.</p>
    <div class="actions" style="margin-top:0;padding-top:0;border-top:none">
      <button type="button" id="saveSettings">Save settings</button>
      <button type="button" class="secondary" id="testYeastar">Test Yeastar</button>
    </div>
    <p><a href="${esc(env.appUrl)}/oauth/activate?account_uuid=${encodeURIComponent(accountUuid)}" target="_blank">Reconnect OAuth</a></p>
    <pre id="settingsOut" class="muted"></pre>
  </div>
</div>

<div id="templateModal" class="modal-backdrop" aria-hidden="true">
  <div class="modal" role="dialog" aria-labelledby="templateModalTitle">
    <h3 id="templateModalTitle">Add template</h3>
    <label for="modalTplName">Template name</label>
    <input type="text" id="modalTplName" placeholder="e.g. job_created" />
    <p class="hint">Short ID — letters, numbers, underscores</p>
    <label for="modalTplBody">Message</label>
    <div class="chips" id="modalTplChips"></div>
    <textarea id="modalTplBody" rows="5" placeholder="Hi {{customerName}}, ..."></textarea>
    <label>Live preview</label>
    <div class="preview-box" id="modalTplPreview"><strong>Sample SMS</strong><span></span></div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="modalTplCancel">Cancel</button>
      <button type="button" id="modalTplSave">Save template</button>
    </div>
  </div>
</div>

<div id="ruleModal" class="modal-backdrop" aria-hidden="true">
  <div class="modal" role="dialog" aria-labelledby="ruleModalTitle">
    <h3 id="ruleModalTitle">Add automation</h3>
    <label for="ruleName">Name</label>
    <input type="text" id="ruleName" placeholder="e.g. Booking confirmed" />
    <label for="ruleTrigger">When</label>
    <select id="ruleTrigger"></select>
    <div id="ruleStatusWrap">
      <label for="ruleStatus">Status becomes</label>
      <input type="text" id="ruleStatus" placeholder="e.g. Quote, Work Order" />
      <p class="hint">Must match the ServiceM8 status label exactly</p>
    </div>
    <div id="ruleBadgeWrap" style="display:none">
      <label>Badges (match any)</label>
      <div id="ruleBadgeList" class="radio-list" style="max-height:160px;overflow:auto;border:1px solid #e5e7eb;border-radius:6px;padding:8px"></div>
      <p class="hint">Pick ServiceM8 badges. Multi-select allowed (e.g. Chase payment + Debt Collection).</p>
    </div>
    <div id="ruleScheduleWrap" style="display:none">
      <label for="ruleScheduleAnchor">Start from</label>
      <select id="ruleScheduleAnchor">
        <option value="badge_added">Badge added</option>
        <option value="completed">Job completed</option>
      </select>
      <div class="row-actions" style="align-items:flex-end;margin:8px 0">
        <div style="flex:1">
          <label for="ruleOffsetValue">Wait</label>
          <input type="number" id="ruleOffsetValue" min="1" value="1" />
        </div>
        <div style="flex:1">
          <label for="ruleOffsetUnit">Unit</label>
          <select id="ruleOffsetUnit">
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
            <option value="months">Months (calendar)</option>
          </select>
        </div>
      </div>
      <p class="hint">Months use Melbourne calendar dates (3 months from 27 Aug → 27 Nov).</p>
    </div>
    <div id="ruleSuppressWrap">
      <label>Suppress if job has badge</label>
      <div id="ruleSuppressList" class="radio-list" style="max-height:120px;overflow:auto;border:1px solid #e5e7eb;border-radius:6px;padding:8px"></div>
      <p class="hint">Optional. Example: Don’t Chase blocks payment-chase automations.</p>
    </div>
    <label for="ruleTemplate">Message</label>
    <select id="ruleTemplate"></select>
    <div class="preview-box" id="rulePreview"><strong>Sample SMS</strong><span></span></div>
    <label>Send to</label>
    <div class="radio-list">
      <label><input type="radio" name="ruleRecipient" value="job_contact" checked /> Customer (job contact)</label>
      <label><input type="radio" name="ruleRecipient" value="company_primary" /> Company primary contact</label>
      <label><input type="radio" name="ruleRecipient" value="custom" /> This number</label>
    </div>
    <div id="ruleCustomWrap" style="display:none">
      <label for="ruleRecipientNumber">Mobile number</label>
      <input type="text" id="ruleRecipientNumber" placeholder="04xx xxx xxx" />
    </div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="ruleModalCancel">Cancel</button>
      <button type="button" id="ruleModalSave">Done</button>
    </div>
  </div>
</div>

<div id="importedTemplateModal" class="modal-backdrop" aria-hidden="true">
  <div class="modal" role="dialog" aria-labelledby="importedTemplateModalTitle">
    <h3 id="importedTemplateModalTitle">Add ServiceM8 template</h3>
    <label for="importedTplName">Template name</label>
    <input type="text" id="importedTplName" placeholder="e.g. Quote follow up" />
    <label for="importedTplBody">Message</label>
    <p class="hint">Empty job fields are left blank in the SMS (tags are not sent). Use the preview to check wording.</p>
    <div class="chips" id="importedTplChips"></div>
    <textarea id="importedTplBody" rows="5" placeholder="Hi {job.contact_first}, ..."></textarea>
    <label>Live preview</label>
    <div class="preview-box" id="importedTplPreview"><strong>Sample SMS</strong><span></span></div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="importedTplCancel">Cancel</button>
      <button type="button" id="importedTplSave">Save template</button>
    </div>
  </div>
</div>


<script>
let client = null;
try { client = SMClient.init(); } catch (e) { console.warn('SMClient', e); }
const accountUuid = ${JSON.stringify(accountUuid)};

const VARS = ['customerName', 'jobNumber', 'status', 'address', 'companyName', 'mobile'];
const SM8_VARS = [
  { label: 'First name', tag: '{job.contact_first}' },
  { label: 'Customer', tag: '{job.contact_name}' },
  { label: 'Last name', tag: '{job.contact_last}' },
  { label: 'Job #', tag: '{job.generated_job_id}' },
  { label: 'Status', tag: '{job.status}' },
  { label: 'Address', tag: '{job.job_address}' },
  { label: 'Service', tag: '{service.name}' },
  { label: 'Description', tag: '{job.description}' },
  { label: 'Company', tag: '{job.company_name}' },
  { label: 'Business', tag: '{vendor.name}' },
];
const TRIGGERS = [
  { value: 'job_created', label: 'Job created' },
  { value: 'status_changed', label: 'Status changed' },
  { value: 'en_route', label: 'Technician en route' },
  { value: 'completed', label: 'Job completed' },
  { value: 'badge_added', label: 'Badge added' },
  { value: 'scheduled', label: 'Scheduled send' },
];
const SAMPLE = {
  customerName: 'Jane Smith',
  jobNumber: 'J-1042',
  status: 'En Route',
  address: '12 Oak St',
  companyName: "Tom's Pest Control",
  mobile: '0412 345 678',
  jobDescription: 'General pest treatment',
  jobCategory: 'Pest control',
};

let templates = ${tplJson};
let importedTemplates = ${importedTplJson};
let rules = ${rulesJson};
let sm8Badges = ${badgesJson};
let pendingRows = ${pendingJson};
const persistedTplIds = new Set(${JSON.stringify(templates.map((t) => t.id))});
let nextTplId = ${maxTplId + 1};
let nextRuleId = ${maxRuleId + 1};
let editingTplId = null;
let editingRuleId = null;
let inboundRows = ${JSON.stringify(
    inbound.map((m) => ({
      received_at: String(m.received_at ?? ""),
      from_number: String(m.from_number ?? ""),
      body: String(m.body ?? ""),
    }))
  )};
let outboundRows = ${JSON.stringify(
    outbound.map((m) => ({
      created_at: String(m.created_at ?? ""),
      to_number: String(m.to_number ?? ""),
      body: String(m.body ?? ""),
      status: String(m.status ?? ""),
      provider_response: String(m.provider_response ?? ""),
      rule_name: String(m.rule_name ?? ""),
      badge_name: String(m.badge_name ?? ""),
      job_uuid: String(m.job_uuid ?? ""),
    }))
  )};
let selectedPhoneKey = null;
let inboxReplySending = false;

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function on(id, type, fn) {
  var el = document.getElementById(id);
  if (el) el.addEventListener(type, fn);
}

function logDetailText(m) {
  var s = String(m.provider_response || '').trim();
  if (!s && m.status === 'failed') return 'No error recorded';
  return s.length > 80 ? s.slice(0, 80) + '…' : s;
}

function statusLabel(s) {
  var map = {
    submitted: 'Submitted',
    sent: 'Submitted',
    dry_run: 'Dry run',
    test_redirected: 'Redirected',
    test_redirected_dry_run: 'Redirected (dry run)',
    blocked_duplicate: 'Blocked duplicate',
    queued: 'Queued',
    blocked_quiet_hours: 'Blocked quiet hours',
    blocked_exclusion: 'Blocked exclusion',
    blocked_suppress_badge: 'Suppressed badge',
    blocked_test_mode: 'Blocked test mode',
    failed: 'Failed'
  };
  return map[s] || s;
}

function renderPreview(body) {
  return body.replace(/\\{\\{(\\w+)\\}\\}/g, (_, k) => SAMPLE[k] ?? '{{' + k + '}}');
}

function snippet(body) {
  const text = renderPreview(body);
  return text.length > 72 ? text.slice(0, 72) + '…' : text;
}

function msgSnippet(body) {
  const text = String(body || '');
  return text.length > 80 ? text.slice(0, 80) + '…' : text;
}

function phoneKey(n) {
  const d = String(n || '').replace(/\\D/g, '');
  return d.length >= 9 ? d.slice(-9) : d;
}

function formatPhoneDisplay(n) {
  const d = String(n || '').replace(/\\D/g, '');
  if (d.length === 10) return d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7);
  if (d.length === 11 && d.startsWith('61')) return '0' + d.slice(2, 5) + ' ' + d.slice(5, 8) + ' ' + d.slice(8);
  return String(n || '');
}

function tidySmsWhitespace(text) {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function renderImportedPreview(body) {
  const parts = String(SAMPLE.customerName || '').trim().split(/\\s+/);
  const first = parts[0] || '';
  const last = parts.slice(1).join(' ');
  const sm8 = {
    'job.contact_first': first,
    'job.contact_last': last,
    'job.contact_name': SAMPLE.customerName,
    'job.generated_job_id': SAMPLE.jobNumber,
    'job.status': SAMPLE.status,
    'job.job_address': SAMPLE.address,
    'job.address': SAMPLE.address,
    'job.description': SAMPLE.jobDescription,
    'job.category': SAMPLE.jobCategory,
    'service.name': SAMPLE.jobDescription,
    'vendor.name': SAMPLE.companyName,
    'company.name': SAMPLE.customerName,
  };
  const out = String(body).replace(/\\{([a-z0-9_.]+)\\}/gi, (_, k) => sm8[k.toLowerCase()] ?? '');
  return tidySmsWhitespace(out);
}

function showToast(id, msg, err) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (err ? ' err' : '');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function parseInvoke(res) {
  if (res == null) return {};
  if (typeof res === 'string') {
    try { return JSON.parse(res); } catch (e) { return { error: res }; }
  }
  return res;
}

function applyDashboardData(data) {
  if (Array.isArray(data.templates)) {
    templates = data.templates;
    persistedTplIds.clear();
    templates.forEach((t) => persistedTplIds.add(t.id));
    nextTplId = templates.reduce((m, t) => Math.max(m, t.id), 0) + 1;
    renderTemplates();
    renderRules();
  }
  if (Array.isArray(data.rules)) {
    rules = data.rules;
    nextRuleId = rules.reduce((m, t) => Math.max(m, t.id), 0) + 1;
    renderRules();
  }
  if (Array.isArray(data.importedTemplates)) {
    importedTemplates = data.importedTemplates;
    renderImportedTemplates();
  }
  if (Array.isArray(data.badges)) sm8Badges = data.badges;
  if (Array.isArray(data.pending)) {
    pendingRows = data.pending;
    renderPending();
  }
  if (Array.isArray(data.outbound)) {
    outboundRows = data.outbound;
    renderLog(data.outbound);
  }
  if (Array.isArray(data.inbound)) inboundRows = data.inbound;
  if (Array.isArray(data.outbound) || Array.isArray(data.inbound)) renderInbox();
  if (typeof data.sent7d === 'number') {
    document.getElementById('statSent7d').textContent = String(data.sent7d);
    document.getElementById('analyticsSent7d').textContent = String(data.sent7d);
    const inboundCount = Array.isArray(data.inbound) ? data.inbound.length : inboundRows.length;
    document.getElementById('analyticsInbound').textContent = String(inboundCount);
  }
  if (data.uat) updateUatBanner(data.uat);
}

function updateUatBanner(uat) {
  const el = document.getElementById('uatBanner');
  if (!el) return;
  if (uat.enabled && uat.mobile) {
    el.innerHTML = '<span style="background:#fef3c7;border:1px solid #fcd34d;padding:8px 12px;border-radius:6px;font-size:13px;color:#92400e;display:inline-block">UAT mode: mobile → ' + escHtml(uat.mobile) + '</span>';
  } else if (uat.enabled) {
    el.innerHTML = '<span style="background:#fef3c7;border:1px solid #fcd34d;padding:8px 12px;border-radius:6px;font-size:13px;color:#92400e;display:inline-block">UAT on — set a redirect number</span>';
  } else {
    el.innerHTML = '<span style="background:#ecfdf5;border:1px solid #a7f3d0;padding:8px 12px;border-radius:6px;font-size:13px;color:#065f46;display:inline-block">Live mode — messages go to customers</span>';
  }
}

async function refreshDashboardData() {
  if (!client) return;
  try {
    const res = parseInvoke(await invoke('sms_dashboard_data', {}));
    if (res.ok !== true) {
      if (res.error) showToast('templatesToast', String(res.error), true);
      return;
    }
    applyDashboardData(res);
  } catch (e) {
    showToast('templatesToast', String(e), true);
  }
}

function renderLog(rows) {
  const el = document.getElementById('logList');
  if (!rows.length) {
    el.innerHTML = '<tr><td colspan="7" class="empty">No outbound messages yet</td></tr>';
    return;
  }
  el.innerHTML = rows.map((m) =>
    '<tr><td>' + escHtml(m.created_at) + '</td><td>' + escHtml(m.to_number) + '</td><td>' + escHtml(statusLabel(m.status)) +
    '</td><td>' + escHtml(m.rule_name || '') + '</td><td>' + escHtml(m.badge_name || '') +
    '</td><td class="muted" title="' + escHtml(String(m.provider_response || '')) + '">' + escHtml(logDetailText(m)) +
    '</td><td>' + escHtml(String(m.body).slice(0, 80)) + '</td></tr>'
  ).join('');
}

function renderPending() {
  const el = document.getElementById('pendingList');
  if (!el) return;
  if (!pendingRows.length) {
    el.innerHTML = '<tr><td colspan="5" class="empty">No pending scheduled sends</td></tr>';
    return;
  }
  el.innerHTML = pendingRows.map((p) =>
    '<tr><td>' + escHtml(p.fire_at) + '</td><td>' + escHtml(String(p.job_uuid || '').slice(0, 8)) + '…</td><td>' +
    escHtml(p.rule_name || '') + '</td><td>' + escHtml(p.badge_name || '') +
    '</td><td><button type="button" class="danger sm cancel-pending" data-id="' + p.id + '">Cancel</button></td></tr>'
  ).join('');
  el.querySelectorAll('.cancel-pending').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-id'));
      try {
        const res = parseInvoke(await invoke('sms_dashboard_save', { section: 'cancel_scheduled', id }));
        if (res && res.ok) {
          pendingRows = pendingRows.filter((p) => p.id !== id);
          renderPending();
        } else {
          alert(JSON.stringify(res));
        }
      } catch (e) {
        alert(String(e));
      }
    });
  });
}

function buildConversations() {
  const map = new Map();
  const touch = (number, body, at, dir) => {
    const key = phoneKey(number);
    if (!key) return;
    const prev = map.get(key);
    if (!prev || String(at) > String(prev.last_at)) {
      map.set(key, { key, number: String(number || ''), last_body: String(body || ''), last_at: String(at || ''), last_dir: dir });
    } else if (prev && String(number || '').length > String(prev.number || '').length) {
      prev.number = String(number || '');
    }
  };
  for (const m of outboundRows) touch(m.to_number, m.body, m.created_at, 'out');
  for (const m of inboundRows) touch(m.from_number, m.body, m.received_at, 'in');
  return Array.from(map.values()).sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)));
}

function messagesForKey(key) {
  const msgs = [];
  for (const m of outboundRows) {
    if (phoneKey(m.to_number) === key) {
      msgs.push({ dir: 'out', body: String(m.body || ''), at: String(m.created_at || ''), number: String(m.to_number || '') });
    }
  }
  for (const m of inboundRows) {
    if (phoneKey(m.from_number) === key) {
      msgs.push({ dir: 'in', body: String(m.body || ''), at: String(m.received_at || ''), number: String(m.from_number || '') });
    }
  }
  msgs.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return msgs;
}

function formatInboxTime(at) {
  const s = String(at || '');
  if (!s) return '';
  const d = new Date(s.includes('T') || s.includes('Z') || s.includes('-') ? s : s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return s.slice(0, 16);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return t;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + t;
}

function jobUuidForPhoneKey(key) {
  for (const m of outboundRows) {
    if (phoneKey(m.to_number) !== key) continue;
    const id = String(m.job_uuid || '').trim();
    if (id) return id;
  }
  return '';
}

function inboxReplyBar(toNumber) {
  return '<div class="inbox-reply">' +
    '<div class="inbox-reply-row">' +
    '<textarea id="inboxReplyText" rows="2" maxlength="612" placeholder="Type a reply…"></textarea>' +
    '<button type="button" id="inboxReplySend"' + (inboxReplySending ? ' disabled' : '') + '>Send</button>' +
    '</div>' +
    '<p class="hint">Enter to send · Shift+Enter for new line</p>' +
    '</div>';
}

function bindInboxReply(key, toNumber) {
  const input = document.getElementById('inboxReplyText');
  const btn = document.getElementById('inboxReplySend');
  if (!input || !btn) return;
  const send = async () => {
    const message = input.value.trim();
    if (!message || inboxReplySending) return;
    inboxReplySending = true;
    btn.disabled = true;
    try {
      const payload = { to_number: toNumber, message };
      const jobUuid = jobUuidForPhoneKey(key);
      if (jobUuid) payload.job_uuid = jobUuid;
      const res = parseInvoke(await invoke('sms_inbox_reply', payload));
      if (res && res.ok !== false) {
        input.value = '';
        await refreshDashboardData();
        selectedPhoneKey = key;
        renderInbox();
      } else {
        alert(res.error || JSON.stringify(res));
      }
    } catch (e) {
      alert(String(e));
    } finally {
      inboxReplySending = false;
      if (btn) btn.disabled = false;
    }
  };
  btn.addEventListener('click', () => { void send(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  });
  input.focus();
}

function renderInboxThread(key) {
  const el = document.getElementById('inboxThread');
  if (!el) return;
  if (!key) {
    el.innerHTML = '<div class="inbox-thread-empty empty">Select a number to view the conversation</div>';
    return;
  }
  const conversations = buildConversations();
  const conv = conversations.find((c) => c.key === key);
  const toNumber = conv ? conv.number : key;
  const msgs = messagesForKey(key);
  const header =
    '<div class="inbox-thread-head">' +
    '<div>' +
    '<strong>' + escHtml(formatPhoneDisplay(toNumber)) + '</strong>' +
    '<span class="muted">' + msgs.length + ' message' + (msgs.length === 1 ? '' : 's') + '</span>' +
    '</div></div>';
  const listHtml = msgs.length
    ? '<div class="inbox-thread-list" id="inboxThreadList">' + msgs.map((m) =>
      '<div class="msg ' + m.dir + '">' +
      '<div class="msg-bubble">' + escHtml(m.body) + '</div>' +
      '<div class="msg-meta">' + (m.dir === 'out' ? 'Sent' : 'Received') + ' · ' + escHtml(formatInboxTime(m.at)) + '</div>' +
      '</div>'
    ).join('') + '</div>'
    : '<div class="inbox-thread-empty empty">No messages yet — send a reply below</div>';
  el.innerHTML = header + listHtml + inboxReplyBar(toNumber);
  const list = document.getElementById('inboxThreadList');
  if (list) {
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }
  bindInboxReply(key, toNumber);
}

function renderInbox() {
  const listEl = document.getElementById('inboxNumbers');
  if (!listEl) return;
  const conversations = buildConversations();
  if (!conversations.length) {
    listEl.innerHTML = '<div class="empty">No conversations yet</div>';
    selectedPhoneKey = null;
    renderInboxThread(null);
    return;
  }
  if (!selectedPhoneKey || !conversations.some((c) => c.key === selectedPhoneKey)) {
    selectedPhoneKey = conversations[0].key;
  }
  listEl.innerHTML = '<div class="inbox-numbers-head">Conversations</div>' + conversations.map((c) =>
    '<button type="button" class="inbox-number' + (c.key === selectedPhoneKey ? ' active' : '') + '" data-key="' + escHtml(c.key) + '">' +
    '<div class="inbox-number-top">' +
    '<strong>' + escHtml(formatPhoneDisplay(c.number)) + '</strong>' +
    '<span class="inbox-number-time">' + escHtml(formatInboxTime(c.last_at)) + '</span>' +
    '</div>' +
    '<div class="inbox-number-preview">' +
    '<span class="inbox-dir ' + c.last_dir + '">' + (c.last_dir === 'out' ? 'You' : 'Them') + '</span>' +
    '<span class="inbox-number-body">' + escHtml(msgSnippet(c.last_body)) + '</span>' +
    '</div>' +
    '</button>'
  ).join('');
  listEl.querySelectorAll('.inbox-number').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedPhoneKey = btn.dataset.key;
      renderInbox();
    });
  });
  renderInboxThread(selectedPhoneKey);
}

function bindTabs() {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById(btn.dataset.tab);
    if (panel) panel.classList.add('active');
  });
}

function invoke(event, args) {
  if (!client) throw new Error('ServiceM8 SDK not available');
  return client.invoke(event, Object.assign({ account_uuid: accountUuid }, args || {}));
}

function templateOptions(selected) {
  return templates.map((t) =>
    '<option value="' + t.id + '"' + (t.id === selected ? ' selected' : '') + '>' + escHtml(t.name) + '</option>'
  ).join('');
}

function recipientLabel(r) {
  if (r.recipient_type === 'company_primary') return 'the company primary contact';
  if (r.recipient_type === 'custom') return r.recipient_number ? r.recipient_number : 'a custom number';
  return 'the customer';
}

function whenLabel(r) {
  if (r.trigger_type === 'status_changed') {
    return r.status_match ? 'When status becomes ' + r.status_match : 'When the job status changes';
  }
  if (r.trigger_type === 'en_route') return 'When the technician is en route';
  if (r.trigger_type === 'completed') return 'When a job is completed';
  if (r.trigger_type === 'badge_added') {
    const names = parseBadges(r.badge_json).map((b) => b.name).filter(Boolean);
    return names.length ? 'When badge added: ' + names.join(', ') : 'When a selected badge is added';
  }
  if (r.trigger_type === 'scheduled') {
    const n = r.schedule_offset_value || '?';
    const u = r.schedule_offset_unit || 'days';
    const anchor = r.schedule_anchor === 'completed' ? 'job completed' : 'badge added';
    const names = parseBadges(r.badge_json).map((b) => b.name).filter(Boolean);
    const badgeBit = r.schedule_anchor === 'completed' ? '' : (names.length ? ' (' + names.join(', ') + ')' : '');
    return 'Scheduled ' + n + ' ' + u + ' after ' + anchor + badgeBit;
  }
  return 'When a job is created';
}

function ruleSummary(r) {
  const tpl = templates.find((t) => t.id === r.template_id);
  const msg = tpl ? tpl.name : 'template';
  const suppress = parseBadges(r.suppress_badge_json).map((b) => b.name).filter(Boolean);
  const base = whenLabel(r) + ' → send “' + msg + '” to ' + recipientLabel(r);
  return suppress.length ? base + ' (suppress: ' + suppress.join(', ') + ')' : base;
}

function statusMatchEnabled(trigger) {
  return trigger === 'status_changed';
}

function badgeMatchEnabled(trigger) {
  return trigger === 'badge_added' || trigger === 'scheduled';
}

function scheduleEnabled(trigger) {
  return trigger === 'scheduled';
}

function parseBadges(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function selectedBadgeJson(listId) {
  const root = document.getElementById(listId);
  if (!root) return '[]';
  const out = [];
  root.querySelectorAll('input[type="checkbox"]:checked').forEach((el) => {
    out.push({ uuid: el.value, name: el.getAttribute('data-name') || el.value });
  });
  return JSON.stringify(out);
}

function fillBadgeCheckboxes(listId, selectedJson) {
  const root = document.getElementById(listId);
  if (!root) return;
  const selected = new Set(parseBadges(selectedJson).map((b) => String(b.uuid || '').toLowerCase()));
  if (!sm8Badges.length) {
    root.innerHTML = '<p class="muted" style="margin:0">No badges loaded — reconnect OAuth if this persists.</p>';
    return;
  }
  root.innerHTML = sm8Badges.map((b) =>
    '<label style="display:block"><input type="checkbox" value="' + escHtml(b.uuid) + '" data-name="' + escHtml(b.name) + '"' +
    (selected.has(String(b.uuid).toLowerCase()) ? ' checked' : '') + ' style="width:auto;margin-right:8px" />' +
    escHtml(b.name) + '</label>'
  ).join('');
}

function selectedRecipientType() {
  const el = document.querySelector('input[name="ruleRecipient"]:checked');
  return el ? el.value : 'job_contact';
}

function syncRuleModalFields() {
  const trigger = document.getElementById('ruleTrigger').value;
  const statusWrap = document.getElementById('ruleStatusWrap');
  const badgeWrap = document.getElementById('ruleBadgeWrap');
  const scheduleWrap = document.getElementById('ruleScheduleWrap');
  const customWrap = document.getElementById('ruleCustomWrap');
  if (statusWrap) statusWrap.style.display = statusMatchEnabled(trigger) ? 'block' : 'none';
  if (badgeWrap) {
    const showBadge = badgeMatchEnabled(trigger) && !(trigger === 'scheduled' && document.getElementById('ruleScheduleAnchor').value === 'completed');
    badgeWrap.style.display = showBadge ? 'block' : 'none';
  }
  if (scheduleWrap) scheduleWrap.style.display = scheduleEnabled(trigger) ? 'block' : 'none';
  if (customWrap) customWrap.style.display = selectedRecipientType() === 'custom' ? 'block' : 'none';
  const tpl = templates.find((t) => t.id === Number(document.getElementById('ruleTemplate').value));
  const preview = document.querySelector('#rulePreview span');
  if (preview) preview.textContent = tpl ? renderPreview(tpl.body) : '';
}

function openRuleModal(id) {
  editingRuleId = id == null ? null : id;
  const rule = id == null ? null : rules.find((r) => r.id === id);
  document.getElementById('ruleModalTitle').textContent = rule ? 'Edit automation' : 'Add automation';
  document.getElementById('ruleName').value = rule ? rule.name : '';
  const triggerEl = document.getElementById('ruleTrigger');
  triggerEl.innerHTML = TRIGGERS.map((t) =>
    '<option value="' + t.value + '"' + (rule && t.value === rule.trigger_type ? ' selected' : '') + '>' + t.label + '</option>'
  ).join('');
  document.getElementById('ruleStatus').value = rule ? (rule.status_match || '') : '';
  document.getElementById('ruleTemplate').innerHTML = templateOptions(rule ? rule.template_id : (templates[0] && templates[0].id));
  document.getElementById('ruleScheduleAnchor').value = rule && rule.schedule_anchor ? rule.schedule_anchor : 'badge_added';
  document.getElementById('ruleOffsetValue').value = rule && rule.schedule_offset_value ? rule.schedule_offset_value : 1;
  document.getElementById('ruleOffsetUnit').value = rule && rule.schedule_offset_unit ? rule.schedule_offset_unit : 'days';
  fillBadgeCheckboxes('ruleBadgeList', rule ? rule.badge_json : '[]');
  fillBadgeCheckboxes('ruleSuppressList', rule ? rule.suppress_badge_json : '[]');
  const type = rule && rule.recipient_type ? rule.recipient_type : 'job_contact';
  document.querySelectorAll('input[name="ruleRecipient"]').forEach((el) => {
    el.checked = el.value === type;
  });
  document.getElementById('ruleRecipientNumber').value = rule ? (rule.recipient_number || '') : '';
  syncRuleModalFields();
  const modal = document.getElementById('ruleModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('ruleName').focus();
}

function closeRuleModal() {
  document.getElementById('ruleModal').classList.remove('open');
  document.getElementById('ruleModal').setAttribute('aria-hidden', 'true');
  editingRuleId = null;
}

function applyRuleModal() {
  const name = document.getElementById('ruleName').value.trim();
  if (!name) { alert('Please enter a name.'); return false; }
  const trigger_type = document.getElementById('ruleTrigger').value;
  const recipient_type = selectedRecipientType();
  const recipient_number = document.getElementById('ruleRecipientNumber').value.trim();
  if (recipient_type === 'custom' && !recipient_number.replace(/\\s+/g, '')) {
    alert('Enter a mobile number, or choose customer / company contact.');
    return false;
  }
  const badge_json = badgeMatchEnabled(trigger_type) && !(trigger_type === 'scheduled' && document.getElementById('ruleScheduleAnchor').value === 'completed')
    ? selectedBadgeJson('ruleBadgeList')
    : '[]';
  if ((trigger_type === 'badge_added' || (trigger_type === 'scheduled' && document.getElementById('ruleScheduleAnchor').value === 'badge_added')) && parseBadges(badge_json).length === 0) {
    alert('Select at least one badge.');
    return false;
  }
  const schedule_offset_value = scheduleEnabled(trigger_type) ? Number(document.getElementById('ruleOffsetValue').value) || 0 : null;
  if (scheduleEnabled(trigger_type) && schedule_offset_value < 1) {
    alert('Enter a wait of at least 1.');
    return false;
  }
  const payload = {
    name,
    trigger_type,
    status_match: statusMatchEnabled(trigger_type) ? document.getElementById('ruleStatus').value.trim() : '',
    template_id: Number(document.getElementById('ruleTemplate').value) || (templates[0] && templates[0].id) || 1,
    recipient_type,
    recipient_number: recipient_type === 'custom' ? recipient_number : '',
    badge_json,
    suppress_badge_json: selectedBadgeJson('ruleSuppressList'),
    schedule_offset_value,
    schedule_offset_unit: scheduleEnabled(trigger_type) ? document.getElementById('ruleOffsetUnit').value : '',
    schedule_anchor: scheduleEnabled(trigger_type) ? document.getElementById('ruleScheduleAnchor').value : '',
  };
  if (editingRuleId == null) {
    rules.push({ id: nextRuleId++, enabled: true, ...payload });
  } else {
    const rule = rules.find((r) => r.id === editingRuleId);
    if (rule) Object.assign(rule, payload);
  }
  closeRuleModal();
  renderRules();
  return true;
}

function setupRuleModal() {
  const modal = document.getElementById('ruleModal');
  if (!modal) return;
  on('ruleTrigger', 'change', syncRuleModalFields);
  on('ruleScheduleAnchor', 'change', syncRuleModalFields);
  on('ruleTemplate', 'change', syncRuleModalFields);
  modal.querySelectorAll('input[name="ruleRecipient"]').forEach((el) => {
    el.addEventListener('change', syncRuleModalFields);
  });
  on('ruleModalCancel', 'click', closeRuleModal);
  on('ruleModalSave', 'click', applyRuleModal);
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'ruleModal') closeRuleModal();
  });
}

function renderRules() {
  const el = document.getElementById('ruleList');
  if (!el) return;
  if (!rules.length) {
    el.innerHTML = '<div class="card empty">No automations — click <strong>+ Add automation</strong></div>';
    return;
  }
  el.innerHTML = rules.map((r) =>
    '<div class="rule-card' + (r.enabled ? '' : ' off') + '" data-rule-id="' + r.id + '">' +
    '<div class="rule-card-top">' +
    '<strong>' + escHtml(r.name) + '</strong>' +
    '<label class="rule-toggle"><input type="checkbox" class="rule-enabled"' + (r.enabled ? ' checked' : '') + ' /> On</label>' +
    '</div>' +
    '<p class="muted">' + escHtml(ruleSummary(r)) + '</p>' +
    '<div class="row-actions">' +
    '<button type="button" class="secondary sm edit-rule">Edit</button>' +
    '<button type="button" class="danger sm remove-rule">Remove</button>' +
    '</div></div>'
  ).join('');
  el.querySelectorAll('.rule-card').forEach((card) => {
    const id = Number(card.dataset.ruleId);
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    card.querySelector('.rule-enabled').addEventListener('change', (e) => {
      rule.enabled = e.target.checked;
      card.classList.toggle('off', !rule.enabled);
    });
    card.querySelector('.edit-rule').addEventListener('click', () => openRuleModal(id));
    card.querySelector('.remove-rule').addEventListener('click', () => {
      rules = rules.filter((r) => r.id !== id);
      renderRules();
    });
  });
}

function renderTemplates() {
  const el = document.getElementById('templateList');
  if (!templates.length) {
    el.innerHTML = '<tr><td colspan="3" class="empty">No templates — click <strong>+ Add template</strong></td></tr>';
    return;
  }
  el.innerHTML = templates.map((t) =>
    '<tr data-tpl-id="' + t.id + '">' +
    '<td><strong>' + escHtml(t.name) + '</strong></td>' +
    '<td class="tpl-snippet" title="' + escHtml(renderPreview(t.body)) + '">' + escHtml(snippet(t.body)) + '</td>' +
    '<td><div class="row-actions">' +
    '<button type="button" class="secondary sm edit-tpl" data-id="' + t.id + '">Edit</button>' +
    '<button type="button" class="danger sm delete-tpl" data-id="' + t.id + '"' + (templates.length <= 1 ? ' disabled' : '') + '>Delete</button>' +
    '</div></td></tr>'
  ).join('');
  el.querySelectorAll('.edit-tpl').forEach((btn) => {
    btn.addEventListener('click', () => openTemplateModal(Number(btn.dataset.id)));
  });
  el.querySelectorAll('.delete-tpl').forEach((btn) => {
    btn.addEventListener('click', () => deleteTemplate(Number(btn.dataset.id)));
  });
}

function renderImportedTemplates() {
  const el = document.getElementById('importedTemplateList');
  if (!importedTemplates.length) {
    el.innerHTML = '<tr><td colspan="2" class="empty">No imported ServiceM8 templates found</td></tr>';
    return;
  }
  el.innerHTML = importedTemplates.map((t) =>
    '<tr>' +
    '<td><strong>' + escHtml(t.name) + '</strong></td>' +
    '<td class="tpl-snippet" title="' + escHtml(renderImportedPreview(t.body)) + '">' + escHtml(renderImportedPreview(t.body)) + '</td>' +
    '</tr>'
  ).join('');
}

function openTemplateModal(id) {
  editingTplId = id ?? null;
  const modal = document.getElementById('templateModal');
  const title = document.getElementById('templateModalTitle');
  const nameInput = document.getElementById('modalTplName');
  const bodyInput = document.getElementById('modalTplBody');
  const previewSpan = document.querySelector('#modalTplPreview span');
  if (editingTplId) {
    const t = templates.find((x) => x.id === editingTplId);
    title.textContent = 'Edit template';
    nameInput.value = t?.name ?? '';
    bodyInput.value = t?.body ?? '';
  } else {
    title.textContent = 'Add template';
    nameInput.value = '';
    bodyInput.value = 'Hi {{customerName}}, ';
  }
  previewSpan.textContent = renderPreview(bodyInput.value);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  nameInput.focus();
}

function closeTemplateModal() {
  document.getElementById('templateModal').classList.remove('open');
  document.getElementById('templateModal').setAttribute('aria-hidden', 'true');
  editingTplId = null;
}

function updateModalPreview() {
  document.querySelector('#modalTplPreview span').textContent =
    renderPreview(document.getElementById('modalTplBody').value);
}

function setupTemplateModal() {
  const chipsEl = document.getElementById('modalTplChips');
  const bodyEl = document.getElementById('modalTplBody');
  const cancelEl = document.getElementById('modalTplCancel');
  const saveEl = document.getElementById('modalTplSave');
  const modalEl = document.getElementById('templateModal');
  if (!chipsEl || !bodyEl || !cancelEl || !saveEl || !modalEl) return;
  chipsEl.innerHTML = VARS.map((v) => '<span class="chip" data-var="' + v + '">{{' + v + '}}</span>').join('');
  chipsEl.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const v = '{{' + chip.dataset.var + '}}';
      const start = bodyEl.selectionStart ?? bodyEl.value.length;
      const end = bodyEl.selectionEnd ?? start;
      bodyEl.value = bodyEl.value.slice(0, start) + v + bodyEl.value.slice(end);
      bodyEl.focus();
      bodyEl.setSelectionRange(start + v.length, start + v.length);
      updateModalPreview();
    });
  });
  bodyEl.addEventListener('input', updateModalPreview);
  cancelEl.addEventListener('click', closeTemplateModal);
  modalEl.addEventListener('click', (e) => {
    if (e.target.id === 'templateModal') closeTemplateModal();
  });
  saveEl.addEventListener('click', () => {
    const name = document.getElementById('modalTplName').value.trim();
    const body = document.getElementById('modalTplBody').value.trim();
    if (!name) { alert('Please enter a template name.'); return; }
    if (!body) { alert('Please enter a message.'); return; }
    if (editingTplId) {
      const t = templates.find((x) => x.id === editingTplId);
      if (t) { t.name = name; t.body = body; }
    } else {
      templates.push({ id: nextTplId++, name, body });
    }
    closeTemplateModal();
    renderTemplates();
    renderRules();
  });
}

function updateImportedModalPreview() {
  document.querySelector('#importedTplPreview span').textContent =
    renderImportedPreview(document.getElementById('importedTplBody').value);
}

function setupImportedTemplateModal() {
  const modal = document.getElementById('importedTemplateModal');
  const addBtn = document.getElementById('addImportedTemplate');
  const cancelBtn = document.getElementById('importedTplCancel');
  const bodyEl = document.getElementById('importedTplBody');
  const chipsEl = document.getElementById('importedTplChips');
  const saveBtn = document.getElementById('importedTplSave');
  if (!modal || !addBtn || !cancelBtn || !bodyEl || !saveBtn) return;
  if (chipsEl) {
    chipsEl.innerHTML = SM8_VARS.map((v) =>
      '<span class="chip" data-tag="' + escHtml(v.tag) + '">' + escHtml(v.label) + '</span>'
    ).join('');
    chipsEl.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag || '';
        const start = bodyEl.selectionStart != null ? bodyEl.selectionStart : bodyEl.value.length;
        const end = bodyEl.selectionEnd != null ? bodyEl.selectionEnd : start;
        bodyEl.value = bodyEl.value.slice(0, start) + tag + bodyEl.value.slice(end);
        bodyEl.focus();
        bodyEl.setSelectionRange(start + tag.length, start + tag.length);
        updateImportedModalPreview();
      });
    });
  }
  addBtn.addEventListener('click', () => {
    document.getElementById('importedTplName').value = '';
    document.getElementById('importedTplBody').value = 'Hi {job.contact_first}, ';
    updateImportedModalPreview();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('importedTplName').focus();
  });
  cancelBtn.addEventListener('click', () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  });
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'importedTemplateModal') {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  });
  bodyEl.addEventListener('input', updateImportedModalPreview);
  saveBtn.addEventListener('click', async () => {
    const name = document.getElementById('importedTplName').value.trim();
    const body = document.getElementById('importedTplBody').value.trim();
    if (!name || !body) {
      showToast('templatesToast', 'Name and message are required', true);
      return;
    }
    try {
      const res = parseInvoke(await invoke('sms_dashboard_save', { section: 'imported_templates', templates: [{ name, body }] }));
      if (res && res.ok !== false) {
        if (Array.isArray(res.importedTemplates)) {
          importedTemplates = res.importedTemplates;
          renderImportedTemplates();
        } else {
          await refreshDashboardData();
        }
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        document.getElementById('importedTemplatesCard').style.display = 'block';
        document.getElementById('toggleImportedTemplates').textContent = 'Hide imported templates';
        showToast('templatesToast', 'ServiceM8 template added');
      } else {
        showToast('templatesToast', JSON.stringify(res), true);
      }
    } catch (e) {
      showToast('templatesToast', String(e), true);
    }
  });
}

function deleteTemplate(id) {
  if (templates.length <= 1) { alert('Keep at least one template.'); return; }
  const used = rules.some((r) => r.template_id === id);
  const msg = used
    ? 'This template is used by a rule. Delete anyway? Rules using it will switch to the first template.'
    : 'Delete this template?';
  if (!confirm(msg)) return;
  templates = templates.filter((x) => x.id !== id);
  rules.forEach((r) => { if (r.template_id === id) r.template_id = templates[0].id; });
  renderTemplates();
  renderRules();
}

function initDashboard() {
  bindTabs();
  try {
    setupTemplateModal();
    setupImportedTemplateModal();
    setupRuleModal();
    renderTemplates();
    renderImportedTemplates();
    renderRules();
    renderInbox();

    on('toggleImportedTemplates', 'click', () => {
      const card = document.getElementById('importedTemplatesCard');
      const btn = document.getElementById('toggleImportedTemplates');
      if (!card || !btn) return;
      const open = card.style.display !== 'none';
      card.style.display = open ? 'none' : 'block';
      btn.textContent = open ? 'Show imported templates' : 'Hide imported templates';
    });
    on('toggleLocalTemplates', 'click', () => {
      const card = document.getElementById('localTemplatesCard');
      const btn = document.getElementById('toggleLocalTemplates');
      const saveBtn = document.getElementById('saveTemplates');
      if (!card || !btn || !saveBtn) return;
      const open = card.style.display !== 'none';
      card.style.display = open ? 'none' : 'block';
      saveBtn.style.display = open ? 'none' : 'inline-block';
      btn.textContent = open ? 'Show internal templates' : 'Hide internal templates';
    });
    const localCard = document.getElementById('localTemplatesCard');
    if (localCard) localCard.style.display = 'none';

    on('addRule', 'click', () => openRuleModal(null));

    on('saveTemplates', 'click', async () => {
      try {
        const payload = templates.map((t) => ({
          id: persistedTplIds.has(t.id) ? t.id : undefined,
          name: t.name,
          body: t.body,
        }));
        const res = parseInvoke(await invoke('sms_dashboard_save', { section: 'templates', templates: payload }));
        if (res && res.ok !== false) {
          if (Array.isArray(res.templates)) {
            templates = res.templates;
            persistedTplIds.clear();
            templates.forEach((t) => persistedTplIds.add(t.id));
            nextTplId = templates.reduce((m, t) => Math.max(m, t.id), 0) + 1;
            renderTemplates();
            renderRules();
          }
          showToast('templatesToast', 'Templates saved');
        } else {
          showToast('templatesToast', JSON.stringify(res), true);
        }
      } catch (e) {
        showToast('templatesToast', String(e), true);
      }
    });

    on('saveRules', 'click', async () => {
      try {
        const payload = rules.map((r, i) => ({
          id: r.id,
          name: r.name,
          trigger_type: r.trigger_type,
          status_match: r.status_match || null,
          template_id: r.template_id,
          enabled: r.enabled ? 1 : 0,
          sort_order: i,
          recipient_type: r.recipient_type || 'job_contact',
          recipient_number: r.recipient_number || null,
          badge_json: r.badge_json || null,
          suppress_badge_json: r.suppress_badge_json || null,
          schedule_offset_value: r.schedule_offset_value ?? null,
          schedule_offset_unit: r.schedule_offset_unit || null,
          schedule_anchor: r.schedule_anchor || null,
        }));
        const res = parseInvoke(await invoke('sms_dashboard_save', { section: 'rules', rules: payload }));
        if (res && res.ok !== false) {
          if (Array.isArray(res.rules)) {
            rules = res.rules;
            nextRuleId = rules.reduce((m, t) => Math.max(m, t.id), 0) + 1;
            renderRules();
          }
          showToast('rulesToast', 'Automations saved');
        } else {
          showToast('rulesToast', JSON.stringify(res), true);
        }
      } catch (e) {
        showToast('rulesToast', String(e), true);
      }
    });

    on('saveSettings', 'click', async () => {
      try {
        const uatOn = document.getElementById('uatEnabled').checked;
        const uatNumber = document.getElementById('uatRedirectNumber').value.replace(/\\s+/g, '');
        if (uatOn && !uatNumber) {
          document.getElementById('settingsOut').textContent = 'UAT is on — enter a redirect mobile number.';
          return;
        }
        const res = parseInvoke(await invoke('sms_dashboard_save', {
          section: 'settings',
          en_route_statuses: document.getElementById('enRouteStatuses').value,
          automation_cooldown_minutes: document.getElementById('automationCooldownMinutes').value,
          quiet_hours_enabled: document.getElementById('quietHoursEnabled').checked ? '1' : '0',
          quiet_hours_start: document.getElementById('quietHoursStart').value,
          quiet_hours_end: document.getElementById('quietHoursEnd').value,
          automation_exclusion_keywords: document.getElementById('automationExclusionKeywords').value,
          uat_enabled: uatOn ? '1' : '0',
          uat_redirect_number: uatNumber,
        }));
        document.getElementById('settingsOut').textContent = JSON.stringify(res);
        if (res && res.uat) updateUatBanner(res.uat);
      } catch (e) {
        document.getElementById('settingsOut').textContent = String(e);
      }
    });

    on('testYeastar', 'click', async () => {
      try {
        const res = parseInvoke(await invoke('sms_test_yeastar', {}));
        document.getElementById('settingsOut').textContent = JSON.stringify(res);
      } catch (e) {
        document.getElementById('settingsOut').textContent = String(e);
      }
    });

    on('testUatRedirect', 'click', async () => {
      try {
        const res = parseInvoke(await invoke('sms_test_uat_redirect', {}));
        document.getElementById('settingsOut').textContent = JSON.stringify(res);
        if (res && res.ok) await refreshDashboardData();
      } catch (e) {
        document.getElementById('settingsOut').textContent = String(e);
      }
    });

    on('refreshDashboard', 'click', () => { void refreshDashboardData(); });
    on('refreshLog', 'click', () => { void refreshDashboardData(); });
    on('refreshInbox', 'click', () => { void refreshDashboardData(); });
    on('refreshPending', 'click', () => { void refreshDashboardData(); });
    renderPending();
  } catch (e) {
    console.error('dashboard init', e);
  }
}

initDashboard();
</script>
</body></html>`;
}
