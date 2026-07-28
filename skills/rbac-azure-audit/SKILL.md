---
name: rbac-azure-audit
description: Audit Azure role assignments for overly broad permissions. Use when the user asks to review who has access to a subscription or resource group, flag Owner, Contributor, or User Access Administrator grants at subscription scope, or enforce least privilege on Azure RBAC.
argument-hint: "[subscription-id-or-name] [scope]"
allowed-tools: Bash(az role assignment list *) Bash(az role definition list *) Read Grep
---

# Audit Azure RBAC

Review Azure role assignments and flag overly broad permissions.

## Inputs

`$ARGUMENTS` is an optional subscription id or name, and an optional scope. Examples:

- (empty): audit the current subscription at subscription scope.
- `00000000-0000-0000-0000-000000000000`: audit that subscription.
- `my-sub /subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-prod`: audit a specific resource group.

If `$ARGUMENTS` is empty, run `az account show` first and confirm which subscription to audit.

## Workflow

### Step 1: inventory

```bash
az account show --query "{name:name, id:id, tenant:tenantId}" -o table
az role assignment list --all -o table
```

For a specific resource group:

```bash
az role assignment list --resource-group <rg> -o table
```

For a specific resource:

```bash
az role assignment list --scope <resource-id> -o table
```

### Step 2: flag broad built-in roles

Look for any assignment where `roleDefinitionName` is in this list and `scope` is a subscription or management group:

| Role | Why it is risky |
|---|---|
| `Owner` | Full management plus RBAC assignment rights. |
| `Contributor` | Full management (no RBAC). Can still create Owner via Managed Identity pivots. |
| `User Access Administrator` | Can grant any role to anyone. Often a precursor to privilege escalation. |
| `Role Based Access Control Administrator` | Same concern as above with fewer other rights. |
| `Reservation Purchaser` | Can commit spend. |
| `Access Review Operator Service Role` | Can approve access reviews. |

Also flag:

- Assignments where `principalType` is `Group` and the group is `All Users` or a similarly broad group.
- Assignments with `principalType: ForeignGroup` from an unexpected tenant.
- Assignments to the service principal `Microsoft.Graph` or any first-party app with a subscription-scope role.

### Step 3: inspect custom roles

```bash
az role definition list --custom-role-only true -o json
```

For each custom role, read the `permissions` block. Red flags:

- `actions: ["*"]` or `dataActions: ["*"]`.
- `actions: ["Microsoft.Authorization/*/write"]` outside a legitimate RBAC admin role.
- `actions: ["Microsoft.KeyVault/vaults/secrets/*"]` for anyone who is not an application identity that needs secret access.
- `notActions` lists that are suspiciously short. A legitimate least-privilege role usually has `actions` enumerated, not `actions: ["*"]` with a few exclusions.

### Step 4: classic administrators

Classic administrators still exist on subscriptions migrated from ASM. Pull them:

```bash
az role assignment list --include-classic-administrators -o table
```

Classic Co-Administrators have Owner-equivalent rights and should be removed unless there is a documented reason.

### Step 5: enumerate assignments for a single principal

If the user asks about a specific service principal or user:

```bash
az role assignment list --assignee <objectId-or-upn> --all -o table
```

## Output

Group findings by severity.

```
## Critical
- <principal> has <role> at <scope>. <impact>. <fix>.

## High
- <...>

## Medium
- <...>

## Info
- <count> role assignments total. <count> custom roles in use.
```

For every finding, include:

- `principalName` and `principalType` (User, Group, ServicePrincipal, ManagedIdentity).
- `roleDefinitionName`.
- `scope` (full resource id).
- Why this is risky in one sentence.
- The replacement role or command to remove the assignment.

## Example finding

**Critical**: Service principal `ci-pipeline` (ObjectId `aaaa-bbbb-cccc`) holds `Owner` at subscription scope `/subscriptions/11111111-1111-1111-1111-111111111111`. A compromise of the CI pipeline service principal would grant full control of every resource in the subscription, including the ability to create new role assignments.

Replacement:

1. Grant only the roles CI needs per resource group. Typical CI pipelines need:
   - `Contributor` on the target resource group (or a narrower custom role).
   - `AcrPush` on the container registry resource.
   - `Key Vault Secrets User` on the key vault that stores deployment secrets.

2. Remove the Owner assignment after the narrower roles are in place:

```bash
# Confirm first. Dry-run by listing only:
az role assignment list --assignee ci-pipeline --role Owner --scope /subscriptions/11111111-1111-1111-1111-111111111111 -o table

# After user approval, remove the specific assignment id:
az role assignment delete --ids <assignment-id>
```

Do not remove the Owner grant until the new narrower roles are active and the CI pipeline has run successfully at least once.

## Common fixes

- Replace `Owner` at subscription scope with `Contributor` on a specific resource group plus a separate role for RBAC if actually needed.
- Replace `Contributor` at subscription scope with resource-group-scoped assignments per team.
- Replace `User Access Administrator` with `Role Based Access Control Administrator` scoped to the specific resource groups the principal manages.
- Replace a custom role with `actions: ["*"]` with a built-in role that matches the intent, or an explicit enumerated list.
- Move human Owner assignments to a Privileged Identity Management (PIM) eligible assignment.

## Reference

When flagging a broad built-in role, consult `reference/built-in-roles.md` in the plugin root for narrower alternatives. It is a tiered catalog (Tier 1 stop-the-world, Tier 2 data-plane, Tier 3 workload, Tier 4 read-only) with risk ratings and recommended replacements. Read on-demand only when suggesting a fix.

## Do not

- Do not call `az role assignment delete` or `az role assignment create` as part of the audit. Only call `list` variants. All mutations require explicit user approval.
- Do not print principal object ids alongside tenant ids in a way that would be useful to an attacker. Mask or truncate when sharing output externally.
- Do not assume a role is safe by name. `Reader` sounds harmless but includes `Microsoft.Storage/storageAccounts/listKeys/action` in some older custom variants. Always read the rule list for custom roles.
