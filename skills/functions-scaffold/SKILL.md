---
name: functions-scaffold
description: Scaffold an Azure Functions project with a handler and the right binding definition. Use when the user asks to create a new Azure Function, add an HTTP, Timer, Queue, or Blob trigger, or bootstrap a function in Node, Python, C#, or Java.
argument-hint: "<runtime> <trigger-type> [function-name]"
allowed-tools: Read Write Edit Glob
---

# Scaffold an Azure Function

Generate a working Azure Functions project with the right runtime files, a handler stub, and the correct binding definition (a `function.json` for classic models, or a decorator or annotation for modern models).

## Programming models

Azure Functions has two programming models for some runtimes. The scaffolding differs:

| Runtime | Classic model | Modern model | Binding defined by |
|---|---|---|---|
| Node | v3 (file-based) | v4 (code-first) | `function.json` in v3, `app.<trigger>()` decorator in v4 |
| Python | v1 (file-based) | v2 (decorator-based) | `function.json` in v1, `@app.function_name()` plus `@app.<trigger>()` in v2 |
| C# | in-process (retired for net8+) | isolated worker | attributes on methods in both |
| Java | N/A | annotations | `@FunctionName` and trigger annotations |

Modern models are preferred for new projects. If the user does not specify a model, scaffold the modern model for Node and Python, and isolated worker for C#.

## Inputs

`$ARGUMENTS` is the runtime, trigger type, and optional function name. Examples:

- `node http OrderCreate`
- `python queue process-orders`
- `dotnet timer DailyReport`
- `java blob ThumbnailMaker`

If any field is missing, ask:

- Runtime (`node`, `python`, `dotnet`, `java`).
- Trigger (`http`, `timer`, `queue`, `blob`).
- Function name (PascalCase recommended for C# and Java, kebab-case for Node and Python).

Announce every file you are about to write before writing.

## Workflow

1. Detect the runtime from the files in the working directory (see "Runtime detection" below). If nothing matches, ask the user which runtime to use.
2. Confirm the trigger type. If it is Queue or Blob, confirm the storage connection setting name the user wants.
3. Decide the layout. If `host.json` already exists, add the new function to the existing project. Otherwise, scaffold a fresh project.
4. Announce every file you are about to write before writing it.
5. Write `host.json` and `local.settings.json` first (if missing), then the runtime manifest (`package.json`, `requirements.txt`, `.csproj`, or `pom.xml`), then the function files.
6. Show the user the commands to run the function locally and how to deploy it.

## Required files

Every Functions project needs, at the project root:

- `host.json`: runtime configuration.
- `local.settings.json`: local development settings (never committed).

Per runtime, also:

- Node: `package.json` and the function directory.
- Python: `requirements.txt` and the function directory.
- C# (isolated worker): `.csproj`, `Program.cs`, and a function class file.
- Java: `pom.xml` and a function class under `src/main/java`.

## Runtime detection

If the working directory already has `host.json`, this is an existing project. Add a new function to it instead of scaffolding from scratch.

If the directory has `package.json` and `host.json`, use Node. If `requirements.txt` and `host.json`, use Python. Similarly for `.csproj` or `pom.xml`.

## Example: Node HTTP trigger

File `host.json`:

```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "excludedTypes": "Request"
      }
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

File `local.settings.json` (add to `.gitignore`):

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "FUNCTIONS_EXTENSION_VERSION": "~4",
    "WEBSITE_NODE_DEFAULT_VERSION": "~20"
  }
}
```

File `package.json`:

```json
{
  "name": "functions-app",
  "version": "1.0.0",
  "main": "src/functions/*.js",
  "scripts": {
    "start": "func start",
    "test": "node --test"
  },
  "dependencies": {
    "@azure/functions": "4.5.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

File `src/functions/OrderCreate.js`:

```javascript
const { app } = require('@azure/functions');

app.http('OrderCreate', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    context.log(`Processing ${request.method} ${request.url}`);

    let body;
    try {
      body = await request.json();
    } catch (err) {
      return { status: 400, jsonBody: { error: 'invalid JSON body' } };
    }

    if (!body.productId || !body.quantity) {
      return { status: 400, jsonBody: { error: 'productId and quantity are required' } };
    }

    const orderId = `ord_${Date.now()}`;
    context.log(`Created order ${orderId}`);

    return {
      status: 201,
      jsonBody: {
        orderId,
        productId: body.productId,
        quantity: body.quantity
      }
    };
  }
});
```

Run locally:

```bash
npm install
func start
```

## Example: Python Queue trigger

File `host.json` (same as Node).

File `local.settings.json`:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "python",
    "FUNCTIONS_EXTENSION_VERSION": "~4",
    "QUEUE_CONNECTION__queueServiceUri": "https://<account>.queue.core.windows.net"
  }
}
```

File `requirements.txt`:

