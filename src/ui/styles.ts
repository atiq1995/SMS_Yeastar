export const SHARED_STYLES = `
  * { box-sizing: border-box; }
  html { color-scheme: light; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    margin: 0;
    padding: 16px;
    color: #1f2937;
    background: #ffffff;
  }
  h1 { font-size: 1.25rem; margin: 0 0 12px; color: #111827; }
  h1 .version {
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    padding: 2px 8px;
    margin-left: 8px;
    vertical-align: middle;
  }
  h2 { margin: 0; font-size: 1rem; color: #111827; }
  .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
  .tab {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    color: #374151;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }
  .tab.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }
  .rule-cards { display: flex; flex-direction: column; gap: 10px; }
  .rule-card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px 14px;
  }
  .rule-card.off { opacity: 0.55; }
  .rule-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .rule-card-top strong { font-size: 14px; color: #111827; }
  .rule-card p { margin: 6px 0 10px; }
  .rule-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #374151;
    margin: 0;
    white-space: nowrap;
  }
  .rule-toggle input { width: auto; margin: 0; }
  .radio-list { display: flex; flex-direction: column; gap: 6px; margin: 4px 0 12px; }
  .radio-list label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    margin: 0;
    cursor: pointer;
  }
  .radio-list input { width: auto; margin: 0; }
  .panel {
    display: none;
    background: #fafafa;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
  }
  .panel.active { display: block; }
  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    gap: 12px;
    flex-wrap: wrap;
  }
  .card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 12px;
  }
  label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
  th {
    text-align: left;
    padding: 10px 8px;
    border-bottom: 1px solid #e5e7eb;
    background: #f3f4f6;
    color: #374151;
    font-weight: 600;
    white-space: nowrap;
  }
  td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #f3f4f6; color: #1f2937; vertical-align: middle; }
  td input, td select { margin-bottom: 0; min-width: 0; }
  textarea, input, select {
    width: 100%;
    padding: 8px;
    margin: 4px 0 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #fff;
    color: #1f2937;
    font-size: 13px;
  }
  textarea { min-height: 80px; resize: vertical; font-family: inherit; line-height: 1.45; }
  button {
    padding: 8px 14px;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }
  button.secondary { background: #fff; color: #374151; border: 1px solid #d1d5db; }
  button.danger { background: #fff; color: #b91c1c; border: 1px solid #fecaca; }
  button.sm { padding: 4px 10px; font-size: 12px; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .chip {
    padding: 4px 8px;
    font-size: 11px;
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
    border-radius: 999px;
    cursor: pointer;
    user-select: none;
  }
  .chip:hover { background: #dbeafe; }
  .hint { font-size: 11px; color: #6b7280; margin: -6px 0 10px; }
  .preview-box {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    padding: 12px;
    font-size: 13px;
    line-height: 1.5;
    color: #14532d;
  }
  .preview-box strong {
    display: block;
    font-size: 11px;
    color: #166534;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .table-wrap { overflow-x: auto; }
  .tpl-snippet {
    color: #6b7280;
    font-size: 12px;
    max-width: 420px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-actions { display: flex; gap: 6px; white-space: nowrap; }
  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #e5e7eb;
    flex-wrap: wrap;
  }
  .toast {
    display: none;
    padding: 8px 12px;
    border-radius: 6px;
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
    font-size: 13px;
  }
  .toast.show { display: inline-block; }
  .toast.err { background: #fef2f2; color: #991b1b; border-color: #fecaca; }
  .empty { text-align: center; padding: 24px; color: #9ca3af; font-size: 13px; }
  .stat { font-size: 24px; font-weight: 600; color: #111827; }
  .muted { color: #6b7280; font-size: 12px; }
  a { color: #2563eb; }
  pre { background: #f3f4f6; color: #374151; padding: 8px; border-radius: 4px; border: 1px solid #e5e7eb; font-size: 12px; }
  .modal-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 100;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .modal-backdrop.open { display: flex; }
  .modal {
    background: #fff;
    border-radius: 10px;
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 20px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
    border: 1px solid #e5e7eb;
  }
  .modal h3 { margin: 0 0 16px; font-size: 1.05rem; color: #111827; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
  .modal-actions button { margin-bottom: 0; }
  .inbox-layout {
    display: flex;
    min-height: 420px;
    height: 520px;
    max-height: 560px;
    align-items: stretch;
    overflow: hidden;
  }
  .inbox-numbers {
    width: 280px;
    flex-shrink: 0;
    border-right: 1px solid #e5e7eb;
    overflow-x: hidden;
    overflow-y: auto;
    background: #f8fafc;
    min-height: 0;
  }
  .inbox-numbers-head {
    padding: 10px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6b7280;
    border-bottom: 1px solid #e5e7eb;
    background: #f1f5f9;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .inbox-number {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    width: 100%;
    text-align: left;
    padding: 12px 14px;
    border: none;
    border-bottom: 1px solid #e5e7eb;
    border-radius: 0;
    background: transparent;
    color: #1f2937;
    cursor: pointer;
  }
  .inbox-number:hover { background: #fff; }
  .inbox-number.active {
    background: #fff;
    box-shadow: inset 3px 0 0 #3b82f6;
  }
  .inbox-number-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .inbox-number strong { font-size: 13px; color: #111827; }
  .inbox-number-time {
    font-size: 10px;
    color: #9ca3af;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .inbox-number-preview {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
  }
  .inbox-dir {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    line-height: 1.4;
  }
  .inbox-dir.out { background: #dbeafe; color: #1d4ed8; }
  .inbox-dir.in { background: #e5e7eb; color: #374151; }
  .inbox-number-body {
    flex: 1;
    min-width: 0;
    color: #6b7280;
    font-size: 12px;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .inbox-thread {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fff;
    overflow: hidden;
  }
  .inbox-thread-head {
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
    background: #fafafa;
    flex-shrink: 0;
  }
  .inbox-thread-head strong {
    display: block;
    font-size: 14px;
    color: #111827;
  }
  .inbox-thread-head .muted { font-size: 11px; }
  .inbox-thread-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .inbox-thread-list {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: #f8fafc;
    -webkit-overflow-scrolling: touch;
  }
  .inbox-thread .msg { display: flex; flex-direction: column; max-width: 78%; flex-shrink: 0; }
  .inbox-thread .msg.out { align-self: flex-end; align-items: flex-end; margin-left: auto; }
  .inbox-thread .msg.in { align-self: flex-start; }
  .inbox-thread .msg-bubble {
    padding: 9px 12px;
    border-radius: 14px;
    font-size: 13px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }
  .inbox-thread .msg.out .msg-bubble {
    background: #3b82f6;
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .inbox-thread .msg.in .msg-bubble {
    background: #fff;
    color: #1f2937;
    border: 1px solid #e5e7eb;
    border-bottom-left-radius: 4px;
  }
  .inbox-thread .msg-meta { font-size: 10px; color: #9ca3af; margin-top: 4px; padding: 0 4px; }
`;

