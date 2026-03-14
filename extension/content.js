const BACKEND_URL = "http://localhost:5000/api/scan";

// Prevent multiple initializations if content script is injected repeatedly
if (window.__AI_PRIVACY_PROXY_ACTIVE__) {
  console.log("🛡️ AI Privacy Proxy already active, skipping init");
} else {
  window.__AI_PRIVACY_PROXY_ACTIVE__ = true;

  // Flag to allow one submission to pass through without scanning (to avoid infinite loops)
  window.__aiPrivacyProxyApprovedSend = false;

  let lastSendButton = null;

  function getSource() {
    const host = window.location.hostname;
    if (host.includes("openai") || host.includes("chatgpt")) return "ChatGPT";
    if (host.includes("claude")) return "Claude";
    if (host.includes("gemini")) return "Gemini";
    if (host.includes("copilot")) return "Copilot";
    if (host.includes("perplexity")) return "Perplexity";
    return "Unknown";
  }

  const PROMPT_SELECTORS = [
    "#prompt-textarea",
    '[data-testid="prompt-textarea"]',
    '[data-testid="chat-input"]',
    "textarea",
    'div[contenteditable="true"]',
  ];

  const SEND_BUTTON_SELECTORS = [
    'button[data-testid="send-button"]',
    'button[aria-label="Send message"]',
    'button[aria-label="Send"]',
    'button[type="submit"]',
  ];

  function getPromptElement() {
    for (const selector of PROMPT_SELECTORS) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const text =
        el.value !== undefined
          ? el.value
          : (el.innerText || el.textContent || "");
      if (text && text.trim().length > 0) {
        return el;
      }
    }
    return null;
  }

  function getPromptText() {
    const el = getPromptElement();
    if (!el) return "";
    return el.value !== undefined
      ? el.value
      : (el.innerText || el.textContent || "");
  }

  function setPromptText(text) {
    const el = getPromptElement();
    if (!el) return;
    if (el.value !== undefined) {
      const proto =
        el.tagName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) {
        setter.call(el, text);
      } else {
        el.value = text;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      el.innerText = text;
      el.textContent = text;
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: text,
          inputType: "insertText",
        }),
      );
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // Bottom-right toast for ALLOW and general info
  function showToast(message, color = "#16a34a") {
    try {
      let toast = document.getElementById("ai-scanner-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "ai-scanner-toast";
        toast.style.cssText = `
          position: fixed;
          bottom: 16px;
          right: 16px;
          max-width: 260px;
          background: rgba(15,23,42,0.95);
          color: #fff;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          z-index: 2147483647;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          border-left: 3px solid ${color};
          opacity: 0;
          transition: opacity 0.2s ease-out;
        `;
        document.body.appendChild(toast);
      }
      toast.style.borderLeftColor = color;
      toast.textContent = message;
      toast.style.opacity = "1";

      clearTimeout(toast.__hideTimer);
      toast.__hideTimer = setTimeout(() => {
        toast.style.opacity = "0";
      }, 2200);
    } catch (e) {
      // best-effort only
    }
  }

  // Centered modal for REDACT / BLOCK
  function showDecisionModal(options) {
    const {
      action,
      entities,
      redactedText,
      onSendRedacted,
      onCancel,
    } = options;

    const existing = document.getElementById("ai-privacy-modal");
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement("div");
    overlay.id = "ai-privacy-modal";
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(15,23,42,0.88);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    `;

    const isBlock = action === "BLOCK";
    const accent = isBlock ? "#ef4444" : "#facc15";
    const title = isBlock ? "Prompt blocked" : "Sensitive data detected";
    const subtitle = isBlock
      ? "This prompt contains highly sensitive data and cannot be sent."
      : "Review the redacted version below before sending.";

    const entitiesHtml = (entities || [])
      .map((e) => {
        const label = e.label || e.type || "ENTITY";
        const value = e.text || e.value || "";
        return `
          <span style="background:#020617;border:1px solid #1f2937;color:#e5e7eb;padding:4px 8px;border-radius:999px;font-size:11px;margin:2px;display:inline-flex;gap:4px;align-items:center;">
            <span style="width:6px;height:6px;border-radius:999px;background:${accent};"></span>
            <strong>${label}</strong>${value ? `: ${value}` : ""}
          </span>
        `;
      })
      .join("");

    const redactedSection =
      !isBlock && redactedText
        ? `
      <div style="margin-top:14px;padding:10px 12px;border-radius:8px;background:#020617;border:1px solid #1f2937;max-height:160px;overflow:auto;">
        <div style="font-size:11px;color:#9ca3af;margin-bottom:4px;">Prompt after redaction</div>
        <div style="font-size:13px;color:#fef9c3;white-space:pre-wrap;">${redactedText}</div>
      </div>
    `
        : "";

    overlay.innerHTML = `
      <div style="background:#020617;border-radius:12px;border:1px solid #1f2937;padding:20px;max-width:460px;width:92%;color:#e5e7eb;box-shadow:0 20px 40px rgba(0,0,0,0.6);">
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;">
          <div style="width:26px;height:26px;border-radius:999px;background:${accent}1a;display:flex;align-items:center;justify-content:center;color:${accent};font-size:16px;">
            ${isBlock ? "⛔" : "⚠️"}
          </div>
          <div>
            <div style="font-size:16px;font-weight:600;">${title}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${subtitle}</div>
          </div>
        </div>

        ${
          entitiesHtml
            ? `
          <div style="margin-top:8px;">
            <div style="font-size:11px;color:#9ca3af;margin-bottom:4px;">Detected items</div>
            <div>${entitiesHtml}</div>
          </div>
        `
            : ""
        }

        ${redactedSection}

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;">
          <button id="ai-privacy-cancel" style="padding:7px 14px;font-size:12px;border-radius:8px;border:1px solid #374151;background:#020617;color:#e5e7eb;cursor:pointer;">
            Cancel
          </button>
          ${
            isBlock
              ? ""
              : `
          <button id="ai-privacy-send" style="padding:7px 14px;font-size:12px;border-radius:8px;border:none;background:${accent};color:#111827;font-weight:600;cursor:pointer;">
            Send redacted text
          </button>
        `
          }
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cancelBtn = document.getElementById("ai-privacy-cancel");
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        console.log("[extension] User cancelled send from modal");
        overlay.remove();
        if (onCancel) onCancel();
      };
    }

    if (!isBlock) {
      const sendBtn = document.getElementById("ai-privacy-send");
      if (sendBtn) {
        sendBtn.onclick = () => {
          console.log("[extension] User confirmed send redacted");
          overlay.remove();
          if (onSendRedacted) onSendRedacted();
        };
      }
    }
  }

  async function scanPromptAndAct(triggerType) {
    const prompt = getPromptText();
    if (!prompt || !prompt.trim()) {
      return;
    }

    console.log("[extension] Prompt captured:", prompt);
    showToast("Scanning prompt...", "#22c55e");

    try {
      const stored = await chrome.storage?.sync?.get?.(["department"]);
      const department = stored?.department || "Unknown";

      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: prompt,
          message: prompt,
          department,
          source: getSource(),
        }),
      });

      const result = await res.json();
      console.log("[extension] Scanner response:", result);

      const action = result.action || "ALLOW";
      console.log("[extension] Final action:", action);

      if (action === "ALLOW") {
        showToast("Prompt allowed", "#22c55e");
        // Approve exactly one send; no UI modal.
        window.__aiPrivacyProxyApprovedSend = true;
        triggerSubmission(triggerType);
        console.log("[extension] Approved send (ALLOW).");
        return;
      }

      if (action === "BLOCK") {
        showDecisionModal({
          action: "BLOCK",
          entities: result.entities || [],
          redactedText: null,
          onCancel: () => {
            console.log("[extension] BLOCK: original send prevented.");
          },
        });
        return;
      }

      if (action === "REDACT") {
        const redacted = result.redactedText || prompt;
        showDecisionModal({
          action: "REDACT",
          entities: result.entities || [],
          redactedText: redacted,
          onSendRedacted: () => {
            // First, inject the redacted text and fire input/change so the site
            // updates its internal state, then trigger the approved send slightly later.
            setPromptText(redacted);
            setTimeout(() => {
              // Approve exactly one send with redacted text.
              window.__aiPrivacyProxyApprovedSend = true;
              triggerSubmission(triggerType);
              console.log("[extension] Approved send of redacted text.");
            }, 120);
          },
          onCancel: () => {
            console.log("[extension] REDACT: user cancelled, nothing sent.");
          },
        });
        return;
      }

      // Fallback: treat unknown action as ALLOW
      window.__aiPrivacyProxyApprovedSend = true;
      triggerSubmission(triggerType);
      console.log("[extension] Unknown action, defaulting to ALLOW.");
    } catch (err) {
      console.error("[extension] Scanner error, allowing prompt through", err);
      // Fallback: allow once without scanning
      window.__aiPrivacyProxyApprovedSend = true;
      triggerSubmission(triggerType);
    }
  }

  function triggerSubmission(triggerType) {
    if (triggerType === "enter") {
      const el = getPromptElement() || document.activeElement;
      if (el) {
        const ev = new KeyboardEvent("keydown", {
          key: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(ev);
      }
      return;
    }

    // Default: re-click the last known send button or find a new one
    if (lastSendButton && document.contains(lastSendButton)) {
      lastSendButton.click();
      return;
    }

    for (const sel of SEND_BUTTON_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        return;
      }
    }
  }

  // Intercept Enter key before the site handles it
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" || event.shiftKey) {
        return;
      }

      // If this submission was already approved by the scanner, let it through once
      if (window.__aiPrivacyProxyApprovedSend) {
        window.__aiPrivacyProxyApprovedSend = false;
        console.log("[extension] Letting approved Enter submission through.");
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      console.log("[extension] Intercepted Enter, starting scan.");
      scanPromptAndAct("enter");
    },
    true,
  );

  // Intercept send button clicks
  document.addEventListener(
    "click",
    (event) => {
      const btn = event.target.closest(SEND_BUTTON_SELECTORS.join(","));
      if (!btn) return;

      lastSendButton = btn;

      if (window.__aiPrivacyProxyApprovedSend) {
        window.__aiPrivacyProxyApprovedSend = false;
        console.log("[extension] Letting approved button submission through.");
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      console.log("[extension] Intercepted send button, starting scan.");
      scanPromptAndAct("button");
    },
    true,
  );

  console.log("🛡️ AI Privacy Proxy content script initialized");
}
