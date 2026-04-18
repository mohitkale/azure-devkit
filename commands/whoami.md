---
description: Show the current Azure identity, active subscription and tenant, and available subscriptions. Use before any operation that changes cloud state so the user confirms they are pointing at the right subscription. Does not change state.
allowed-tools: Bash(az account show *) Bash(az account list *) Bash(az ad signed-in-user show *)
---

# Who am I in Azure right now?

Report the signed-in identity, active subscription and tenant, and the full list of subscriptions the user has access to. Read-only. Use this before running any state-changing Azure operation.

## Steps

1. Active subscription:

```bash
az account show --query "{subscription:name, id:id, tenant:tenantId, user:user.name, env:environmentName}" -o json
```

If this fails with "Please run 'az login'", report that the user is not signed in. Suggest `az login` and stop.

2. Signed-in user details (UPN, object id):

```bash
az ad signed-in-user show --query "{upn:userPrincipalName, displayName:displayName, objectId:id, mail:mail}" -o json 2>&1
```

This may fail if the signed-in principal is a service principal rather than a user. If that is the case, report the SP id from step 1 and move on.

3. All subscriptions the user can switch to:

```bash
az account list --query "[].{name:name, id:id, state:state, isDefault:isDefault}" -o table
```

## Output format

```
Azure identity
--------------
Signed in as:     jane.doe@contoso.com
Display name:     Jane Doe
Object id:        aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

Active subscription
-------------------
Name:             Contoso-Production
ID:               11111111-2222-3333-4444-555555555555
Tenant:           66666666-7777-8888-9999-000000000000
Environment:      AzureCloud

Available subscriptions (3)
---------------------------
* Contoso-Production        11111111-... (default)
  Contoso-Staging           22222222-... (enabled)
  Contoso-Dev-Sandbox       33333333-... (disabled)
```

End with a one-line prompt: `To switch: az account set --subscription "<name-or-id>"`. Do not run it automatically.

## Do not

- Do not run `az account set`. Switching subscriptions is a state change the user should do explicitly.
- Do not print secret values from the environment.
- Do not re-authenticate. If the user is not signed in, tell them to run `az login` themselves.
