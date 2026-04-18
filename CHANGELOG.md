# Changelog

All notable changes to this plugin are documented here.

The format is based on Keep a Changelog, and this plugin uses semantic versioning.

## [1.0.1] - 2026-04-19

### Added

- `PRIVACY.md` with data-handling disclosure for marketplace submission (Claude Code, local hooks, GitHub hosting, Anthropic product terms).

## [1.0.0] - 2026-04-18

### Added

- Initial release.
- Skill `az-debug`: diagnose AKS, App Service, and Functions failures.
- Skill `bicep-template`: generate idiomatic Bicep for common Azure resources.
- Skill `rbac-azure-audit`: audit Azure role assignments for broad permissions.
- Skill `aks-manifest`: generate AKS-tailored Kubernetes manifests.
- Skill `app-service-deploy`: scaffold App Service deployment configuration.
- Skill `functions-scaffold`: scaffold Azure Functions projects.
- Agent `azure-forensics`: specialized Azure failure diagnosis.
- Agent `bicep-author`: specialized Bicep template writer.
- Command `doctor`: real toolchain check. Reports az CLI version, active subscription and tenant, Bicep CLI version, and Functions Core Tools version.
- Hook `session-start`: Node.js detector that inspects cwd for `.bicep` files, Functions `host.json` + `local.settings.json`, `web.config`, `azure-pipelines.yml`, or `.azure/`. Injects a one-line context note so Claude knows which skills apply.
- Command `whoami`: read-only identity report. Shows signed-in user, active subscription and tenant, and all accessible subscriptions.
- Hook `post-tool-use`: PostToolUse hook that reacts to `az deployment group create`, `az webapp/aks/functionapp create`, `az role assignment create/delete`, and similar state-changing commands with a short follow-up note.
- Tests: `tests/run.js` with fixture directories that invoke the SessionStart hook against synthetic cwds and assert expected output.
- CI: `.github/workflows/validate.yml` runs required-file checks, plugin.json parse, skill/agent/command frontmatter, hook script syntax, em-dash scan, and the hook fixture tests on every push and PR.
- Reference file `reference/built-in-roles.md`: tiered catalog of Azure built-in roles (Owner, Contributor, User Access Administrator, workload-specific ones like AcrPull, Storage Blob Data Contributor, Key Vault Administrator) with risk ratings, common misuses, and narrower alternatives. Read by `rbac-azure-audit` on-demand only.
- Command `full-audit`: opt-in workflow command that chains doctor, whoami, and rbac-azure-audit into one combined report. Read-only.
