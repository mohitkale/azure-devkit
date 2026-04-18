---
description: Check the local Azure toolchain. Reports az CLI version, active subscription and tenant, Bicep CLI version, Azure Functions Core Tools version, and kubectl context if AKS is in use. Use before running any Azure skill to confirm the environment is ready.
allowed-tools: Bash(az account show *) Bash(az version *) Bash(az bicep version *) Bash(func --version *) Bash(kubectl version *) Bash(kubectl config *)
---

# Azure environment check

Run a fixed diagnostic of the local Azure toolchain.

## Steps

1. Azure CLI installed and signed in:

```bash
az account show --query "{subscription:name, id:id, tenant:tenantId, user:user.name}" -o table
```

If that fails with "Please run 'az login'", report the user as **not signed in** and suggest `az login`. Continue with remaining steps that do not need an active subscription.

2. Azure CLI and extension versions:

```bash
az version --output json
```

Parse the output and report `"azure-cli"` and the count of installed extensions.

3. Bicep CLI version:

```bash
az bicep version 2>&1
```

If missing, note that `az bicep install` is a one-time fix.

4. Azure Functions Core Tools (only report if present):

```bash
func --version 2>&1
```

Report the version. If not installed, mention it is only needed for local Functions development.

5. AKS / kubectl (only report if the user is working with AKS):

```bash
kubectl config current-context 2>&1
kubectl version --client --output=yaml 2>&1 | head -10
```

If kubectl is missing or the context is not an AKS context, skip.

## Output format

```
Azure environment
-----------------
az CLI:           2.62.0, 3 extensions
Signed in as:     someone@example.com
Subscription:     Pay-As-You-Go (12345678-....)
Tenant:           abcdef12-....
Bicep:            0.27.1
Functions Core:   4.0.5665 (optional)
kubectl context:  aks-prod (optional)

Next steps: environment looks healthy. Try:
- /azure-devkit:bicep-template <resource>
- /azure-devkit:az-debug webapp <name> <rg>
- /azure-devkit:rbac-azure-audit <scope>
```

If anything is missing, print the exact error and a one-line fix hint.

## Do not

- Do not print values from `az keyvault secret show`, `az webapp config appsettings list`, or any secret-bearing output.
- Do not run destructive verbs (`delete`, `stop`, `role assignment create`, `role assignment delete`).
- Do not change the active subscription with `az account set`. Report the current one and let the user switch if needed.