```
azure-functions==1.21.3
azure-identity==1.19.0
```

File `process_orders/__init__.py`:

```python
import json
import logging

import azure.functions as func


def main(msg: func.QueueMessage) -> None:
    raw = msg.get_body().decode("utf-8")
    logging.info("received message id=%s", msg.id)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        logging.error("message is not valid JSON, dropping")
        return

    order_id = payload.get("orderId")
    if not order_id:
        logging.error("missing orderId, dropping")
        return

    logging.info("processed order %s", order_id)
```

File `process_orders/function.json`:

```json
{
  "scriptFile": "__init__.py",
  "bindings": [
    {
      "name": "msg",
      "type": "queueTrigger",
      "direction": "in",
      "queueName": "orders",
      "connection": "QUEUE_CONNECTION"
    }
  ]
}
```

Run locally (with Azurite for storage):

```bash
pip install -r requirements.txt
func start
```

## Example: C# (isolated worker) Timer trigger

File `host.json` (same as Node).

File `local.settings.json`:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
    "FUNCTIONS_EXTENSION_VERSION": "~4"
  }
}
```

File `Functions.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <AzureFunctionsVersion>v4</AzureFunctionsVersion>
    <OutputType>Exe</OutputType>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Azure.Functions.Worker" Version="1.23.0" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Timer" Version="4.3.1" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Sdk" Version="1.17.4" />
    <PackageReference Include="Microsoft.ApplicationInsights.WorkerService" Version="2.22.0" />
  </ItemGroup>
</Project>
```

File `Program.cs`:

```csharp
using Microsoft.Extensions.Hosting;
using Microsoft.Azure.Functions.Worker;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .Build();

host.Run();
```

File `DailyReport.cs`:

```csharp
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

public class DailyReport
{
    private readonly ILogger _logger;

    public DailyReport(ILoggerFactory loggerFactory)
    {
        _logger = loggerFactory.CreateLogger<DailyReport>();
    }

    [Function("DailyReport")]
    public void Run([TimerTrigger("0 0 2 * * *")] TimerInfo timer)
    {
        _logger.LogInformation("DailyReport ran at {Time}", DateTime.UtcNow);
    }
}
```

Build and run:

```bash
dotnet build
func start
```

## Example: Java Blob trigger

File `host.json` (same as Node).

File `pom.xml` (excerpt showing the Functions plugin):

```xml
<build>
  <plugins>
    <plugin>
      <groupId>com.microsoft.azure</groupId>
      <artifactId>azure-functions-maven-plugin</artifactId>
      <version>1.36.0</version>
      <configuration>
        <appName>${functionAppName}</appName>
        <resourceGroup>${resourceGroup}</resourceGroup>
        <region>westeurope</region>
        <runtime>
          <os>linux</os>
          <javaVersion>21</javaVersion>
        </runtime>
      </configuration>
    </plugin>
  </plugins>
</build>
```

File `src/main/java/com/contoso/ThumbnailMaker.java`:

```java
package com.contoso;

import com.microsoft.azure.functions.ExecutionContext;
import com.microsoft.azure.functions.annotation.BlobTrigger;
import com.microsoft.azure.functions.annotation.FunctionName;

public class ThumbnailMaker {
    @FunctionName("ThumbnailMaker")
    public void run(
            @BlobTrigger(
                name = "content",
                path = "uploads/{name}",
                dataType = "binary",
                connection = "STORAGE_CONNECTION"
            ) byte[] content,
            String name,
            ExecutionContext context) {
        context.getLogger().info("Blob received: " + name + " (" + content.length + " bytes)");
    }
}
```

Build and run:

```bash
mvn clean package
mvn azure-functions:run
```

## Deploy

Once the function runs locally, deploy with:

```bash
func azure functionapp publish <function-app-name>
```

Or use Bicep to provision the function app first, then:

```bash
az functionapp deployment source config-zip \
  -g <rg> -n <function-app-name> \
  --src ./dist/functionapp.zip
```

## Verification after scaffold

1. `func --version` prints 4.x.
2. `func start` boots without errors.
3. For HTTP: `curl -X POST http://localhost:7071/api/<function-name> -H "Content-Type: application/json" -d '{"productId":"sku-1","quantity":2}'` returns 201.
4. For Timer: logs show the function running on schedule.
5. For Queue or Blob: local Azurite has the queue or container created, and dropping a message or file triggers the function.

## Do not

- Do not commit `local.settings.json`. Add it to `.gitignore` explicitly.
- Do not use `authLevel: "anonymous"` without gating the endpoint elsewhere (API Management, App Service auth, or IP restrictions).
- Do not mix in-process and isolated worker models in the same project.
- Do not use `FUNCTIONS_EXTENSION_VERSION` older than `~4`. The v1, v2, v3 runtimes are out of support.
- Do not run `func azure functionapp publish` without user approval if the target is a production function app.
