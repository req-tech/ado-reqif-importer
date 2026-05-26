# Azure DevOps Extension Development Guide

Quick reference for building, packaging, and publishing Azure DevOps web extensions.

---

## 1. Prerequisites

- **Node.js** (LTS version recommended)
- **TFX CLI** — packaging tool: `npm install -g tfx-cli`
- A **Marketplace publisher account** (see Step 3)

---

## 2. Create the Extension

```bash
mkdir my-extension && cd my-extension
npm init -y
npm install azure-devops-extension-sdk --save
```

Create **`vss-extension.json`** at the root:

```json
{
    "manifestVersion": 1,
    "id": "my-extension",
    "publisher": "<your-publisher-id>",
    "version": "1.0.0",
    "name": "My Extension",
    "description": "A short description (max 200 chars)",
    "public": false,
    "categories": ["Azure Repos"],
    "targets": [{ "id": "Microsoft.VisualStudio.Services" }],
    "scopes": ["vso.work", "vso.code_write"],
    "icons": { "default": "images/logo.png" },
    "contributions": [
        {
            "id": "my-hub",
            "type": "ms.vss-web.hub",
            "targets": ["ms.vss-code-web.code-hub-group"],
            "properties": {
                "name": "My Hub",
                "uri": "my-hub.html"
            }
        }
    ],
    "files": [
        { "path": "my-hub.html", "addressable": true },
        { "path": "node_modules/azure-devops-extension-sdk", "addressable": true, "packagePath": "lib" }
    ]
}
```

> Keep `"public": false` during development. Set `"public": true` only when ready to list publicly.

Create the hub HTML page (**`my-hub.html`**) and initialise the SDK:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/require.js/2.3.6/require.min.js"></script>
<script>
    requirejs.config({ paths: { 'SDK': './lib/SDK.min' } });
    requirejs(['SDK'], function(SDK) {
        SDK.init();
        SDK.ready().then(function() {
            // extension is ready
        });
    });
</script>
```

> For production use **webpack** with ES module imports (`import * as SDK from "azure-devops-extension-sdk"`) instead of RequireJS. See the [sample repo](https://github.com/Microsoft/azure-devops-extension-sample).

---

## 3. Create a Marketplace Publisher

1. Sign in to the [Marketplace Publishing Portal](https://marketplace.visualstudio.com/manage/createpublisher?managePageRedirect=true).
2. Select **+ Create a publisher**.
3. Set a unique **publisher ID** (e.g. `mycompany-myteam`) — this goes in `vss-extension.json` as `"publisher"`.
4. Accept the [Marketplace Publisher Agreement](https://aka.ms/vsmarketplace-agreement).

---

## 4. Package the Extension

```bash
npx tfx-cli extension create
```

Outputs a `.vsix` file (e.g. `mycompany-myteam.my-extension-1.0.0.vsix`).

> Use `--rev-version` to auto-increment the patch version and save it to the manifest.

If the `.vsix` exceeds **50 MB**:
- Deduplicate shared dependencies
- Fetch large tools at runtime (tool installer library)
- Tree-shake with webpack

---

## 5. Publish & Share

1. Open the [Marketplace Management Portal](https://aka.ms/vsmarketplace-manage).
2. Select your publisher → **New extension** → **Azure DevOps**.
3. Drag and drop the `.vsix` file and click **Upload**.
4. Right-click the extension → **Share/Unshare** → add your organization name to test it privately.
5. Install from the Marketplace into your organization: find the extension → **Get it free** → select org → **Install**.

---

## 6. Debugging

Add `baseUri` to the manifest to load from a local dev server (avoids redeploying on each change):

```json
{
    "baseUri": "https://localhost:44300"
}
```

> The local server **must use SSL** — Azure DevOps requires HTTPS for extension iframes.

---

## 7. Updating

```bash
# bump version, repackage, then upload via the portal
npx tfx-cli extension create --rev-version
```

Maintain two extensions during development:
- `publisher.extension` — public / production
- `publisher.extension-dev` — private, shared with your org only

---

## 8. Key Contribution Points

### Hub Groups (where to add a new page/tab)

| Area | Target ID |
|---|---|
| Azure Boards | `ms.vss-work-web.work-hub-group` |
| Azure Repos | `ms.vss-code-web.code-hub-group` |
| Azure Pipelines | `ms.vss-build-web.build-release-hub-group` |
| Azure Test Plans | `ms.vss-test-web.test-hub-group` |
| Project settings | `ms.vss-web.project-admin-hub-group` |
| Org settings | `ms.vss-web.collection-admin-hub-group` |

### Common Menu Targets

| Location | Target ID |
|---|---|
| Completed build menu | `ms.vss-build-web.completed-build-menu` |
| Work item toolbar | `ms.vss-work-web.work-item-toolbar-menu` |
| Git pull request actions | `ms.vss-code-web.pull-request-action-menu` |
| Git PR tabs | `ms.vss-code-web.pr-tabs` |
| Backlog item menu | `ms.vss-work-web.backlog-item-menu` |

### Other Extension Types
- **Dashboard widget** — `ms.vss-web.widget`
- **Pipeline task** — `ms.vss-distributed-task.task`
- **Work item form tab/section** — extend the work item form

---

## 9. Scopes Reference (common)

| Scope | Access |
|---|---|
| `vso.work` | Work items (read) |
| `vso.work_write` | Work items (read + write) |
| `vso.code` | Code (read) |
| `vso.code_write` | Code (read + write) |
| `vso.build` | Build artifacts (read) |
| `vso.build_execute` | Build (read + queue) |
| `vso.project` | Projects/teams (read) |
| `vso.extension.data_write` | Extension storage (read + write) |

---

## Reference Links

| Topic | URL |
|---|---|
| Get started: Develop a web extension | https://learn.microsoft.com/en-us/azure/devops/extend/get-started/node?view=azure-devops |
| Package and publish extensions | https://learn.microsoft.com/en-us/azure/devops/extend/publish/overview?view=azure-devops |
| Extension manifest reference | https://learn.microsoft.com/en-us/azure/devops/extend/develop/manifest?view=azure-devops |
| Contribution model | https://learn.microsoft.com/en-us/azure/devops/extend/develop/contributions-overview?view=azure-devops |
| Extensibility points (all targets) | https://learn.microsoft.com/en-us/azure/devops/extend/reference/targets/overview?view=azure-devops |
| Extension SDK API reference | https://learn.microsoft.com/en-us/javascript/api/azure-devops-extension-sdk/ |
| Extension REST API reference | https://learn.microsoft.com/en-us/javascript/api/azure-devops-extension-api/ |
| Sample extension (GitHub) | https://github.com/Microsoft/azure-devops-extension-sample |
| Developer portal (theming, SDK) | https://developer.microsoft.com/azure-devops/develop/extensions |
| Marketplace management portal | https://marketplace.visualstudio.com/manage/publishers |
