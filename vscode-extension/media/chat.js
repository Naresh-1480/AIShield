// ── VS Code AI Privacy Guard — webview script ────────────────────────────────
// Two-phase flow:
//   1. User clicks Send → postMessage(scanPrompt) → extension calls /api/scan
//      → scanResult arrives with action/entities/redactedText
//   2. Based on action:
//      ALLOW  → green toast → postMessage(sendToAI) → aiResult → show response
//      WARN   → yellow modal → "Send anyway" → postMessage(sendToAI) or Cancel
//      REDACT → red modal   → "Send redacted" → postMessage(sendToAI) or Cancel
//      BLOCK  → red modal (no send button) → Cancel only
// ─────────────────────────────────────────────────────────────────────────────

const vscode = acquireVsCodeApi();

const promptInput       = document.getElementById('prompt-input');
const sendButton        = document.getElementById('send-button');
const statusIndicator   = document.getElementById('status-indicator');
const decisionIndicator = document.getElementById('decision-indicator');
const chatHistoryEl     = document.getElementById('chat-history');
const modalOverlay      = document.getElementById('apg-modal-overlay');

// Holds the original prompt text while a modal is open
let _pendingOriginalPrompt = '';
// Department (could be extended with a UI picker later)
const DEPARTMENT = 'Unknown';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatus(text, cls) {
  if (!statusIndicator) return;
  statusIndicator.textContent = text;
  statusIndicator.className = `status ${cls}`;
}

function setDecision(text, cls) {
  if (!decisionIndicator) return;
  decisionIndicator.textContent = text;
  decisionIndicator.className = `decision ${cls}`;
}

function setInputLocked(locked) {
  if (sendButton) sendButton.disabled = locked;
  if (promptInput) promptInput.readOnly = locked;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Toast (ALLOW / info) ──────────────────────────────────────────────────────

function showToast(message, color = '#22c55e', duration = 2200) {
  let toast = document.getElementById('apg-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'apg-toast';
    document.body.appendChild(toast);
  }
  toast.style.cssText = `
    position: fixed;
    bottom: 16px;
    right: 16px;
    max-width: 290px;
    background: rgba(15,23,42,0.97);
    color: #e5e7eb;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-family: system-ui, sans-serif;
    z-index: 99999;
    box-shadow: 0 4px 14px rgba(0,0,0,0.5);
    border-left: 3px solid ${color};
    opacity: 1;
    transition: opacity 0.25s ease;
  `;
  toast.innerHTML = message;
  clearTimeout(toast.__timer);
  toast.__timer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

// ── Decision Modal ────────────────────────────────────────────────────────────

function showDecisionModal({ action, entities, redactedText, onConfirm, onCancel }) {
  if (!modalOverlay) return;

  const isBlock = action === 'BLOCK';
  const isWarn  = action === 'WARN';
  const accent  = isWarn ? '#f59e0b' : '#ef4444';

  const title = isBlock ? '⛔ Prompt Blocked'
              : isWarn  ? '⚠️ Sensitive Details Detected'
              :            '🔴 Sensitive Data Detected';

  const subtitle = isBlock
    ? 'This prompt contains critically sensitive data and cannot be sent.'
    : isWarn
    ? 'Your prompt contains some sensitive details. You can still send it, but consider whether this is intentional.'
    : 'Your prompt contains sensitive information. The redacted version is shown below.';

  const entitiesHtml = (entities || [])
    .map(e => {
      const label = escapeHtml(e.label || e.type || 'ENTITY');
      const value = escapeHtml(e.text || e.value || '');
      return `<span class="apg-entity-pill" style="border-color:${accent}40;">
        <span class="apg-entity-dot" style="background:${accent};"></span>
        <strong>${label}</strong>${value ? ': ' + value : ''}
      </span>`;
    })
    .join('');

  const redactedSection = (!isBlock && redactedText) ? `
    <div class="apg-redacted-box">
      <div class="apg-redacted-label">Prompt after redaction</div>
      <div class="apg-redacted-text">${escapeHtml(redactedText)}</div>
    </div>` : '';

  const confirmBtnHtml = isBlock ? '' : `
    <button id="apg-modal-confirm" class="apg-btn-confirm" style="background:${accent};">
      ${isWarn ? 'Send anyway' : 'Send redacted'}
    </button>`;

  modalOverlay.innerHTML = `
    <div class="apg-modal-card">
      <div class="apg-modal-header">
        <div class="apg-modal-icon" style="background:${accent}1a; color:${accent};">
          ${isBlock ? '🚫' : isWarn ? '⚠️' : '🔴'}
        </div>
        <div>
          <div class="apg-modal-title">${title}</div>
          <div class="apg-modal-subtitle">${subtitle}</div>
        </div>
      </div>

      ${entitiesHtml ? `<div class="apg-entities-row">
        <div class="apg-section-label">Detected items</div>
        <div class="apg-entities-list">${entitiesHtml}</div>
      </div>` : ''}

      ${redactedSection}

      <div class="apg-modal-actions">
        <button id="apg-modal-cancel" class="apg-btn-cancel">Cancel</button>
        ${confirmBtnHtml}
      </div>
    </div>`;

  modalOverlay.style.display = 'flex';

  document.getElementById('apg-modal-cancel').onclick = () => {
    closeModal();
    if (onCancel) onCancel();
  };

  if (!isBlock) {
    const confirmBtn = document.getElementById('apg-modal-confirm');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        closeModal();
        if (onConfirm) onConfirm();
      };
    }
  }
}

