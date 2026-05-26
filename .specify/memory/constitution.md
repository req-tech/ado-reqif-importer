<!--
SYNC IMPACT REPORT
==================
Version change: [template] → 1.0.0
Added sections:
  - Core Principles (I–V)
  - Technology Stack
  - Development Workflow
  - Governance
Modified principles: N/A (initial authoring from template)
Removed sections: all placeholder bracket tokens
Templates reviewed:
  - .specify/templates/plan-template.md   ✅ Constitution Check section present; references gates dynamically — no update needed
  - .specify/templates/spec-template.md   ✅ Structure compatible; no ADO-specific constraints required in template
  - .specify/templates/tasks-template.md  ✅ Phase structure compatible with ADO extension project type
Follow-up TODOs: none — all placeholders resolved
-->

# ADO ReqIF Importer Constitution

## Core Principles

### I. Native Azure DevOps Only (NON-NEGOTIABLE)

The extension MUST use exclusively the official Azure DevOps Extension SDK
(`azure-devops-extension-sdk`) and the Azure DevOps Extension API
(`azure-devops-extension-api`) for all host communication, authentication,
and data storage. No calls to external web services, third-party REST APIs,
or non-Microsoft cloud endpoints are permitted. All persistent state MUST
be stored in the ADO Extension Data Service or as ADO work items/attachments.
Any feature proposal that requires an external service dependency MUST be
rejected at design review.

### II. ReqIF Fidelity

The ReqIF parser MUST implement the ReqIF 1.0/1.2 standard completely.
Every ReqIF attribute type (`XHTML`, `STRING`, `INTEGER`, `REAL`, `BOOLEAN`,
`DATE`, `ENUMERATION`), hierarchy level, cross-reference, and relationship
MUST be represented in the import output. Lossy transformations are
prohibited — if a ReqIF construct cannot be mapped to an ADO work item field,
it MUST be preserved as a structured extension attribute or attachment,
never silently dropped. The parser MUST be implemented as a pure
TypeScript module with no native/binary dependencies.

### III. Test-First (NON-NEGOTIABLE)

TDD is mandatory. The Red-Green-Refactor cycle MUST be strictly enforced:
tests are written and reviewed before implementation begins. No pull request
may introduce production code that does not have corresponding passing unit
tests. The ReqIF parser, ADO API integration layer, and all UI components
MUST have dedicated test suites. Test coverage gates: unit ≥ 80 %,
integration ≥ 60 % on critical import paths.

### IV. Latest Stack Only

The project MUST target the latest stable release of all frameworks and APIs
at the time of each feature's implementation. Specifically:
- TypeScript with `strict: true` — no `any` escapes without explicit
  justification comment.
- `azure-devops-extension-sdk` and `azure-devops-extension-api` at their
  latest published npm versions.
- Webpack (or esbuild) for bundling; ES modules throughout — no CommonJS.
- The legacy VSS SDK (`vss-web-extension-sdk`) is **banned**.
- Node.js LTS version as the build-time runtime.
Dependencies MUST be reviewed and upgraded at the start of each sprint.

### V. Azure DevOps Cloud Only

The extension targets `Microsoft.VisualStudio.Services.Cloud` exclusively.
Azure DevOps Server / on-premises support is out of scope and MUST NOT be
added without a formal constitution amendment. The manifest MUST specify:

```json
{ "targets": [{ "id": "Microsoft.VisualStudio.Services.Cloud" }] }
```

All REST API calls MUST use the current Azure DevOps Services API version.
No version-pinning below the current released version is permitted.

## Technology Stack

| Concern | Choice |
|---|---|
| Language | TypeScript 5.x, `strict: true` |
| Extension SDK | `azure-devops-extension-sdk` (latest) |
| Extension API | `azure-devops-extension-api` (latest) |
| Bundler | Webpack 5 with ts-loader |
| Testing | Jest + ts-jest |
| ReqIF parsing | Custom pure-TS parser (no external parser lib) |
| Linting | ESLint with `@typescript-eslint` |
| Formatting | Prettier |
| Packaging | `tfx-cli` (TFX) |
| CI | GitHub Actions |
| Target platform | Azure DevOps Services (cloud) |
| External services | **None** |

All dependencies MUST be declared in `package.json`. No CDN script tags
in production HTML — all assets MUST be bundled and shipped inside the
`.vsix` package. The bundled `.vsix` MUST remain under 50 MB; tree-shaking
and code-splitting are REQUIRED if the limit is approached.

## Development Workflow

1. **Feature branch** — every feature starts from a branch named
   `###-short-description` (created by `/speckit.git.feature`).
2. **Spec first** — a `spec.md` MUST be authored and reviewed before any
   code is written (`/speckit.specify` → `/speckit.clarify` → approval).
3. **Plan before implement** — `/speckit.plan` produces `plan.md` and a
   `Constitution Check` gate that MUST pass before implementation starts.
4. **TDD** — tests written before production code (Principle III).
5. **Two-extension strategy** — maintain a private `ado-reqif-importer-dev`
   for development and the public `ado-reqif-importer` for releases.
   Separate `vss-extension.json` files; shared source tree.
6. **Private until ready** — `"public": false` in the manifest until the
   feature is stable and passing all acceptance tests.
7. **SSL required for local dev** — `baseUri` in the debug manifest MUST
   point to `https://localhost:*`. HTTP is banned for extension iframes.
8. **Version bump** — use `--rev-version` with `tfx-cli` on every package;
   the `version` field in `vss-extension.json` MUST follow `MAJOR.MINOR.PATCH`.

## Governance

This constitution supersedes all other development practices for the
ADO ReqIF Importer project. Amendments require:
1. A written rationale describing the problem the amendment solves.
2. Review and approval by at least one other project contributor.
3. Version bump according to semantic rules (see below).
4. Update of this file via a dedicated commit (`docs: amend constitution`).

**Versioning policy**:
- MAJOR — removal or redefinition of a Core Principle.
- MINOR — new principle, section, or material expansion of guidance.
- PATCH — clarifications, wording, non-semantic refinements.

All pull requests MUST include a "Constitution Check" confirmation that the
changes comply with every active principle. Any PR that violates a principle
is blocked until either the code is corrected or the constitution is amended.

For extension development reference see `docs/ado-extension-guide.md`.

**Version**: 1.0.0 | **Ratified**: 2026-05-26 | **Last Amended**: 2026-05-26
