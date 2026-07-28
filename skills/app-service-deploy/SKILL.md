---
name: app-service-deploy
description: Generate an App Service deployment configuration and the az webapp up command to deploy. Use when the user asks to deploy a web app to Azure App Service, needs a web.config for Windows, a startup command for Linux, or wants a reproducible `az webapp up` invocation.
argument-hint: "<runtime> <os> [app-name] [resource-group]"
allowed-tools: Read Write Edit Glob
---

# Scaffold an App Service deployment

Generate the right platform config for App Service and the `az webapp up` command that deploys the current directory.

## Inputs

`$ARGUMENTS` is the runtime, OS, and optional app name and resource group. Examples:

- `node linux api-prod rg-prod`
- `dotnet windows orders-web rg-staging`
- `python linux analytics`

If any required field is missing, ask. Confirm the current working directory contains the app source before writing files.

## Detection steps

Before writing anything, detect the project type from files in the current directory:

- `package.json` in root: Node app. Use `linux` unless the user insists on Windows.
- `*.csproj` or `*.sln` in root: .NET app. Windows or Linux both work.
- `requirements.txt`, `pyproject.toml`, or `*.py` entry: Python. Linux only.
- `pom.xml`, `build.gradle`: Java. Linux recommended.
- `composer.json`: PHP. Linux only.

If multiple files are present, ask the user which project to deploy.

Announce the files you will write before writing them.

## Linux: startup command and settings

Linux App Service runs a Docker container under the hood. You control startup with a single startup command, not a web.config.

For Node (SvelteKit, Next.js, Express, Fastify):

```bash
STARTUP_COMMAND="node server.js"
```

For a Next.js app in production, the typical startup is:

```bash
STARTUP_COMMAND="npx next start -p 8080"
```

For Python (FastAPI with Gunicorn):

```bash
STARTUP_COMMAND="gunicorn -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000 main:app"
```

For Python (Django):

```bash
STARTUP_COMMAND="gunicorn -w 4 -b 0.0.0.0:8000 myproject.wsgi:application"
```

For Java (Spring Boot):

```bash
STARTUP_COMMAND="java -jar /home/site/wwwroot/app.jar --server.port=8080"
```

Pin the port in the startup command and tell App Service about it with `WEBSITES_PORT`:

```bash
az webapp config appsettings set -g <rg> -n <app> --settings \
  WEBSITES_PORT=8080 \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true \
  WEBSITE_HTTPLOGGING_RETENTION_DAYS=7
```

Then set the startup command:

```bash
az webapp config set -g <rg> -n <app> --startup-file "$STARTUP_COMMAND"
```

## Windows: web.config

For a Windows App Service running ASP.NET Core, write `web.config` at the project root (or let `dotnet publish` generate it, then customize):

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <location path="." inheritInChildApplications="false">
    <system.webServer>
      <handlers>
        <add name="aspNetCore" path="*" verb="*" modules="AspNetCoreModuleV2" resourceType="Unspecified" />
      </handlers>
      <aspNetCore processPath=".\MyApp.exe"
                  arguments=""
                  stdoutLogEnabled="true"
                  stdoutLogFile=".\logs\stdout"
                  hostingModel="InProcess">
        <environmentVariables>
          <environmentVariable name="ASPNETCORE_ENVIRONMENT" value="Production" />
          <environmentVariable name="ASPNETCORE_DETAILEDERRORS" value="false" />
        </environmentVariables>
      </aspNetCore>
    </system.webServer>
  </location>
</configuration>
```

For a Windows App Service running Node (older setups), use `iisnode`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="server.js" verb="*" modules="iisnode" />
    </handlers>
    <rewrite>
      <rules>
        <rule name="nodeApp">
          <match url="/*" />
          <action type="Rewrite" url="server.js" />
        </rule>
      </rules>
    </rewrite>
    <iisnode nodeProcessCommandLine="node.exe" loggingEnabled="true" logDirectory="iisnode" />
  </system.webServer>
</configuration>
```

Linux is preferred for Node and Python. Use Windows only when a dependency requires it.

## Deploy command

The single deploy command is `az webapp up`. It creates the resource group, plan, and app if they do not exist, and deploys the current directory.

For a fresh deployment:

```bash
az webapp up \
  --name <app-name> \
  --resource-group <rg> \
  --location westeurope \
  --plan <plan-name> \
  --sku B1 \
  --os-type Linux \
  --runtime "NODE:20-lts" \
  --logs
```

For subsequent deployments (same name and group), you can shorten to:

```bash
az webapp up --name <app-name> --resource-group <rg>
```

Valid runtime values (as of writing):

| OS | Runtime string |
|---|---|
| Linux | `NODE:20-lts`, `NODE:22-lts` |
| Linux | `PYTHON:3.11`, `PYTHON:3.12` |
| Linux | `DOTNETCORE:8.0`, `DOTNETCORE:9.0` |
| Linux | `JAVA:21-java21`, `JAVA:17-java17` |
| Linux | `PHP:8.3` |
| Windows | `DOTNET:8`, `DOTNET:9` |
| Windows | `NODE:20LTS` |

Check the current list with:

```bash
az webapp list-runtimes --os-type Linux -o tsv
az webapp list-runtimes --os-type Windows -o tsv
```

## Example output for a Node app on Linux

1. Announce the files to write:
   - `.deployment` in the project root.
   - A startup command in the App Service config.

2. Write `.deployment`:

```ini
[config]
SCM_DO_BUILD_DURING_DEPLOYMENT=true
```

3. Write `package.json` `scripts.start` if it is not already present:

```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

4. Show the user the deploy commands:

```bash
az webapp up \
  --name api-prod \
  --resource-group rg-prod \
  --location westeurope \
  --plan plan-api-prod \
  --sku B1 \
  --os-type Linux \
  --runtime "NODE:20-lts" \
  --logs

az webapp config appsettings set -g rg-prod -n api-prod --settings \
  WEBSITES_PORT=8080 \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true
```

## Verifying the deployment

```bash
az webapp show -g <rg> -n <app> --query "{state:state, defaultHostName:defaultHostName}" -o table
az webapp log tail -g <rg> -n <app>
curl -I https://<defaultHostName>/
```

Wait until `state` is `Running` and the health endpoint returns 200.

## Do not

- Do not set `WEBSITES_PORT` to a value that does not match the port the app actually binds to. This causes 502s.
- Do not commit `local.settings.json` or connection strings to the repo. Use `az webapp config appsettings set` to push them.
- Do not run `az webapp delete` or `az group delete` without explicit user approval.
- Do not use Windows hosting for Python or PHP. They are Linux-only on App Service.
- Do not use `latest` container tags for custom containers on App Service. Pin to a specific digest or version.