function closeModal() {
  if (modalOverlay) modalOverlay.style.display = 'none';
}

// ── Chat history ──────────────────────────────────────────────────────────────

function appendChatEntry({ prompt, action, redactedPrompt, reason, aiResponse }) {
  if (!chatHistoryEl) return;

  const container = document.createElement('div');
  container.className = 'chat-entry';

  // User block
  const userBlock = document.createElement('div');
  userBlock.className = 'chat-block user-block';
  userBlock.innerHTML = `<div class="label">You</div><div class="content"></div>`;
  userBlock.querySelector('.content').textContent = prompt ?? '';

  // Scanner decision block
  const decisionBlock = document.createElement('div');
  decisionBlock.className = 'chat-block decision-block';

  let pillLabel = 'Unknown';
  let pillClass = 'decision-unknown';
  if (action === 'ALLOW')  { pillLabel = 'SAFE';    pillClass = 'decision-safe';    }
  if (action === 'WARN')   { pillLabel = 'WARNED';  pillClass = 'decision-warned';  }
  if (action === 'REDACT') { pillLabel = 'REDACTED'; pillClass = 'decision-redacted'; }
  if (action === 'BLOCK')  { pillLabel = 'BLOCKED'; pillClass = 'decision-blocked'; }

  const redactedHtml = (action === 'REDACT' && redactedPrompt)
    ? `<div class="redacted-prompt"><strong>Sanitized:</strong><br>${escapeHtml(redactedPrompt)}</div>` : '';
  const reasonHtml = (action === 'BLOCK' && reason)
    ? `<div class="block-reason"><strong>Reason:</strong> ${escapeHtml(reason)}</div>` : '';

  decisionBlock.innerHTML = `
    <div class="label">Scanner</div>
    <div class="content">
      <span class="decision-pill ${pillClass}">${pillLabel}</span>
      ${redactedHtml}${reasonHtml}
    </div>`;

  // AI block
  const aiBlock = document.createElement('div');
  aiBlock.className = 'chat-block ai-block';
  aiBlock.innerHTML = `<div class="label">AI</div><div class="content"></div>`;
  aiBlock.querySelector('.content').textContent =
    aiResponse ?? (action === 'BLOCK' ? 'Blocked — no AI response.' : '');

  container.appendChild(userBlock);
  container.appendChild(decisionBlock);
  container.appendChild(aiBlock);

  chatHistoryEl.appendChild(container);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

// ── Core send flow ────────────────────────────────────────────────────────────

function sendPrompt() {
  if (!promptInput) return;
  const prompt = promptInput.value.trim();
  if (!prompt) {
    setStatus('Prompt cannot be empty.', 'status-error');
    return;
  }

  _pendingOriginalPrompt = prompt;
  setStatus('Scanning prompt…', 'status-busy');
  setDecision('Checking…', 'decision-pending');
  setInputLocked(true);

  vscode.postMessage({ type: 'scanPrompt', prompt, department: DEPARTMENT });
}

function dispatchToAI(finalPrompt, originalPrompt, action) {
  setStatus('Waiting for AI…', 'status-busy');

  vscode.postMessage({ type: 'sendToAI', prompt: finalPrompt, department: DEPARTMENT });

  // Optimistic: clear input immediately so user sees progress
  if (action !== 'BLOCK') {
    if (promptInput) { promptInput.value = ''; }
  }

  // Store for history entry
  window.__pendingEntry = { prompt: originalPrompt, action };
}

// ── Message handler ───────────────────────────────────────────────────────────

window.addEventListener('message', event => {
  const msg = event.data;
  if (!msg) return;

  // ── Scan result ───────────────────────────────────────────────────────────
  if (msg.type === 'scanResult') {
    // On scan error we still allow through (same as Chrome extension behaviour)
    if (msg.error && !msg.action) {
      setStatus('⚠ Scanner error — sending anyway', 'status-busy');
      showToast(`⚠️ ${msg.error}`, '#f59e0b', 3000);
      dispatchToAI(_pendingOriginalPrompt, _pendingOriginalPrompt, 'ALLOW');
      return;
    }

    const action      = msg.action || 'ALLOW';
    const entities    = msg.entities || [];
    const redactedTxt = msg.redactedText || null;

    // ── ALLOW ─────────────────────────────────────────────────────────────
    if (action === 'ALLOW') {
      showToast('✅ Prompt is safe', '#22c55e', 1800);
      setStatus('Sending to AI…', 'status-busy');
      setDecision('SAFE', 'decision-safe');
      dispatchToAI(_pendingOriginalPrompt, _pendingOriginalPrompt, 'ALLOW');
      return;
    }

    // ── WARN ──────────────────────────────────────────────────────────────
    if (action === 'WARN') {
      setStatus('⚠️ Sensitive details detected', 'status-warn');
      setDecision('WARN', 'decision-warned');
      setInputLocked(false);
      showDecisionModal({
        action: 'WARN',
        entities,
        redactedText: null,
        onConfirm: () => {
          // User chose "Send anyway" — send the original unchanged
          setStatus('Sending to AI…', 'status-busy');
          setInputLocked(true);
          dispatchToAI(_pendingOriginalPrompt, _pendingOriginalPrompt, 'WARN');
        },
        onCancel: () => {
          setStatus('Cancelled', 'status-idle');
          setDecision('N/A', 'decision-idle');
        }
      });
      return;
    }

    // ── BLOCK ─────────────────────────────────────────────────────────────
    if (action === 'BLOCK') {
      setStatus('🚫 Prompt blocked', 'status-blocked');
      setDecision('BLOCKED', 'decision-blocked');
      setInputLocked(false);
      appendChatEntry({
        prompt: _pendingOriginalPrompt,
        action: 'BLOCK',
        reason: (msg.reasons || []).join('; ') || 'Blocked by policy'
      });
      showDecisionModal({
        action: 'BLOCK',
        entities,
        redactedText: null,
        onCancel: () => {
          setStatus('Blocked', 'status-blocked');
        }
      });
      return;
    }

    // ── REDACT ────────────────────────────────────────────────────────────
    if (action === 'REDACT') {
      const finalText = redactedTxt || _pendingOriginalPrompt;
      setStatus('🔴 Sensitive data — redaction required', 'status-redacted');
      setDecision('REDACT', 'decision-redacted');
      setInputLocked(false);
      showDecisionModal({
        action: 'REDACT',
        entities,
        redactedText: finalText,
        onConfirm: () => {
          setStatus('Sending redacted to AI…', 'status-busy');
          setInputLocked(true);
          dispatchToAI(finalText, _pendingOriginalPrompt, 'REDACT');
          window.__pendingEntry.redactedPrompt = finalText;
        },
        onCancel: () => {
          setStatus('Cancelled', 'status-idle');
          setDecision('N/A', 'decision-idle');
        }
      });
      return;
    }

    // Fallback — unknown action
    dispatchToAI(_pendingOriginalPrompt, _pendingOriginalPrompt, 'ALLOW');
    return;
  }

  // ── AI result ─────────────────────────────────────────────────────────────
  if (msg.type === 'aiResult') {
    setInputLocked(false);

    if (msg.error) {
      setStatus(msg.error, 'status-error');
      setDecision('Error', 'decision-unknown');
      return;
    }

    const entry = window.__pendingEntry || {};
    const action = entry.action || 'ALLOW';

    if (action === 'ALLOW') {
      setStatus('✅ Prompt safe', 'status-safe');
      setDecision('SAFE', 'decision-safe');
    } else if (action === 'WARN') {
      setStatus('⚠ Sent with warning', 'status-warn');
      setDecision('WARNED', 'decision-warned');
    } else if (action === 'REDACT') {
      setStatus('⚠ Prompt redacted', 'status-redacted');
      setDecision('REDACTED', 'decision-redacted');
    }

    appendChatEntry({
      prompt: entry.prompt || '',
      action,
      redactedPrompt: entry.redactedPrompt || null,
      aiResponse: msg.response || '(no response)'
    });

    promptInput?.focus();
    window.__pendingEntry = null;
    return;
  }
});

// ── Wire up UI events ─────────────────────────────────────────────────────────

if (sendButton) {
  sendButton.addEventListener('click', () => sendPrompt());
}

if (promptInput) {
  promptInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  });
}

setStatus('Idle', 'status-idle');
setDecision('N/A', 'decision-idle');
