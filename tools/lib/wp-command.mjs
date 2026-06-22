import fs from "node:fs";
import path from "node:path";
import { parseEnvFile } from "./env.mjs";
import { enrichAbilitiesWithSmoke } from "./ability-smoke.mjs";
import { wpRestGet } from "./wp-rest-probe.mjs";
import { callWpMcpTool, fetchWpMcpAbilities, openWpMcpSession } from "./wp-smoke.mjs";

function loadCreds(workspaceRoot, envFile) {
  const envPath = envFile ? path.resolve(envFile) : path.join(workspaceRoot, ".env");
  const env = parseEnvFile(envPath);
  const url = env.WP_MCP_URL?.trim();
  const username = env.WP_MCP_USERNAME?.trim();
  const password = env.WP_MCP_PASSWORD?.trim();
  if (!url || !username || !password) {
    throw new Error("WP_MCP_URL, WP_MCP_USERNAME, WP_MCP_PASSWORD required in workspace .env");
  }
  const siteRoot = url.replace(/\/wp-json\/.*$/, "");
  return { url, username, password, siteRoot };
}

export async function runWpGet(workspaceRoot, options = {}) {
  const creds = loadCreds(workspaceRoot, options.envFile);
  const restPath = options.path ?? "/wp/v2/posts";
  const query = options.query ?? "";
  const result = await wpRestGet({
    siteRoot: creds.siteRoot,
    username: creds.username,
    password: creds.password,
    restPath,
    query,
  });
  return result;
}

export async function runWpAbilityExecute(workspaceRoot, options = {}) {
  const creds = loadCreds(workspaceRoot, options.envFile);
  const abilityName = options.name?.trim();
  if (!abilityName) {
    throw new Error("wp ability requires --name <ability-name>");
  }

  let input = {};
  if (options.input) {
    try {
      input = JSON.parse(options.input);
    } catch {
      throw new Error("--input must be valid JSON");
    }
  }

  const { tools } = await fetchWpMcpAbilities(creds);
  const executeTool = tools.find((tool) => /execute-ability|execute_ability/i.test(tool.name ?? ""));
  if (!executeTool) {
    throw new Error("MCP execute-ability tool not found on site");
  }

  const { headers, sessionId } = await openWpMcpSession(creds);
  const argShapes = [
    { ability_name: abilityName, parameters: input },
    { ability_name: abilityName, input },
    { ability: abilityName, input },
    { name: abilityName, arguments: input },
  ];

  let lastError = null;
  for (const args of argShapes) {
    try {
      const callJson = await callWpMcpTool(creds, sessionId, headers, executeTool.name, args);
      return { ability: abilityName, result: callJson };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("execute-ability failed");
}

export async function runWpAbilitySmoke(workspaceRoot, options = {}) {
  const creds = loadCreds(workspaceRoot, options.envFile);
  const { abilities } = await fetchWpMcpAbilities(creds);
  const enriched = await enrichAbilitiesWithSmoke(creds, abilities);
  return { abilities: enriched };
}
