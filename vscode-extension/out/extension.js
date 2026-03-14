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
function activate(context) {
    const provider = new AiPrivacyGuardViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(AiPrivacyGuardViewProvider.viewType, provider));
    context.subscriptions.push(vscode.commands.registerCommand('aiPrivacyGuard.openChat', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.aiPrivacyGuard');
        await vscode.commands.executeCommand('aiPrivacyGuard.chatView.focus');
    }));
}
function deactivate() { }
class AiPrivacyGuardViewProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
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
            if (message?.type === 'sendPrompt') {
                const prompt = message.prompt ?? '';
                if (!prompt.trim()) {
                    webview.postMessage({
                        type: 'chatResult',
                        error: 'Prompt cannot be empty.'
                    });
                    return;
                }
                try {
                    const response = await fetch('http://localhost:3000/secure-chat', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ prompt })
                    });
                    if (!response.ok) {
                        const text = await response.text().catch(() => '');
                        throw new Error(`Backend error (${response.status}): ${text || response.statusText}`);
                    }
                    const data = (await response.json());
                    const decision = data.decision ?? 'UNKNOWN';
                    webview.postMessage({
                        type: 'chatResult',
                        decision,
                        prompt,
                        redactedPrompt: data.redacted_prompt ?? null,
                        reason: data.reason ?? null,
                        riskScore: data.risk_score ?? null,
                        aiResponse: data.response ?? null
                    });
                }
                catch (err) {
                    webview.postMessage({
                        type: 'chatResult',
                        error: err?.message ??
                            'Failed to contact AI Privacy Proxy backend at http://localhost:3000/secure-chat.'
                    });
                }
            }
        });
    }
    getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.css'));
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
  <link rel="stylesheet" type="text/css" href="${styleUri}" nonce="${nonce}">
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