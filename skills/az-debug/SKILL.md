---
name: az-debug
description: Diagnose common Azure failures across AKS, App Service, and Azure Functions. Use when the user reports AKS pod errors, App Service startup failures or 502s, Functions cold starts, or Functions deployment errors.
argument-hint: "<service-type> <resource-name> [resource-group]"
allowed-tools: Bash(az aks show *) Bash(az aks list *) Bash(az aks nodepool list *) Bash(az aks nodepool show *) Bash(az aks check-acr *) Bash(az aks get-credentials *) Bash(az webapp log *) Bash(az webapp show *) Bash(az webapp list *) Bash(az functionapp show *) Bash(az functionapp list *) Bash(az monitor log-analytics query *) Bash(az monitor metrics list *) Bash(az monitor activity-log list *) Bash(az account show *) Read Grep
---

# Debug an Azure failure

Explain why an Azure resource is failing and suggest a concrete fix.

## Inputs

`$ARGUMENTS` is the service type, the resource name, and an optional resource group. Examples:

- `aks my-cluster rg-prod`
- `webapp api-frontend rg-staging`
- `functionapp orders-queue rg-prod`

If the service type is missing, ask. If the resource group is missing, call `az webapp show --name <name>` or `az aks show --name <name>` and read `resourceGroup` from the output, or ask the user.

## Detection steps

First, confirm the active subscription before pulling anything:

```bash
az account show --query "{name:name, id:id, tenant:tenantId}" -o table
```

Then branch by service type.

### AKS

```bash
az aks show -g <rg> -n <cluster> --query "{provisioningState:provisioningState, kubernetesVersion:currentKubernetesVersion, powerState:powerState.code}" -o table
az aks get-credentials -g <rg> -n <cluster> --overwrite-existing
```

The `--overwrite-existing` flag replaces any kubeconfig entry with the same name without prompting. If the user already has a context they care about under the same cluster name, confirm before running, or omit the flag to let the CLI merge.

With kubectl context set, use the `k8s-debug` skill from the `docker-kubernetes` plugin for pod-level diagnosis, or run:

```bash
kubectl get pods -A --field-selector=status.phase!=Running
kubectl describe pod <pod> -n <ns>
kubectl logs <pod> -n <ns> --previous --tail=200 --timestamps
```

Common AKS-specific failures:

- **ImagePullBackOff from ACR**: the kubelet cannot pull from Azure Container Registry. Check that the cluster is attached to ACR with `az aks check-acr -g <rg> -n <cluster> --acr <acr-name>.azurecr.io`, or that an `imagePullSecrets` entry points to a valid registry credential.
- **Pods stuck Pending with "no nodes available"**: the node pool is at capacity or autoscaler is disabled. Check `az aks nodepool list -g <rg> --cluster-name <cluster> -o table` and look at `count`, `minCount`, `maxCount`, `enableAutoScaling`.
- **Workload Identity token errors**: the federated credential or the service account annotation is wrong. Check the service account has `azure.workload.identity/client-id: <client-id>` and the pod spec has `serviceAccountName` set and `azure.workload.identity/use: "true"` label.
- **CSI secret not mounting**: the SecretProviderClass references a key vault the managed identity cannot read. Check role assignments on the key vault.

### App Service (webapp)

```bash
az webapp show -g <rg> -n <app> --query "{state:state, os:reserved, stack:siteConfig.linuxFxVersion, lastStart:lastModifiedTimeUtc}" -o table
az webapp log tail -g <rg> -n <app>
az webapp log download -g <rg> -n <app> --log-file ./app-logs.zip
```

Common App Service failures:

