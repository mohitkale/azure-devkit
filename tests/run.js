#!/usr/bin/env node
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const HOOK = path.join(__dirname, "..", "hooks", "session-start.js");
const POST_TOOL_HOOK = path.join(__dirname, "..", "hooks", "post-tool-use.js");
const FIXTURES = path.join(__dirname, "fixtures");

const names = fs.readdirSync(FIXTURES).filter(n =>
  fs.statSync(path.join(FIXTURES, n)).isDirectory()
);

let pass = 0, fail = 0;
for (const name of names) {
  const cwd = path.join(FIXTURES, name);
  const expPath = path.join(cwd, ".expected-context");
  const expected = fs.existsSync(expPath) ? fs.readFileSync(expPath, "utf8").trim() : null;

  let out = "";
  try {
    out = execFileSync("node", [HOOK], { cwd, encoding: "utf8" });
  } catch (e) {
    console.log(`FAIL ${name}: hook crashed: ${e.message}`);
    fail++;
    continue;
  }

  const trimmed = out.trim();

  if (expected === "none") {
    if (trimmed === "") {
      console.log(`PASS ${name} (silent)`);
      pass++;
    } else {
      console.log(`FAIL ${name}: expected silent, got: ${trimmed.slice(0, 80)}`);
      fail++;
    }
    continue;
  }

  if (trimmed === "") {
    console.log(`FAIL ${name}: hook was silent but expected context`);
    fail++;
    continue;
  }

  try {
    const parsed = JSON.parse(trimmed);
    const ctx = parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext;
    if (!ctx) {
      console.log(`FAIL ${name}: missing additionalContext`);
      fail++;
      continue;
    }
    if (expected && !ctx.includes(expected)) {
      console.log(`FAIL ${name}: expected context to contain "${expected}"`);
      console.log(`  actual: ${ctx.slice(0, 160)}`);
      fail++;
      continue;
    }
    console.log(`PASS ${name}`);
    pass++;
  } catch (e) {
    console.log(`FAIL ${name}: invalid JSON: ${e.message}`);
    fail++;
  }
}

function runPostToolCase(name, payload, expectedText) {
  const result = spawnSync("node", [POST_TOOL_HOOK], {
    input: JSON.stringify(payload),
    encoding: "utf8"
  });

  if (result.status !== 0) {
    console.log(`FAIL ${name}: hook exited ${result.status}: ${result.stderr.trim()}`);
    fail++;
    return;
  }

  const output = result.stdout.trim();
  if (expectedText === null) {
    if (output === "") {
      console.log(`PASS ${name} (silent)`);
      pass++;
    } else {
      console.log(`FAIL ${name}: expected silent, got: ${output.slice(0, 100)}`);
      fail++;
    }
    return;
  }

  try {
    const context = JSON.parse(output).hookSpecificOutput?.additionalContext;
    if (context?.includes(expectedText)) {
      console.log(`PASS ${name}`);
      pass++;
    } else {
      console.log(`FAIL ${name}: expected context to contain "${expectedText}"`);
      fail++;
    }
  } catch (error) {
    console.log(`FAIL ${name}: invalid JSON: ${error.message}`);
    fail++;
  }
}

runPostToolCase(
  "post-tool deployment create",
  { tool_name: "Bash", tool_input: { command: "az deployment group create -g rg-prod -n app" }, tool_response: {} },
  "confirm resources provisioned"
);
runPostToolCase(
  "post-tool role assignment",
  { tool_name: "Bash", tool_input: { command: "az role assignment create --assignee app --role Reader" }, tool_response: {} },
  "Role assignment changed"
);
runPostToolCase(
  "post-tool bicep build",
  { tool_name: "Bash", tool_input: { command: "az bicep build --file main.bicep" }, tool_response: {} },
  "what-if"
);
runPostToolCase(
  "post-tool application error",
  {
    tool_name: "Bash",
    tool_input: { command: "az webapp log tail -g rg-prod -n api" },
    tool_response: { stdout: "2026-07-28 Error: 502 Bad Gateway", stderr: "" }
  },
  "Error signal detected"
);
runPostToolCase(
  "post-tool unrelated command",
  { tool_name: "Bash", tool_input: { command: "az group list -o table" }, tool_response: {} },
  null
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
