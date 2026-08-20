import { SHARED_STYLES } from "./styles.js";
import {
  countOutboundSince,
  getSetting,
  listInbound,
  listOutbound,
  listRules,
  listTemplates,
} from "../db/repository.js";
import { env } from "../config/env.js";
import { APP_VERSION } from "../config/version.js";
import { isTestMode, testModeLabel } from "../yeastar/guard.js";
import { resolveAccessToken } from "../servicem8/oauth.js";
import { createSmsTemplate, listSmsTemplates } from "../servicem8/api.js";

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
  const token = await resolveAccessToken(accountUuid, auth);
  const importedTemplates = token ? await listSmsTemplates(token) : [];

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
  ${isTestMode() ? `<p style="background:#fef3c7;border:1px solid #fcd34d;padding:8px 12px;border-radius:6px;font-size:13px;color:#92400e">UAT mode: ${esc(testModeLabel())}</p>` : ""}
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

<div id="log" class="panel">
  <div class="panel-head">
    <div><h2>Outbound log</h2></div>
    <button type="button" id="refreshLog" class="secondary sm">Refresh</button>
  </div>
  <div class="card table-wrap" style="padding:0">
    <table><thead><tr><th>When</th><th>To</th><th>Status</th><th>Detail</th><th>Body</th></tr></thead>
    <tbody id="logList">${outbound.map((m) => {
      const detail = String(m.provider_response ?? "").trim();
      const detailShort = detail ? (detail.length > 80 ? detail.slice(0, 80) + "…" : detail) : (m.status === "failed" ? "No error recorded" : "");
      return `<tr><td>${esc(String(m.created_at))}</td><td>${esc(String(m.to_number))}</td><td>${esc(statusLabelText(String(m.status)))}</td><td class="muted" title="${esc(detail)}">${esc(detailShort)}</td><td>${esc(String(m.body).slice(0, 80))}</td></tr>`;
    }).join("") || '<tr><td colspan="5" class="empty">No outbound messages yet</td></tr>'}</tbody></table>
  </div>
</div>

<div id="inbox" class="panel">
  <div class="panel-head">
    <div>
      <h2>Inbox</h2>
      <p class="muted" style="margin:4px 0 0">Numbers on the left · full conversation on the right</p>
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
    }))
  )};
let selectedPhoneKey = null;

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
    el.innerHTML = '<tr><td colspan="5" class="empty">No outbound messages yet</td></tr>';
    return;
  }
  el.innerHTML = rows.map((m) =>
    '<tr><td>' + escHtml(m.created_at) + '</td><td>' + escHtml(m.to_number) + '</td><td>' + escHtml(statusLabel(m.status)) +
    '</td><td class="muted" title="' + escHtml(String(m.provider_response || '')) + '">' + escHtml(logDetailText(m)) +
    '</td><td>' + escHtml(String(m.body).slice(0, 80)) + '</td></tr>'
  ).join('');
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

function renderInboxThread(key) {
  const el = document.getElementById('inboxThread');
  if (!el) return;
  if (!key) {
    el.innerHTML = '<div class="inbox-thread-empty empty">Select a number to view the conversation</div>';
    return;
  }
  const conversations = buildConversations();
  const conv = conversations.find((c) => c.key === key);
  const msgs = messagesForKey(key);
  const header =
    '<div class="inbox-thread-head">' +
    '<div>' +
    '<strong>' + escHtml(formatPhoneDisplay(conv ? conv.number : key)) + '</strong>' +
    '<span class="muted">' + msgs.length + ' message' + (msgs.length === 1 ? '' : 's') + '</span>' +
    '</div></div>';
  if (!msgs.length) {
    el.innerHTML = header + '<div class="inbox-thread-empty empty">No messages for this number</div>';
    return;
  }
  // WhatsApp-style: oldest → newest top-to-bottom; open scrolled to latest (bottom)
  el.innerHTML = header + '<div class="inbox-thread-list" id="inboxThreadList">' + msgs.map((m) =>
    '<div class="msg ' + m.dir + '">' +
    '<div class="msg-bubble">' + escHtml(m.body) + '</div>' +
    '<div class="msg-meta">' + (m.dir === 'out' ? 'Sent' : 'Received') + ' · ' + escHtml(formatInboxTime(m.at)) + '</div>' +
    '</div>'
  ).join('') + '</div>';
  const list = document.getElementById('inboxThreadList');
  if (list) {
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }
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
  return 'When a job is created';
}

function ruleSummary(r) {
  const tpl = templates.find((t) => t.id === r.template_id);
  const msg = tpl ? tpl.name : 'template';
  return whenLabel(r) + ' → send “' + msg + '” to ' + recipientLabel(r);
}

function statusMatchEnabled(trigger) {
  return trigger === 'status_changed';
}

function selectedRecipientType() {
  const el = document.querySelector('input[name="ruleRecipient"]:checked');
  return el ? el.value : 'job_contact';
}

function syncRuleModalFields() {
  const trigger = document.getElementById('ruleTrigger').value;
  const statusWrap = document.getElementById('ruleStatusWrap');
  const customWrap = document.getElementById('ruleCustomWrap');
  if (statusWrap) statusWrap.style.display = statusMatchEnabled(trigger) ? 'block' : 'none';
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
  const payload = {
    name,
    trigger_type,
    status_match: statusMatchEnabled(trigger_type) ? document.getElementById('ruleStatus').value.trim() : '',
    template_id: Number(document.getElementById('ruleTemplate').value) || (templates[0] && templates[0].id) || 1,
    recipient_type,
    recipient_number: recipient_type === 'custom' ? recipient_number : '',
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
          name: r.name,
          trigger_type: r.trigger_type,
          status_match: r.status_match || null,
          template_id: r.template_id,
          enabled: r.enabled ? 1 : 0,
          sort_order: i,
          recipient_type: r.recipient_type || 'job_contact',
          recipient_number: r.recipient_number || null,
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
        const res = parseInvoke(await invoke('sms_dashboard_save', {
          section: 'settings',
          en_route_statuses: document.getElementById('enRouteStatuses').value,
          automation_cooldown_minutes: document.getElementById('automationCooldownMinutes').value,
          quiet_hours_enabled: document.getElementById('quietHoursEnabled').checked ? '1' : '0',
          quiet_hours_start: document.getElementById('quietHoursStart').value,
          quiet_hours_end: document.getElementById('quietHoursEnd').value,
          automation_exclusion_keywords: document.getElementById('automationExclusionKeywords').value,
        }));
        document.getElementById('settingsOut').textContent = JSON.stringify(res);
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

    on('refreshDashboard', 'click', () => { void refreshDashboardData(); });
    on('refreshLog', 'click', () => { void refreshDashboardData(); });
    on('refreshInbox', 'click', () => { void refreshDashboardData(); });
  } catch (e) {
    console.error('dashboard init', e);
  }
}

initDashboard();
</script>
</body></html>`;
}
