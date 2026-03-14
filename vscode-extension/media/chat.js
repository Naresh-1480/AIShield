const vscode = acquireVsCodeApi();

const promptInput = document.getElementById('prompt-input');
const sendButton = document.getElementById('send-button');
const statusIndicator = document.getElementById('status-indicator');
const decisionIndicator = document.getElementById('decision-indicator');
const chatHistoryEl = document.getElementById('chat-history');

function setStatus(text, statusClass) {
  if (!statusIndicator) return;
  statusIndicator.textContent = text;
  statusIndicator.className = `status ${statusClass}`;
}

function setDecision(decisionText, decisionClass) {
  if (!decisionIndicator) return;
  decisionIndicator.textContent = decisionText;
  decisionIndicator.className = `decision ${decisionClass}`;
}

function appendChatEntry(entry) {
  if (!chatHistoryEl) return;

  const container = document.createElement('div');
  container.className = 'chat-entry';

  const userBlock = document.createElement('div');
  userBlock.className = 'chat-block user-block';
  userBlock.innerHTML = `<div class="label">You</div><div class="content"></div>`;
  userBlock.querySelector('.content').textContent = entry.prompt ?? '';

  const decisionBlock = document.createElement('div');
  decisionBlock.className = 'chat-block decision-block';

  let decisionLabel = 'Unknown';
  let decisionClass = 'decision-unknown';
  if (entry.decision === 'ALLOW') {
    decisionLabel = 'SAFE';
    decisionClass = 'decision-safe';
  } else if (entry.decision === 'REDACT') {
    decisionLabel = 'REDACTED';
    decisionClass = 'decision-redacted';
  } else if (entry.decision === 'BLOCK') {
    decisionLabel = 'BLOCKED';
    decisionClass = 'decision-blocked';
  }

  const redactedText =
    entry.decision === 'REDACT' && entry.redactedPrompt
      ? `<div class="redacted-prompt"><strong>Sanitized prompt:</strong><br>${escapeHtml(
          entry.redactedPrompt
        )}</div>`
      : '';

  const reasonText =
    entry.decision === 'BLOCK' && entry.reason
      ? `<div class="block-reason"><strong>Reason:</strong> ${escapeHtml(
          entry.reason
        )}</div>`
      : '';

  decisionBlock.innerHTML = `
    <div class="label">Scanner</div>
    <div class="content">
      <span class="decision-pill ${decisionClass}">${decisionLabel}</span>
      ${redactedText}
      ${reasonText}
    </div>
  `;

  const aiBlock = document.createElement('div');
  aiBlock.className = 'chat-block ai-block';
  aiBlock.innerHTML = `<div class="label">AI</div><div class="content"></div>`;
  aiBlock.querySelector('.content').textContent =
    entry.aiResponse ?? (entry.decision === 'BLOCK' ? 'No AI response (blocked).' : '');

  container.appendChild(userBlock);
  container.appendChild(decisionBlock);
  container.appendChild(aiBlock);

  chatHistoryEl.appendChild(container);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sendPrompt() {
  if (!promptInput) return;
  const prompt = promptInput.value.trim();
  if (!prompt) {
    setStatus('Prompt cannot be empty.', 'status-error');
    return;
  }

  setStatus('Sending to scanner...', 'status-busy');
  setDecision('Checking...', 'decision-pending');

  vscode.postMessage({
    type: 'sendPrompt',
    prompt
  });

  if (sendButton) {
    sendButton.disabled = true;
  }
}

window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || message.type !== 'chatResult') return;

  if (sendButton) {
    sendButton.disabled = false;
  }

  if (message.error) {
    setStatus(message.error, 'status-error');
    setDecision('Error', 'decision-unknown');
    return;
  }

  const decision = message.decision || 'UNKNOWN';
  let statusText = '';
  let statusClass = '';
  let decisionText = '';
  let decisionClass = '';

  if (decision === 'ALLOW') {
    statusText = '✅ Prompt safe';
    statusClass = 'status-safe';
    decisionText = 'SAFE';
    decisionClass = 'decision-safe';
  } else if (decision === 'REDACT') {
    statusText = '⚠ Prompt redacted';
    statusClass = 'status-redacted';
    decisionText = 'REDACTED';
    decisionClass = 'decision-redacted';
  } else if (decision === 'BLOCK') {
    statusText = '🚫 Prompt blocked';
    statusClass = 'status-blocked';
    decisionText = 'BLOCKED';
    decisionClass = 'decision-blocked';
  } else {
    statusText = 'Unknown decision';
    statusClass = 'status-error';
    decisionText = 'Unknown';
    decisionClass = 'decision-unknown';
  }

  setStatus(statusText, statusClass);
  setDecision(decisionText, decisionClass);

  appendChatEntry({
    prompt: message.prompt,
    decision,
    redactedPrompt: message.redactedPrompt,
    reason: message.reason,
    aiResponse: message.aiResponse
  });

  if (decision === 'ALLOW' || decision === 'REDACT') {
    if (promptInput) {
      promptInput.value = '';
      promptInput.focus();
    }
  }
});

if (sendButton) {
  sendButton.addEventListener('click', () => sendPrompt());
}

if (promptInput) {
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  });
}

setStatus('Idle', 'status-idle');
setDecision('N/A', 'decision-idle');

