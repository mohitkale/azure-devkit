#!/usr/bin/env node
let input = "";
process.stdin.on("data", c => input += c);
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);
    if (data.tool_name !== "Bash") return process.exit(0);
    const cmd = (data.tool_input && data.tool_input.command) || "";
    const stderr = (data.tool_response && data.tool_response.stderr) || "";
    const stdout = (data.tool_response && data.tool_response.stdout) || "";
    const notes = [];

    if (/\baz\s+deployment\s+group\s+create\b/.test(cmd)) {
      notes.push("After `az deployment group create`: confirm resources provisioned with `az deployment group show -g <rg> -n <name> --query 'properties.provisioningState'`. For future runs, consider `az deployment group what-if` first to preview changes.");
    }
    if (/\baz\s+(webapp|aks|functionapp)\s+create\b/.test(cmd)) {
      notes.push("Resource creation kicked off. Creation is asynchronous in most cases; use `/azure-devkit:az-debug` to tail logs once the resource is ready.");
    }
    if (/\bbicep\s+build\b/.test(cmd) || /\baz\s+bicep\s+build\b/.test(cmd)) {
      notes.push("Bicep compiled to ARM JSON. Next safer step is `az deployment group what-if -g <rg> --template-file main.json` to preview the delta before `create`.");
    }
    if (/\baz\s+role\s+assignment\s+(create|delete)\b/.test(cmd)) {
      notes.push("Role assignment changed. Audit the subscription with `/azure-devkit:rbac-azure-audit <scope>` to confirm no unintended broad roles are now in place.");
    }
    if (/\baz\s+(webapp|functionapp)\s+log\s+tail\b/.test(cmd) && /Error|Failed|502|500/i.test(stderr + stdout)) {
      notes.push("Error signal detected in App Service or Functions logs. `/azure-devkit:az-debug webapp <name> <rg>` runs the full diagnostic.");
    }

    if (notes.length > 0) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: notes.join("\n") }
      }));
    }
  } catch (e) {}
  process.exit(0);
});
