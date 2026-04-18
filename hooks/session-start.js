#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const cwd = process.cwd();

function has(rel) {
  try { return fs.existsSync(path.join(cwd, rel)); } catch { return false; }
}
function isDir(rel) {
  try { return fs.statSync(path.join(cwd, rel)).isDirectory(); } catch { return false; }
}
function anyInDir(rel, pred) {
  try {
    const full = path.join(cwd, rel);
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) return false;
    return fs.readdirSync(full).some(pred);
  } catch { return false; }
}

const findings = [];

const cwdFiles = (() => { try { return fs.readdirSync(cwd); } catch { return []; } })();
const hasBicep = cwdFiles.some(f => f.endsWith(".bicep") || f.endsWith(".bicepparam"));
if (hasBicep) {
  findings.push("- Bicep files detected. Use `/azure-devkit:bicep-template <resource>` to scaffold a new resource or extend existing templates.");
}

if (has("host.json") && has("local.settings.json")) {
  findings.push("- Azure Functions project detected (host.json + local.settings.json). Use `/azure-devkit:functions-scaffold` to add a new trigger or `/azure-devkit:az-debug functionapp <name>` to diagnose failures.");
}

if (has("web.config") || has(".deployment")) {
  findings.push("- App Service deployment artefact detected. Use `/azure-devkit:app-service-deploy` to scaffold config, or `/azure-devkit:az-debug webapp <name> <rg>` to diagnose a live app.");
}

if (has("azure-pipelines.yml") || has("azure-pipelines.yaml")) {
  findings.push("- Azure Pipelines config detected. Bicep and App Service skills can feed into pipeline steps.");
}

if (isDir(".azure") || has("azure.yaml")) {
  findings.push("- Azure Developer CLI project detected (.azure or azure.yaml). Bicep, App Service, and Functions skills will align with `azd` conventions.");
}

if (findings.length > 0) {
  const text = [
    "Azure DevKit plugin is active. Detected in " + cwd + ":",
    findings.join("\n"),
    "Run `/azure-devkit:doctor` to check that az, kubectl, bicep, and func are installed and signed in."
  ].join("\n\n");
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: text
    }
  }));
}
process.exit(0);
