# Shareable CAIL prototype on Netlify — public rehearsal

## Two separate deployment modes (important)

- **Local full prototype:** Windows Docker Compose + FastAPI + local Ollama/Qwen,
  reviewer-authenticated Knowledge Tree, Operations Lab, and audit persistence.
  Access using \`http://localhost:5173/#/chat\`.
- **Netlify public demo:** a separate frontend-only build with the exact same
  animated ATM chat/map component and deliberately bundled fictional
  monitoring snapshots. **No backend, AI model, real ATM/GPS, CAIL Suite,
  HPE NonStop connection, persistence, or independent reviewer approval.**
  The public site must never accept expert/reviewer keys. No fake approved
  Decision DNA is seeded: approved match list is empty. This rehearsal is
  for judges to scan a QR code and interact with the idea from any phone.

## Easiest deployment: manual Netlify Drop (no Git integration needed)

1. On Windows, go to \`C:\Users\ritvi\Projects\CAIL-LEGACY-NonStop-AI\`
   and switch to \`feat/cail-atm-wow-demo\`, then pull the latest commit.
2. Open PowerShell:

   \`\`\`powershell
   Set-Location "$HOME\Projects\CAIL-LEGACY-NonStop-AI\frontend"
   npm ci
   if ($LASTEXITCODE -ne 0) { throw "Install failed" }
   npm run build:netlify
   if ($LASTEXITCODE -ne 0) { throw "Netlify build failed" }
   \`\`\`

3. Sign in at https://app.netlify.com/ , open **Add new project →
   Deploy manually** (or https://app.netlify.com/drop), and upload the
   **\`frontend/dist\`** folder. Upload \`dist\`, not the repository or
   private \`.env\`.
4. Netlify will show an assigned public \`https://...netlify.app/\` URL.
   Open it in an incognito/private tab and test on your phone. Rename the
   site in Netlify project/domain settings if desired; verify availability.
5. Manual deploy does **not** automatically update with new Git commits.
   Rebuild \`dist\` and drop it onto the same site to publish updates.

## Automatic deploy: connect the private GitHub repo

When ready for continuous deployment, choose **Add new project → Import
an existing project → GitHub**, authorize Netlify for
\`naramritvij/CAIL-LEGACY-NonStop-AI\`, and ensure branch
**\`feat/cail-atm-wow-demo\`** is selected until PR #16 is merged. Do not
deploy current \`main\`, which may not include this feature yet. The
root \`netlify.toml\` defines:

| Setting | Value |
|---|---|
| Base directory | \`frontend\` |
| Build command | \`npm run build:netlify\` |
| Publish directory (relative to base) | \`dist\` |
| Node version | \`22\` |
| Build environment | \`VITE_CAIL_PUBLIC_DEMO=1\`, \`VITE_LEGACY_DATA_MODE=mock\` |

If GitHub permissions need approval, the repository owner must authorize
the Netlify GitHub application. After merging the feature, update the
Netlify production branch to \`main\` if desired. Never connect the
public site to the private/local backend using an exposed Vite env
credential; all \`VITE_*\` values are baked into public browser assets.

## Smoke test on the shared URL

- Send **"Which ATM is broken, and where is it?"** to animate the
  6-node fictional map and highlight red ATM-042.
- Send **"Show ATM-042 PATHCOM and CPU evidence"** to see engineer
  wording and synthetic source records. PATHCOM must be **UNKNOWN**.
- Click a green ATM marker; it must report **no synthetic alert**,
  not real-world health.
- Ask **"Restart ATM-042 now"**; the assistant must refuse with
  no map/native tool execution.
- Ask **"How does atmospheric pressure work?"**; no ATM should be invented.
- View on mobile (QR code target) and in a private browser.

**Purpose:** a freely shareable, self-contained investor walkthrough.
It does not prove operational productivity improvements or replace
full live/localhost technical validation.
