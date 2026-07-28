---
description: Run the full Azure audit pass in one command. Chains doctor, whoami, and rbac-azure-audit into a single report. Use as a pre-release or pre-handoff check to surface environment, identity, and access findings in one pass.
argument-hint: "[subscription-id-or-name]"
allowed-tools: Bash(az account show *) Bash(az account list *) Bash(az ad signed-in-user show *) Bash(az version *) Bash(az bicep version *) Bash(az role assignment list *) Bash(az role definition list *) Bash(func --version *) Bash(kubectl version *) Bash(kubectl config *) Read
---

# Full Azure audit

Run the plugin's audit-flavored skills in sequence and produce one combined report. This is the "do everything" command. Use only when explicitly asked.

## Inputs

`$ARGUMENTS` takes an optional subscription name or ID to audit. Defaults to the currently active subscription. Does NOT switch subscription; uses `--subscription` flag per call.

## Workflow

Run each step. If a step fails, note it and continue.

### Step 1: Environment check (from `doctor`)

Same as `/azure-devkit:doctor`. Report az CLI, Bicep, Functions Core Tools, kubectl versions and availability.

### Step 2: Identity and subscription (from `whoami`)

Same as `/azure-devkit:whoami`. Report signed-in user, active subscription and tenant, all accessible subscriptions.

### Step 3: RBAC audit (from `rbac-azure-audit`)

Same as `/azure-devkit:rbac-azure-audit <scope>`. Report Owner, Contributor, and User Access Administrator assignments at subscription scope. Flag service principals with broad roles.

Cross-reference findings against `reference/built-in-roles.md` for alternative narrower roles when suggesting fixes.

## Output format

```
Azure full audit
================
Subscription: Contoso-Production (11111111-...)
Tenant:       66666666-...       Signed in as: jane.doe@contoso.com

Environment
-----------
az CLI:          2.62.0
Bicep:           0.27.1
Functions Core:  4.0.5665
kubectl:         v1.30.2 (context: aks-prod-eastus)

Identity
--------
Signed in as:    jane.doe@contoso.com (user)
Subscriptions:   3 accessible (1 default)

RBAC findings
=============
Critical (1):
- sp-github-deployer has Owner at subscription scope. Review whether it can use Contributor only on its target resource group; separate RBAC administration only when it is a documented duty.

High (3):
- 4 Owner assignments total at subscription scope (2 users, 2 service principals)
- A service principal has Contributor at subscription scope. Confirm its business owner and whether the scope can be reduced.

Medium (2):
- Custom role "AllAccess" has "*" in Actions and assigned to 2 principals
- 12 principals have Reader at subscription scope (review: do they all still need it?)

Suggested next steps
--------------------
1. After owner approval and a successful workload test, replace Owner on sp-github-deployer with the minimum role set on rg-prod-apps.
2. Inventory the service principal's workload before proposing a narrower replacement role.
3. Review credential age separately in Entra ID or the workload's credential inventory; this command does not query it.

Reference
---------
For narrower alternatives to flagged roles, see `reference/built-in-roles.md` in this plugin.
```

If no concerns:

```
Azure full audit
================
Subscription: Contoso-Production

Nothing of concern found. No broad RBAC at subscription scope and all custom roles have explicit action lists.
```

## Do not

- Do not run state-changing commands (`az role assignment create`, `az role assignment delete`, etc.).
- Do not switch active subscription with `az account set`. Audit the one named in `$ARGUMENTS` via `--subscription`, but do not change context.
- Do not include the full output of each skill. Keep the combined report under 80 lines.
- Do not infer service-principal last use, credential age, or PIM eligibility. Those require separate Entra ID, sign-in-log, or PIM data that this command does not query.
