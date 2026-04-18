# Azure built-in roles, risk tiers, and least-privilege alternatives

A fast lookup for the Azure built-in roles the `rbac-azure-audit` skill commonly flags. Each entry lists what the role can do, why it is risky at subscription scope, and the narrower role that usually satisfies the same use case.

Read this file from `rbac-azure-audit` only when a flagged assignment needs an alternative suggestion.

## Tier 1: stop-the-world roles (flag at any scope above single resource)

These grant full control or the ability to grant control to others. Never assign at subscription or management-group scope to a runtime identity.

### Owner

- **Permissions**: everything, plus manage role assignments.
- **Why flag**: can escalate to any other role. A compromised principal with Owner is a full subscription compromise.
- **Common misuse**: granted to CI pipeline identities for convenience.
- **Alternatives**: `Contributor` if the pipeline genuinely needs to create and delete resources; a custom role with just the resource types it touches, plus `User Access Administrator` restricted to a specific resource group if it must grant RBAC.

### User Access Administrator

- **Permissions**: manage access to Azure resources (but not the resources themselves).
- **Why flag**: pairs with any read role to become Owner-equivalent (read resources, grant self Contributor, edit resources).
- **Common misuse**: assigned to a central ops group that then quietly grants itself Contributor everywhere.
- **Alternatives**: `Role Based Access Control Administrator` at a resource group scope; custom role restricted to a specific role definition.

### Contributor

- **Permissions**: full management of resources, but cannot manage RBAC.
- **Why flag**: can delete all resources in scope. Costs money and causes outages. Can also re-create a resource with a different identity attached.
- **Common misuse**: default for dev-subscription service principals.
- **Alternatives**: resource-type-specific Contributor roles (`Website Contributor`, `Storage Account Contributor`, `Virtual Machine Contributor`, `Cosmos DB Account Contributor`). Much narrower.

## Tier 2: data-plane roles (context-dependent)

Risky when assigned broadly, fine when scoped to a single resource.

### Storage Blob Data Owner / Storage Blob Data Contributor

- **Storage Blob Data Owner**: read, write, delete blobs, plus manage POSIX-style ACLs.
- **Storage Blob Data Contributor**: read, write, delete blobs.
- **Storage Blob Data Reader**: read blobs only.
- **Flag**: Owner at subscription scope. Reader or Contributor at specific storage account scope is usually fine.

### Key Vault Administrator

- **Permissions**: all data-plane and control-plane for a Key Vault.
- **Flag**: anywhere. Almost always overbroad.
- **Alternatives**: `Key Vault Secrets User` (read secret values), `Key Vault Secrets Officer` (manage secrets), `Key Vault Crypto User` (encrypt and decrypt). Pick the one that matches the workload.

### Cosmos DB Account Reader Role

- **Permissions**: read metadata and connection strings for a Cosmos DB account.
- **Nuance**: does not grant data-plane access. For data, use the built-in data roles or custom data-plane RBAC.
- **Flag**: when the assignment is at a subscription scope and the principal only needs one account.

## Tier 3: management-plane workload roles (usually fine, verify scope)

These are designed for specific workloads. Flag only if the scope is wider than the workload.

### AcrPull / AcrPush

- **AcrPull**: pull images from a container registry.
- **AcrPush**: push images.
- **Scope rule**: always at the registry resource scope, never subscription.

### AKS-related roles

- **Azure Kubernetes Service Cluster Admin Role**: cluster-admin kubeconfig.
- **Azure Kubernetes Service Cluster User Role**: a user kubeconfig (still needs in-cluster RBAC for actual permissions).
- **Azure Kubernetes Service RBAC Admin**: admin on the AKS RBAC (Azure AD integrated).
- **Azure Kubernetes Service RBAC Cluster Admin**: cluster admin on AAD-integrated RBAC.
- **Scope rule**: at the specific AKS cluster. Never subscription.

### Network Contributor

- **Permissions**: manage all networking (VNets, NSGs, route tables, public IPs).
- **Flag**: at subscription scope. Can redirect traffic and exfiltrate from private endpoints.
- **Alternative**: scope to the specific resource group that holds the VNet.

## Tier 4: read-only roles

Generally safe, but some are broader than people expect.

### Reader

- **Permissions**: read all resource metadata.
- **Quiet risk**: can read storage account primary keys from the ARM API (they are metadata). Treat with respect.
- **Alternative**: resource-type-specific readers (`Website Reader`, `Storage Account Key Operator Service Role` is broader despite the name; just use `Reader` scoped narrowly).

### Monitoring Reader

- **Permissions**: read logs and metrics across subscription.
- **Safe**: usually, for dashboards and alerting automation.

## Custom roles: when to recommend

If a built-in role is too broad, propose a custom role with just the `actions` the workload needs. Template:

```json
{
  "Name": "Custom role name",
  "IsCustom": true,
  "Description": "Purpose of the role in one sentence.",
  "Actions": [
    "Microsoft.Storage/storageAccounts/blobServices/containers/read",
    "Microsoft.Storage/storageAccounts/blobServices/containers/write"
  ],
  "NotActions": [],
  "DataActions": [
    "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read"
  ],
  "NotDataActions": [],
  "AssignableScopes": [
    "/subscriptions/<sub-id>/resourceGroups/<rg-name>"
  ]
}
```

Deploy with `az role definition create --role-definition <file.json>`.

## When Azure says "permission denied" after an RBAC change

Role assignment propagation in Azure AD can take up to 30 minutes for nested group membership. If a fresh assignment does not work immediately, wait 5-10 minutes and retry. If it still fails, run:

```bash
az role assignment list --assignee <principal-id> --scope <scope> -o table
```

And confirm the assignment was actually created.
