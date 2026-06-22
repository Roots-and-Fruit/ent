import { loadWpMcpEnv, workspaceFromScriptMeta } from "./env.mjs";

export async function runWpMcpSmoke({ workspaceRoot, url, username, password } = {}) {
  const root = workspaceRoot ?? workspaceFromScriptMeta(import.meta.url);
  const creds = url && username && password ? { url, username, password } : loadWpMcpEnv(root);

  if (!creds.url || !creds.username || !creds.password) {
    return { ok: false, stage: "env", message: "WP_MCP_* incomplete" };
  }

  const siteRoot = creds.url.replace(/\/wp-json\/.*$/, "");
  const auth = Buffer.from(`${creds.username}:${creds.password}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  };

  try {
    const meRes = await fetch(`${siteRoot}/wp-json/wp/v2/users/me?context=edit`, { headers });
    if (!meRes.ok) {
      return { ok: false, stage: "rest", message: `REST /users/me ${meRes.status}` };
    }
  } catch (err) {
    return { ok: false, stage: "rest", message: err.message ?? String(err) };
  }

  const initBody = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "ent-smoke-test", version: "1.0.0" },
    },
  });

  let sessionId;
  try {
    const initRes = await fetch(creds.url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
      body: initBody,
    });
    if (!initRes.ok) {
      return { ok: false, stage: "mcp_init", message: `MCP initialize ${initRes.status}` };
    }
    sessionId = initRes.headers.get("mcp-session-id") ?? initRes.headers.get("Mcp-Session-Id");
    if (!sessionId) {
      return { ok: false, stage: "mcp_init", message: "No Mcp-Session-Id header" };
    }
  } catch (err) {
    return { ok: false, stage: "mcp_init", message: err.message ?? String(err) };
  }

  try {
    const listBody = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const listRes = await fetch(creds.url, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Mcp-Session-Id": sessionId,
      },
      body: listBody,
    });
    if (!listRes.ok) {
      return { ok: false, stage: "mcp_tools", message: `tools/list ${listRes.status}` };
    }
    const listJson = await listRes.json();
    const tools = listJson?.result?.tools ?? [];
    return { ok: true, stage: "complete", toolCount: tools.length };
  } catch (err) {
    return { ok: false, stage: "mcp_tools", message: err.message ?? String(err) };
  }
}
