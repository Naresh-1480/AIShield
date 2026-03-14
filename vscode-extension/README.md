## AI Privacy Guard VS Code Extension

**AI Privacy Guard** is a VS Code sidebar chat panel that routes all prompts through your existing **AI Privacy Proxy (Shadow AI Protection)** backend before any AI call is made.

The extension talks only to your backend at `http://localhost:3000/secure-chat`. The backend is responsible for scanning prompts, enforcing policy, and calling the Featherless.ai API as needed.

### Features

- **Sidebar chat panel**
  - Activity bar container: `AI Privacy Guard`
  - View: shows prompt textarea, send button, status indicator, scanner decision, and chat history of user / scanner / AI.
- **Secure flow**
  1. User types prompt in the sidebar.
  2. Extension sends `POST http://localhost:3000/secure-chat`:
     ```json
     { "prompt": "<user prompt>" }
     ```
  3. Backend scanner decides:
     - `ALLOW`
     - `REDACT`
     - `BLOCK`
  4. Webview updates UI:
     - **BLOCK**: show blocked state and reason, no AI response.
     - **REDACT**: show sanitized prompt and AI response.
     - **ALLOW**: show AI response.

### Project structure

```text
vscode-extension
├─ package.json
├─ tsconfig.json
├─ src
│  └─ extension.ts
├─ media
│  ├─ chat.html
│  ├─ chat.js
│  └─ chat.css
└─ README.md
```

### Developer setup

1. **Install dependencies**

   ```bash
   cd vscode-extension
   npm install
   ```

2. **Run your backend and ML service**

   From the main project root:

   - Start Node backend (scanner + `/secure-chat` endpoint):

     ```bash
     node backend/server.js
     ```

   - Start Python ML service (for PII + intent detection), using your existing entrypoint (for example):

     ```bash
     cd ml-service
     python app.py
     ```

3. **Build the extension**

   ```bash
   cd vscode-extension
   npm run compile
   ```

4. **Run the extension in VS Code**

   - Open the `vscode-extension` folder in VS Code.
   - Press `F5` to launch the Extension Development Host.
   - In the dev host:
     - Click the **AI Privacy Guard** icon in the activity bar, or
     - Run command: **AI Privacy Guard: Open AI Privacy Guard Chat** (`aiPrivacyGuard.openChat`).

5. **Use the chat**

   - Type a prompt and press **Send**.
   - The status and decision indicators show:
     - SAFE → AI response.
     - REDACTED → sanitized prompt + AI response.
     - BLOCKED → reason only.

