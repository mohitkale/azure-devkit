---
name: aks-manifest
description: Generate AKS-tailored Kubernetes manifests that use Azure Workload Identity, the Azure Key Vault CSI secret driver, and Application Gateway Ingress. Use when the user asks for AKS-specific YAML, asks to wire a pod to Key Vault, or asks for an Ingress using AGIC.
argument-hint: "<workload-description>"
allowed-tools: Read Write Edit Glob
---

# Generate AKS manifests

Write Kubernetes manifests that use AKS-specific integrations: Azure Workload Identity, CSI secret driver, and Application Gateway Ingress (AGIC).

## Inputs

`$ARGUMENTS` is a description of the workload and its Azure integrations. Examples:

- `a Node app that reads DB password from Key Vault kv-prod, exposed via AGIC at api.contoso.com`
- `a Python worker that reads a storage account connection string from Key Vault`
- `a Deployment with 3 replicas that calls Cosmos DB using Workload Identity`

If `$ARGUMENTS` is vague, ask for:

- Azure tenant id.
- Managed identity client id (for Workload Identity).
- Key Vault name (if CSI secret provider is needed).
- Hostname and TLS setup (if AGIC is needed).

## Workflow

1. Confirm the required inputs are available. If not, ask before generating.
2. Decide the file path. Default: `aks/` or `manifests/` if either exists, otherwise the project root.
3. Generate one YAML file per kind, or a single bundled file with `---` separators if the user prefers.
4. Write ServiceAccount and SecretProviderClass first, then Deployment, then Service, then Ingress, then PodDisruptionBudget. The order matters because a Deployment that references a missing ServiceAccount will not start.
5. Announce each file before writing it.
6. After writing, show the apply and verify commands listed below.

## Required characteristics

1. **Labels**: `app.kubernetes.io/name` and `app.kubernetes.io/instance` on every resource.
2. **Resource requests and limits**: set on every container.
3. **Probes**: `readinessProbe` and `livenessProbe` for HTTP workloads.
4. **Security context**: `runAsNonRoot: true`, specific `runAsUser`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true` where the app allows it, `capabilities.drop: ["ALL"]`.
5. **Image tag**: pinned to a version, never `latest`.
6. **API versions**: `apps/v1`, `networking.k8s.io/v1`, `secrets-store.csi.x-k8s.io/v1`.
7. **Workload Identity**: service account has `azure.workload.identity/client-id` annotation; pod template has `azure.workload.identity/use: "true"` label and `serviceAccountName` set.

## AGIC prerequisite

AGIC requires the AKS add-on to be enabled. If the user has not confirmed it, show them:

```bash
az aks show -g <rg> -n <cluster> --query "addonProfiles.ingressApplicationGateway.enabled" -o tsv
```

If the output is not `true`, direct them to enable it:

```bash
az aks enable-addons -g <rg> -n <cluster> --addons ingress-appgw --appgw-name <appgw-name>
```

The add-on installs an `IngressClass` named `azure-application-gateway`. Reference it from the Ingress with `spec.ingressClassName: azure-application-gateway`. The legacy annotation `kubernetes.io/ingress.class: azure/application-gateway` is still accepted but is deprecated.

Generate the Ingress regardless, and note the prerequisite clearly in the output.

## Example: workload with Workload Identity, Key Vault CSI, and AGIC

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: api
  namespace: app
  annotations:
    azure.workload.identity/client-id: 00000000-0000-0000-0000-000000000000
  labels:
    app.kubernetes.io/name: api
    azure.workload.identity/use: "true"
---
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: api-kv-secrets
  namespace: app
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    useVMManagedIdentity: "false"
    clientID: 00000000-0000-0000-0000-000000000000
    keyvaultName: kv-prod
    cloudName: AzurePublicCloud
    objects: |
      array:
        - |
          objectName: db-password
          objectType: secret
        - |
          objectName: jwt-signing-key
          objectType: secret
    tenantId: 11111111-1111-1111-1111-111111111111
  secretObjects:
    - secretName: api-secrets
      type: Opaque
      data:
        - objectName: db-password
          key: DB_PASSWORD
        - objectName: jwt-signing-key
          key: JWT_SIGNING_KEY
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: app
  labels:
    app.kubernetes.io/name: api
    app.kubernetes.io/instance: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app.kubernetes.io/name: api
  template:
    metadata:
      labels:
        app.kubernetes.io/name: api
        azure.workload.identity/use: "true"
    spec:
      serviceAccountName: api
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
        - name: api
          image: myacr.azurecr.io/api:1.4.2
          ports:
            - containerPort: 8080
              name: http
          env:
            - name: AZURE_CLIENT_ID
              value: 00000000-0000-0000-0000-000000000000
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: DB_PASSWORD
            - name: JWT_SIGNING_KEY
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: JWT_SIGNING_KEY
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          readinessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 15
            periodSeconds: 10
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
          volumeMounts:
            - name: kv-secrets
              mountPath: /mnt/secrets
              readOnly: true
      volumes:
        - name: kv-secrets
          csi:
            driver: secrets-store.csi.k8s.io
            readOnly: true
            volumeAttributes:
              secretProviderClass: api-kv-secrets
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: app
  labels:
    app.kubernetes.io/name: api
spec:
  selector:
    app.kubernetes.io/name: api
  ports:
    - name: http
      port: 80
      targetPort: http
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api
  namespace: app
  annotations:
    appgw.ingress.kubernetes.io/backend-protocol: http
    appgw.ingress.kubernetes.io/request-timeout: "30"
    appgw.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: azure-application-gateway
  tls:
    - hosts:
        - api.contoso.com
      secretName: api-tls
  rules:
    - host: api.contoso.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  name: http
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api
  namespace: app
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: api
```

## Example: Workload Identity federated credential (reference only)

The manifest above assumes a federated credential already exists on the user-assigned managed identity, linking the `app/api` service account to the identity. Create it once with:

```bash
az identity federated-credential create \
  --name api-sa \
  --identity-name mi-api-prod \
  --resource-group rg-prod \
  --issuer <AKS-OIDC-ISSUER-URL> \
  --subject system:serviceaccount:app:api \
  --audience api://AzureADTokenExchange
```

Get the OIDC issuer URL once per cluster:

```bash
az aks show -g rg-prod -n <cluster> --query "oidcIssuerProfile.issuerUrl" -o tsv
```

## Example: AGIC with a hostname redirect

To redirect `www.contoso.com` to `contoso.com`, use two Ingress objects, not path rules. The second sets `appgw.ingress.kubernetes.io/ssl-redirect` and points at the canonical host.

## Apply and verify

```bash
kubectl apply -f aks/
kubectl rollout status deployment/api -n app
kubectl get pods -l app.kubernetes.io/name=api -n app
kubectl get ingress -n app
```

For CSI verification:

```bash
kubectl exec -n app deploy/api -- ls /mnt/secrets
kubectl get secret api-secrets -n app
```

Do not cat the secret file or print its values.

## Do not

- Do not use AAD Pod Identity (`aadpodidbinding`). It is deprecated. Use Workload Identity.
- Do not embed client secrets or connection strings in ConfigMaps, env vars, or image layers. Route all secrets through Key Vault CSI or a Secret backed by an external operator.
- Do not set `useVMManagedIdentity: "true"` on the SecretProviderClass. That uses the node pool kubelet identity, which is a shared privilege. Use `clientID` with a dedicated user-assigned identity instead.
- Do not use `image: <name>:latest` or omit the tag.
- Do not omit resource limits. An AGIC backend without limits can starve the node on burst.
