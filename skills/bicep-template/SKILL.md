---
name: bicep-template
description: Generate idiomatic Bicep templates for common Azure resources. Use when the user asks to create a Bicep file for an App Service Plan and App Service, a Container App, a Storage Account, a Key Vault, a Cosmos DB account, or Application Insights.
argument-hint: "<resource-type> [name] [region]"
allowed-tools: Read Write Edit Glob
---

# Generate a Bicep template

Write clean, idiomatic Bicep for the requested Azure resource with pinned API versions.

## Inputs

`$ARGUMENTS` is the resource type and optional name or region. Examples:

- `app-service api-prod westeurope`
- `container-app orders`
- `storage-account prodlogs`
- `key-vault app-secrets`
- `cosmos-db catalog`
- `app-insights api-prod`

If the user does not specify a region, default to `westeurope` and mention it in the output. If the user does not specify a name, ask for one.

## Workflow

1. Decide the file path. Default: `infra/<resource-type>.bicep`. If the repo has an existing `infra/` or `bicep/` layout, follow it.
2. Write a parameter block so the template is reusable across environments.
3. Pin every `@2024-*` or `@2023-*` API version. Never omit the API version.
4. Set tags with `environment` and `owner` at minimum.
5. Write outputs for any value the caller will need (resource id, primary endpoint, principal id).
6. Announce the file path before writing.

## Required characteristics

- `targetScope` is always declared. Use `resourceGroup` for resource-scoped files and `subscription` for subscription-scoped files.
- Use `@minLength` and `@maxLength` decorators on name parameters.
- Use `@description` on every parameter.
- Never hardcode secrets or keys. Reference Key Vault with `getSecret()` or `existing` plus `listKeys()`.
- Enable system-assigned managed identity by default where the resource supports it.
- Set `publicNetworkAccess: 'Disabled'` for data-plane resources in production examples, and note the private endpoint requirement.

## Pinned API versions

Use these API versions in every generated file:

| Resource | API version |
|---|---|
| `Microsoft.Web/serverfarms` | `2024-04-01` |
| `Microsoft.Web/sites` | `2024-04-01` |
| `Microsoft.App/containerApps` | `2024-03-01` |
| `Microsoft.App/managedEnvironments` | `2024-03-01` |
| `Microsoft.Storage/storageAccounts` | `2023-05-01` |
| `Microsoft.KeyVault/vaults` | `2023-07-01` |
| `Microsoft.DocumentDB/databaseAccounts` | `2024-05-15` |
| `Microsoft.Insights/components` | `2020-02-02` |
| `Microsoft.OperationalInsights/workspaces` | `2023-09-01` |

If the user asks for a resource not on this list, use the latest GA version documented on Microsoft Learn at the time of writing.

## Example: App Service Plan and App Service

```bicep
targetScope = 'resourceGroup'

@description('Base name for the App Service. Must be globally unique.')
@minLength(3)
@maxLength(40)
param appName string

@description('Azure region for the resources.')
param location string = resourceGroup().location

@description('Environment tag (dev, staging, prod).')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environment string = 'dev'

@description('Log Analytics workspace resource id for diagnostic settings.')
param logAnalyticsWorkspaceId string

var tags = {
  environment: environment
  owner: 'platform'
  managedBy: 'bicep'
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-${appName}'
  location: location
  tags: tags
  sku: {
    name: environment == 'prod' ? 'P1v3' : 'B1'
    tier: environment == 'prod' ? 'PremiumV3' : 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource app 'Microsoft.Web/sites@2024-04-01' = {
  name: 'app-${appName}'
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      alwaysOn: environment == 'prod'
      healthCheckPath: '/healthz'
      appSettings: [
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
      ]
    }
  }
}

resource diag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'diag-${app.name}'
  scope: app
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'AppServiceHTTPLogs'
        enabled: true
      }
      {
        category: 'AppServiceConsoleLogs'
        enabled: true
      }
      {
        category: 'AppServiceAppLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

output appServiceId string = app.id
output appServiceName string = app.name
output appServicePrincipalId string = app.identity.principalId
output defaultHostName string = app.properties.defaultHostName
```

## Example: Container App with managed environment