export const COMPOSER_STYLES = `
  html, body { height: 100%; }
  body { padding: 0; background: #fff; overflow: hidden; }
  .composer { max-width: 100%; height: 100vh; display: flex; flex-direction: column; }
  .composer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid #e5e7eb;
    background: #fafafa;
  }
  .composer-header h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #111827;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .icon-btn {
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 18px;
    line-height: 1;
  }
  .icon-btn:hover { background: #f3f4f6; color: #374151; }
  .job-context {
    padding: 12px 16px;
    background: #f8fafc;
    border-bottom: 1px solid #e5e7eb;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
    font-size: 12px;
    margin: 0;
  }
  .job-context > div { margin: 0; }
  .job-context dt { color: #6b7280; margin: 0; font-weight: 500; }
  .job-context dd { margin: 2px 0 0; color: #111827; font-weight: 600; }
  .composer-body { padding: 16px; flex: 1; overflow-y: auto; min-height: 0; }
  .composer-body label { margin-top: 0; }
  .composer-body textarea { margin-bottom: 4px; }
  .char-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #6b7280;
    margin-bottom: 12px;
  }
  .char-row.warn { color: #b45309; }
  .char-row.over { color: #b91c1c; font-weight: 600; }
  .preview-bubble {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 13px;
    line-height: 1.5;
    color: #14532d;
    margin-bottom: 14px;
  }
  .preview-bubble strong {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #166534;
    margin-bottom: 4px;
  }
  .field-warnings {
    margin: -4px 0 14px;
    padding: 8px 10px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.45;
  }
  .field-warnings.err {
    background: #fef2f2;
    border-color: #fecaca;
    color: #991b1b;
  }
  .thread {
    border-top: 1px solid #e5e7eb;
    margin: 0 -16px;
    padding: 12px 16px 0;
  }
  .thread h3 {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6b7280;
  }
  .thread-list { display: flex; flex-direction: column; gap: 10px; max-height: 160px; overflow-y: auto; }
  .msg { display: flex; flex-direction: column; max-width: 88%; }
  .msg.out { align-self: flex-end; align-items: flex-end; margin-left: auto; }
  .msg.in { align-self: flex-start; }
  .msg-bubble {
    padding: 8px 11px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.4;
  }
  .msg.out .msg-bubble { background: #3b82f6; color: #fff; border-bottom-right-radius: 4px; }
  .msg.in .msg-bubble { background: #f3f4f6; color: #1f2937; border-bottom-left-radius: 4px; }
  .msg-meta { font-size: 10px; color: #9ca3af; margin-top: 3px; padding: 0 4px; }
  .composer-footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 12px 16px;
    border-top: 1px solid #e5e7eb;
    background: #fafafa;
    flex-shrink: 0;
  }
  .composer-footer button { margin-bottom: 0; }
  .composer-error {
    padding: 24px 16px;
    text-align: center;
    color: #6b7280;
    font-size: 13px;
  }
  .composer-error strong { display: block; color: #991b1b; margin-bottom: 8px; }
  .test-banner {
    margin: 0 16px 12px;
    padding: 8px 12px;
    background: #fef3c7;
    border: 1px solid #fcd34d;
    color: #92400e;
    border-radius: 6px;
    font-size: 12px;
  }
`;