- **502 Bad Gateway on startup**: the app did not bind to the port in the `PORT` environment variable (Linux) or did not respond on port 80 (Windows). Check `az webapp config appsettings list -g <rg> -n <app> --query "[?name=='PORT' || name=='WEBSITES_PORT']"`. The app must listen on `process.env.PORT` for Node, `os.getenv("PORT")` for Python, and so on.
- **App keeps restarting**: look in `az webapp log tail` for `Container <name> didn't respond to HTTP pings on port: <port>`. Raise `WEBSITES_CONTAINER_START_TIME_LIMIT` (max 1800) or fix the startup probe in code.
- **Startup command errors on Linux**: check `siteConfig.linuxFxVersion` and `siteConfig.appCommandLine`. An empty `appCommandLine` means Oryx tries to infer the start command; pinning it is safer.
- **Windows: stdout log not written**: `web.config` is missing `stdoutLogEnabled="true"` or the `logs` directory is not writable. Enable App Service diagnostics in the portal or set `ASPNETCORE_DETAILEDERRORS=true` for .NET.

### Azure Functions (functionapp)

```bash
az functionapp show -g <rg> -n <app> --query "{state:state, runtime:siteConfig.linuxFxVersion, functionsVersion:functionsRuntimeVersion, plan:serverFarmId}" -o table
az webapp log tail -g <rg> -n <app>
```

Common Functions failures:

- **Cold start slow on Consumption plan**: cold starts are inherent to the Consumption plan. If latency matters, move to Premium (`EP1`, `EP2`, `EP3`) or App Service Plan, and enable "Always Ready Instances".
- **Deployment succeeded but no triggers show**: the runtime cannot discover the functions. Check `FUNCTIONS_WORKER_RUNTIME` matches the code (`node`, `python`, `dotnet`, `java`, `powershell`), and that `FUNCTIONS_EXTENSION_VERSION` is `~4`.
- **Queue or Blob trigger not firing**: the storage connection string in `AzureWebJobsStorage` is invalid, or the identity does not have `Storage Queue Data Contributor` or `Storage Blob Data Owner` on the target storage account.
- **HTTP trigger returns 401 unexpectedly**: the `authLevel` in `function.json` is `function` or `admin` and the caller is not sending `x-functions-key`. For public endpoints, use `authLevel: anonymous` and gate access with an App Service authentication provider or API Management.

### Monitor queries

If logs are quiet, query Application Insights or Log Analytics for the last hour:

```bash
az monitor log-analytics query \
  --workspace <workspace-id> \
  --analytics-query "AppExceptions | where TimeGenerated > ago(1h) | project TimeGenerated, ProblemId, OperationName, Message | take 50"
```

For AKS, use container logs:

```bash
az monitor log-analytics query \
  --workspace <workspace-id> \
  --analytics-query "ContainerLogV2 | where TimeGenerated > ago(30m) and PodName == '<pod>' | project TimeGenerated, LogMessage | take 100"
```

## Output

1. State the root cause in one short sentence.
2. Quote 3 to 10 lines of output that support it.
3. Give a concrete fix. If it needs a config change, show the exact `az` command or the before and after code.
4. If the diagnosis needs more data, say which command to run next and why.

## Example diagnosis

**Root cause**: App Service `api-frontend` returns 502 because the Node process binds to port 3000, but App Service sends traffic to port 8080 (the default on Linux).

**Evidence**:
```
$ az webapp log tail -g rg-staging -n api-frontend
2026-04-17T09:12:04 Container api-frontend didn't respond to HTTP pings on port: 8080
2026-04-17T09:12:04 Failing site request with HTTP code 502
```

**Fix**:
```bash
az webapp config appsettings set -g rg-staging -n api-frontend --settings WEBSITES_PORT=3000
az webapp restart -g rg-staging -n api-frontend
```

Or update the Node code to read `process.env.PORT`:
```javascript
const port = process.env.PORT || 3000;
app.listen(port);
```

**Next step**:
```bash
az webapp log tail -g rg-staging -n api-frontend
```

Wait 30 seconds and confirm the `didn't respond to HTTP pings` line is gone and the app serves 200 on its health endpoint.

## Do not

- Do not run `az webapp delete`, `az aks delete`, `az functionapp delete`, `az group delete`, or any other destructive verbs without explicit user approval.
- Do not print values from `az webapp config appsettings list` unless the user asks. Those outputs often contain connection strings. Summarize which keys exist instead of printing values.
- Do not guess. If logs are empty, enable diagnostics with `az webapp log config --application-logging filesystem --level verbose` and wait for data before concluding.
