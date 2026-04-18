# Azure DevKit

A Claude Code plugin that generates Bicep templates and AKS manifests, debugs AKS, App Service, and Functions failures, audits Azure RBAC, and scaffolds App Service and Azure Functions deployments.

## What it does

- Generates idiomatic Bicep for App Service, Container App, Storage Account, Key Vault, Cosmos DB, and Application Insights, with pinned API versions.
- Diagnoses AKS pod failures, App Service 502s and startup loops, and Functions deployment or trigger issues.
- Audits Azure role assignments and flags Owner, Contributor, and User Access Administrator at subscription scope.
- Generates AKS Kubernetes manifests wired to Azure Workload Identity, the Key Vault CSI secret driver, and Application Gateway Ingress.
- Scaffolds App Service deployment config (web.config on Windows, startup command on Linux) and the `az webapp up` invocation.
- Scaffolds Azure Functions projects in Node, Python, C#, or Java with HTTP, Timer, Queue, or Blob triggers.

## Example

```
> /azure-devkit:az-debug webapp api-frontend rg-staging

Checked App Service api-frontend in rg-staging.
Root cause: 502 Bad Gateway. The container binds to port 3000 but App Service
forwards traffic to port 8080.
Fix: az webapp config appsettings set -g rg-staging -n api-frontend
     --settings WEBSITES_PORT=3000
Then run az webapp restart and tail the logs to confirm the
"didn't respond to HTTP pings" line is gone.
```

## Installation

From the Anthropic plugin marketplace:

```
/plugin install azure-devkit
```

To install from a local directory for development:

```
claude --plugin-dir ./azure-devkit
```

## Commands

All commands are invoked from inside Claude Code with `/azure-devkit:<command>`.

| Command | What it does | Example |
|---|---|---|
| `/azure-devkit:doctor` | Check the local Azure toolchain (az, bicep, func, kubectl). Runs real diagnostic commands, not a prompt. | `/azure-devkit:doctor` |
| `/azure-devkit:whoami` | Show the signed-in identity, active subscription and tenant, and all accessible subscriptions. Read-only. | `/azure-devkit:whoami` |
| `/azure-devkit:full-audit` | One-shot full audit: doctor + whoami + rbac-azure-audit (chained). Opt-in only. | `/azure-devkit:full-audit prod-sub` |
| `/azure-devkit:az-debug` | Diagnose AKS, App Service, or Functions failures. | `/azure-devkit:az-debug webapp api-frontend rg-staging` |
| `/azure-devkit:bicep-template` | Generate a Bicep file for a common Azure resource. | `/azure-devkit:bicep-template app-service api-prod westeurope` |
| `/azure-devkit:rbac-azure-audit` | Audit Azure role assignments at subscription or resource-group scope. | `/azure-devkit:rbac-azure-audit prod-sub` |
| `/azure-devkit:aks-manifest` | Generate AKS manifests with Workload Identity, CSI, and AGIC. | `/azure-devkit:aks-manifest a Node app reading secrets from kv-prod` |
| `/azure-devkit:app-service-deploy` | Scaffold App Service deploy config and az webapp up. | `/azure-devkit:app-service-deploy node linux api-prod rg-prod` |
| `/azure-devkit:functions-scaffold` | Scaffold an Azure Functions project. | `/azure-devkit:functions-scaffold python queue process-orders` |

## Agents

The plugin ships with two subagents that Claude may delegate to automatically when the work fits:

- **azure-forensics**: Azure failure diagnosis across AKS, App Service, Functions, and Container Apps.
- **bicep-author**: Bicep specialist for producing idiomatic, secure templates with pinned API versions.

You can also invoke an agent explicitly:

```
Ask the azure-forensics agent why my App Service keeps restarting.
```

## Hooks

On session start, the plugin runs a small Node.js script that inspects the current working directory for Azure artefacts. If it finds `.bicep` or `.bicepparam` files, `host.json` + `local.settings.json` (Functions), `web.config`, `azure-pipelines.yml`, or an `.azure/` directory, it injects a one-line context note so Claude knows which skills apply without the user having to say so. The hook is silent if nothing matches.

A second hook fires **after every Bash tool call** (`PostToolUse`). It watches for `az deployment group create`, `az webapp create`, `az role assignment create`, and similar state-changing commands, and injects a short follow-up note: what to verify, which skill to run for diagnosis.

Both hooks require Node.js on `PATH`. Without Node, they quietly no-op and every skill and command still works.

## Reference files

A `reference/` directory ships deeper knowledge that skills read only when they need it.

- `reference/built-in-roles.md` is a tiered catalog of Azure built-in roles (Owner, Contributor, User Access Administrator, and workload-specific ones like AcrPull and Storage Blob Data Contributor), with risk ratings, common misuses, and narrower alternatives. The `rbac-azure-audit` skill reads this when it flags a role and needs to suggest a least-privilege replacement.

## Requirements

- Claude Code v2.0 or later.
- Node.js on `PATH` for SessionStart and PostToolUse hooks (any current LTS). If Node is missing, hooks no-op silently; skills and commands still work.
- Azure CLI (`az`) 2.60 or later, signed in with `az login`.
- For AKS work: `kubectl` on `PATH` and a valid kubeconfig (get it with `az aks get-credentials`).
- For Bicep compile and what-if: Bicep CLI bundled with `az` (run `az bicep install` once).
- For Functions scaffolding: Azure Functions Core Tools v4 (`func`) if you want to run locally.

## Safety

All commands follow these rules:

1. Destructive verbs (`az * delete`, `az * stop`, `az role assignment delete`, `az role assignment create`, `az keyvault secret set`, and similar) always require explicit user approval. They are never in `allowed-tools`.
2. Read-only commands (`az account show`, `az webapp show`, `az webapp log tail`, `az aks show`, `az role assignment list`, `az role definition list`) run without prompting because they are safe.
3. The plugin never prints values from `az webapp config appsettings list`, `az keyvault secret show`, or `az functionapp config appsettings list`. It names which keys exist; it does not print values.
4. File writes are announced before they happen so the user can stop them.
5. Bicep generation stops at `az deployment group what-if`. The plugin never runs `deployment group create`.

## Known limitations

- `rbac-azure-audit` inspects assignments and role definitions at the scope you name (subscription, resource group, or resource). It does not traverse management groups or resolve inherited assignments beyond the scope queried.
- `bicep-template` stops at `az deployment group what-if`. The plugin never applies a deployment.
- `functions-scaffold` generates v4 runtime code. Older v1 through v3 runtimes are not supported.
- `aks-manifest` assumes AKS with Workload Identity enabled and an OIDC issuer URL. For kubenet clusters or clusters without Workload Identity, the Workload Identity examples will not apply.
- Version 1.0 does not cover Azure DevOps pipelines, Terraform for Azure, Azure Container Apps revisions, or Logic Apps.

## Development

To iterate locally on the plugin itself:

```
claude --plugin-dir ./azure-devkit
```

Validate the plugin structure:

```
claude plugin validate ./azure-devkit
```

## License

MIT. See `LICENSE`.