```bicep
targetScope = 'resourceGroup'

@description('Base name for the Container App.')
@minLength(3)
@maxLength(30)
param appName string

@description('Azure region.')
param location string = resourceGroup().location

@description('Container image reference, including tag.')
param image string

@description('Log Analytics workspace resource id.')
param logAnalyticsWorkspaceId string

@description('Target port the container listens on.')
param targetPort int = 8080

var tags = {
  environment: 'prod'
  owner: 'platform'
  managedBy: 'bicep'
}

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: last(split(logAnalyticsWorkspaceId, '/'))
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${appName}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
    zoneRedundant: true
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${appName}'
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
      }
      activeRevisionsMode: 'Single'
    }
    template: {
      containers: [
        {
          name: appName
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: targetPort
              }
              initialDelaySeconds: 15
              periodSeconds: 10
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/healthz'
                port: targetPort
              }
              initialDelaySeconds: 5
              periodSeconds: 5
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 10
        rules: [
          {
            name: 'http-rule'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

output containerAppId string = app.id
output containerAppFqdn string = app.properties.configuration.ingress.fqdn
output principalId string = app.identity.principalId
```

## Example: Storage Account (secure defaults)

```bicep
targetScope = 'resourceGroup'

@description('Storage account name. Must be 3 to 24 lowercase letters and numbers.')
@minLength(3)
@maxLength(24)
param storageName string

@description('Azure region.')
param location string = resourceGroup().location

var tags = {
  environment: 'prod'
  owner: 'platform'
  managedBy: 'bicep'
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  tags: tags
  sku: {
    name: 'Standard_ZRS'
  }
  kind: 'StorageV2'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
    }
    encryption: {
      services: {
        blob: {
          enabled: true
          keyType: 'Account'
        }
        file: {
          enabled: true
          keyType: 'Account'
        }
      }
      keySource: 'Microsoft.Storage'
      requireInfrastructureEncryption: true
    }
  }
}

output storageAccountId string = storage.id
output storageAccountName string = storage.name
```

Note: `publicNetworkAccess: 'Disabled'` means the account is reachable only through a Private Endpoint. Add one in a separate module or relax this property for dev environments.

## Example: Key Vault

```bicep
targetScope = 'resourceGroup'

@description('Key Vault name. Must be globally unique.')
@minLength(3)
@maxLength(24)
param vaultName string

@description('Azure region.')
param location string = resourceGroup().location

@description('Tenant id for RBAC authentication.')
param tenantId string = subscription().tenantId

var tags = {
  environment: 'prod'
  owner: 'platform'
  managedBy: 'bicep'
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
    }
  }
}

output keyVaultId string = vault.id
output keyVaultUri string = vault.properties.vaultUri
```

Note: `enablePurgeProtection: true` is irreversible once set. The vault cannot be force-deleted until the retention period elapses. Keep this property on for production. For dev or test environments, set it to `false` so the vault can be cleaned up. `enableSoftDelete: true` is always on and cannot be disabled.

## Example: Cosmos DB account

```bicep
targetScope = 'resourceGroup'

@description('Cosmos DB account name. Must be globally unique, lowercase.')
@minLength(3)
@maxLength(44)
param accountName string

@description('Primary Azure region.')
param location string = resourceGroup().location

@description('Secondary region for failover.')
param secondaryLocation string = 'northeurope'

var tags = {
  environment: 'prod'
  owner: 'platform'
  managedBy: 'bicep'
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: accountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: true
      }
      {
        locationName: secondaryLocation
        failoverPriority: 1
        isZoneRedundant: true
      }
    ]
    enableAutomaticFailover: true
    enableMultipleWriteLocations: false
    disableLocalAuth: true
    publicNetworkAccess: 'Disabled'
    backupPolicy: {
      type: 'Continuous'
      continuousModeProperties: {
        tier: 'Continuous7Days'
      }
    }
    minimalTlsVersion: 'Tls12'
  }
}

output cosmosAccountId string = cosmos.id
output cosmosEndpoint string = cosmos.properties.documentEndpoint
```

## Example: Application Insights with Log Analytics workspace

```bicep
targetScope = 'resourceGroup'

@description('Name used for the workspace and Application Insights component.')
@minLength(3)
@maxLength(40)
param name string

@description('Azure region.')
param location string = resourceGroup().location

var tags = {
  environment: 'prod'
  owner: 'platform'
  managedBy: 'bicep'
}

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${name}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${name}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

output workspaceId string = workspace.id
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
```

## Validation

After writing the file, show the user the validate and what-if commands:

```bash
az bicep build --file infra/<file>.bicep
az deployment group validate -g <rg> -f infra/<file>.bicep --parameters appName=<name>
az deployment group what-if -g <rg> -f infra/<file>.bicep --parameters appName=<name>
```

## Do not

- Do not run `az deployment group create` or `az deployment sub create` without explicit user approval. Always stop at `what-if`.
- Do not use `latest` for container images in examples. Pin to a specific tag like `nginx:1.27-alpine`.
- Do not hardcode secrets in Bicep. Use Key Vault references or deployment parameters marked `@secure()`.
- Do not omit the API version on any resource. An unversioned resource is a bug.
- Do not use deprecated resource providers such as `Microsoft.ClassicCompute` or `Microsoft.ClassicStorage`.
