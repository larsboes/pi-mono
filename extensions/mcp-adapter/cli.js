#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXT_DIR = path.join(os.homedir(), ".pi", "agent", "extensions", "pi-mcp-adapter");
const SETTINGS_FILE = path.join(os.homedir(), ".pi", "agent", "settings.json");
const EXT_PATH = "~/.pi/agent/extensions/pi-mcp-adapter/index.ts";

const FILES = [
  "index.ts",
  "types.ts",
  "config.ts",
  "server-manager.ts",
  "tool-registrar.ts",
  "resource-tools.ts",
  "lifecycle.ts",
  "metadata-cache.ts",
  "npx-resolver.ts",
  "oauth-handler.ts",
  "package.json",
  "tsconfig.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
];

async function main() {
  console.log("Installing pi-mcp-adapter (from bundled source)...\n");

  fs.mkdirSync(EXT_DIR, { recursive: true });
  console.log(`Created directory: ${EXT_DIR}`);

  for (const file of FILES) {
    const src = path.join(__dirname, file);
    if (!fs.existsSync(src)) {
      console.log(`Skipping ${file} (not found in package)`);
      continue;
    }
    console.log(`Copying ${file}...`);
    fs.copyFileSync(src, path.join(EXT_DIR, file));
  }

  console.log("\nInstalling dependencies...");
  try {
    execSync("npm install --omit=dev", { cwd: EXT_DIR, stdio: "inherit" });
  } catch {
    console.error("Warning: npm install failed. You may need to run it manually.");
  }

  console.log(`\nUpdating settings: ${SETTINGS_FILE}`);
  
  let settings = {};
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    } catch (err) {
      console.error(`Warning: Could not parse existing settings.json: ${err.message}`);
      console.error("Creating new settings file...");
    }
  }

  if (!Array.isArray(settings.extensions)) {
    settings.extensions = [];
  }

  const hasMcpExt = settings.extensions.some(p => 
    p === EXT_PATH || 
    p.includes("/extensions/pi-mcp-adapter/index.ts") || 
    p.includes("/extensions/pi-mcp-adapter")
  );

  if (!hasMcpExt) {
    settings.extensions.push(EXT_PATH);
    console.log(`Added "${EXT_PATH}" to extensions array`);
  } else {
    console.log("Extension already configured in settings.json");
  }

  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");

  console.log("\nInstallation complete!");
  console.log("\nCreate ~/.pi/agent/mcp.json to configure MCP servers.");
  console.log("Restart pi to load the extension.");
}

main().catch((err) => {
  console.error(`\nInstallation failed: ${err.message}`);
  process.exit(1);
});
