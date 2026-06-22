import { loadWpMcpEnv } from "./env.mjs";

function authHeaders(username, password) {
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  return {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  };
}

async function mcpPost(url, headers, body, sessionId) {
  const requestHeaders = {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
  };
  if (sessionId) {
    requestHeaders["Mcp-Session-Id"] = sessionId;
  }
  return fetch(url, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

export async function openWpMcpSession({ url, username, password }) {
  const headers = authHeaders(username, password);
  const initRes = await mcpPost(
    url,
    headers,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "ent-onboard", version: "1.0.0" },
      },
    },
    null
  );
  if (!initRes.ok) {
    throw new Error(`MCP initialize ${initRes.status}`);
  }
  const sessionId =
    initRes.headers.get("mcp-session-id") ?? initRes.headers.get("Mcp-Session-Id");
  if (!sessionId) {
    throw new Error("No Mcp-Session-Id header");
  }
  return { headers, sessionId };
}

async function listToolsWithSession(creds) {
  const { headers, sessionId } = await openWpMcpSession(creds);
  const listRes = await mcpPost(
    creds.url,
    headers,
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    sessionId
  );
  if (!listRes.ok) {
    throw new Error(`tools/list ${listRes.status}`);
  }
  const listJson = await listRes.json();
  return { headers, sessionId, tools: listJson?.result?.tools ?? [] };
}

export async function callWpMcpTool(creds, sessionId, headers, toolName, args = {}) {
  const callRes = await mcpPost(
    creds.url,
    headers,
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    },
    sessionId
  );
  if (!callRes.ok) {
    throw new Error(`tools/call ${toolName} ${callRes.status}`);
  }
  return callRes.json();
}

export function parseDiscoverAbilitiesResult(callJson) {
  const result = callJson?.result;
  if (!result) {
    return [];
  }

  if (Array.isArray(result.abilities)) {
    return normalizeAbilities(result.abilities);
  }

  const structured = result.structuredContent;
  if (structured && Array.isArray(structured.abilities)) {
    return normalizeAbilities(structured.abilities);
  }

  const content = result.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === "text" && block.text) {
        try {
          const parsed = JSON.parse(block.text);
          if (Array.isArray(parsed)) {
            return normalizeAbilities(parsed);
          }
          if (Array.isArray(parsed.abilities)) {
            return normalizeAbilities(parsed.abilities);
          }
        } catch {
          // try next block
        }
      }
    }
  }

  return [];
}

function normalizeAbilities(raw) {
  return raw
    .map((item) => ({
      name: item.name ?? item.id ?? item.ability_name ?? "",
      label: item.label ?? item.title ?? item.name ?? "",
      description: item.description ?? item.summary ?? "",
    }))
    .filter((item) => item.name);
}

export async function fetchWpMcpAbilities({ url, username, password } = {}) {
  const creds = url && username && password ? { url, username, password } : loadWpMcpEnv();
  if (!creds.url || !creds.username || !creds.password) {
    return { tools: [], abilities: [] };
  }

  const { headers, sessionId, tools } = await listToolsWithSession(creds);
  const discoverTool = tools.find((tool) => /discover-abilities/i.test(tool.name ?? ""));
  if (!discoverTool) {
    return { tools, abilities: [] };
  }

  const callJson = await callWpMcpTool(creds, sessionId, headers, discoverTool.name, {});
  const abilities = parseDiscoverAbilitiesResult(callJson);
  return { tools, abilities };
}

export async function runWpMcpSmoke({ workspaceRoot, url, username, password } = {}) {
  const creds = url && username && password ? { url, username, password } : loadWpMcpEnv(workspaceRoot);

  if (!creds.url || !creds.username || !creds.password) {
    return { ok: false, stage: "env", message: "WP_MCP_* incomplete" };
  }

  const siteRoot = creds.url.replace(/\/wp-json\/.*$/, "");
  const headers = authHeaders(creds.username, creds.password);

  try {
    const meRes = await fetch(`${siteRoot}/wp-json/wp/v2/users/me?context=edit`, { headers });
    if (!meRes.ok) {
      return { ok: false, stage: "rest", message: `REST /users/me ${meRes.status}` };
    }
  } catch (err) {
    return { ok: false, stage: "rest", message: err.message ?? String(err) };
  }

  try {
    const { tools } = await listToolsWithSession(creds);
    return { ok: true, stage: "complete", toolCount: tools.length };
  } catch (err) {
    const stage = /initialize/i.test(err.message) ? "mcp_init" : "mcp_tools";
    return { ok: false, stage, message: err.message ?? String(err) };
  }
}
