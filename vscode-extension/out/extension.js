"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const BACKEND_URL = 'http://localhost:3000';
function activate(context) {
    const provider = new AiPrivacyGuardViewProvider(context.extensionUri, context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(AiPrivacyGuardViewProvider.viewType, provider));
    context.subscriptions.push(vscode.commands.registerCommand('aiPrivacyGuard.openChat', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.aiPrivacyGuard');
        await vscode.commands.executeCommand('aiPrivacyGuard.chatView.focus');
    }));
}
function deactivate() { }
class AiPrivacyGuardViewProvider {
    constructor(extensionUri, context) {
        this.extensionUri = extensionUri;
        this.context = context;
    }
    resolveWebviewView(webviewView) {
        const webview = webviewView.webview;
        webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
        };
        webview.html = this.getHtmlForWebview(webview);
        this.setupMessageListener(webview);
    }
    setupMessageListener(webview) {
        webview.onDidReceiveMessage(async (message) => {
            // ── Phase 1: scan the prompt, return action/entities/redactedText ──
            if (message?.type === 'scanPrompt') {
                const prompt = message.prompt ?? '';
                const department = message.department ?? 'Unknown';
                if (!prompt.trim()) {
                    webview.postMessage({ type: 'scanResult', error: 'Prompt cannot be empty.' });
                    return;
                }
                try {
                    const response = await fetch(`${BACKEND_URL}/api/scan`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: prompt,
                            message: prompt,
                            department,
                            source: 'vscode-extension'
                        })
                    });
                    if (!response.ok) {
                        const text = await response.text().catch(() => '');
                        throw new Error(`Scan error (${response.status}): ${text || response.statusText}`);
                    }
                    const data = (await response.json());
                    webview.postMessage({
                        type: 'scanResult',
                        action: data.action ?? 'ALLOW',
                        entities: data.entities ?? [],
                        redactedText: data.redactedText ?? null,
                        riskScore: data.riskScore ?? null,
                        reasons: data.reasons ?? []
                    });
                }
                catch (err) {
                    // On scanner failure allow through (same behaviour as Chrome extension)
                    webview.postMessage({
                        type: 'scanResult',
                        action: 'ALLOW',
                        entities: [],
                        redactedText: null,
                        error: err?.message ?? 'Scanner unreachable — prompt allowed through.'
                    });
                }
                return;
            }
            // ── Phase 2: user approved, send the final prompt to the LLM ────────
            if (message?.type === 'sendToAI') {
                const prompt = message.prompt ?? '';
                const department = message.department ?? 'Unknown';
                if (!prompt.trim()) {
                    webview.postMessage({ type: 'aiResult', error: 'Prompt is empty.' });
                    return;
                }
                try {
                    const response = await fetch(`${BACKEND_URL}/api/chat-only`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt, department })
                    });
                    if (!response.ok) {
                        const text = await response.text().catch(() => '');
                        throw new Error(`AI error (${response.status}): ${text || response.statusText}`);
                    }
                    const data = (await response.json());
                    webview.postMessage({ type: 'aiResult', response: data.response ?? '' });
                }
                catch (err) {
                    webview.postMessage({
                        type: 'aiResult',
                        error: err?.message ?? 'Failed to contact AI backend.'
                    });
                }
                return;
            }
        });
    }
    getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.js'));
        // Read CSS from disk and inline it — VSCode's nonce-based CSP blocks <link>
        // stylesheets, but allows inline <style nonce="..."> tags.
        const cssPath = path.join(this.extensionUri.fsPath, 'media', 'chat.css');
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        const nonce = getNonce();
        const csp = [
            "default-src 'none'",
            `img-src ${webview.cspSource} https: data:`,
            `style-src 'nonce-${nonce}'`,
            `script-src 'nonce-${nonce}'`
        ].join('; ');
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Privacy Guard</title>
  <style nonce="${nonce}">${cssContent}</style>
</head>
<body>
  <div id="app">
    <header class="apg-header">
      <h1>AI Privacy Guard</h1>
      <div id="status-indicator" class="status status-idle">Idle</div>
    </header>

    <main class="apg-main">
      <section id="chat-history" class="chat-history" aria-label="Chat history"></section>
    </main>

    <footer class="apg-footer">
      <div class="input-row">
        <textarea id="prompt-input" rows="3" placeholder="Ask your question..."></textarea>
        <button id="send-button" type="button">Send</button>
      </div>
      <div class="decision-row">
        <span class="decision-label">Decision:</span>
        <span id="decision-indicator" class="decision decision-idle">N/A</span>
      </div>
    </footer>
  </div>

  <!-- Decision modal (hidden by default via CSS) -->
  <div id="apg-modal-overlay" class="apg-modal-overlay" role="dialog" aria-modal="true"></div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
AiPrivacyGuardViewProvider.viewType = 'aiPrivacyGuard.chatView';
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=extension.js.map