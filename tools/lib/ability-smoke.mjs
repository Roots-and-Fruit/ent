import {
  callWpMcpTool,
  fetchWpMcpAbilities,
  openWpMcpSession,
} from "./wp-smoke.mjs";

function findExecuteTool(tools) {
  return tools.find((tool) => /execute-ability|execute_ability/i.test(tool.name ?? ""));
}

function parseExecuteOutcome(callJson) {
  if (callJson?.error) {
    const message = callJson.error.message ?? String(callJson.error.code ?? "error");
    const code = /permission|denied|forbidden|unauthorized/i.test(message)
      ? "permission_denied"
      : "mcp_error";
    return { executable: false, error_code: code, error: message };
  }

  const result = callJson?.result;
  if (!result) {
    return { executable: false, error_code: "empty_result", error: "No MCP result" };
  }

  if (result.isError) {
    const text =
      result.content?.map((block) => block.text).filter(Boolean).join(" ") ??
      result.message ??
      "MCP tool error";
    if (/permission|denied|forbidden|unauthorized/i.test(text)) {
      return { executable: false, error_code: "permission_denied", error: text };
    }
    if (/invalid|validation|required|missing|argument/i.test(text)) {
      return { executable: true, error_code: "needs_input", error: text };
    }
    return { executable: false, error_code: "tool_error", error: text };
  }

  return { executable: true, error_code: null, error: null };
}

function executeArgumentShapes(abilityName) {
  return [
    { ability_name: abilityName, parameters: {} },
    { ability_name: abilityName, input: {} },
    { ability: abilityName, input: {} },
    { name: abilityName, arguments: {} },
  ];
}

async function tryExecuteAbility(creds, sessionId, headers, executeTool, abilityName) {
  for (const args of executeArgumentShapes(abilityName)) {
    try {
      const callJson = await callWpMcpTool(creds, sessionId, headers, executeTool.name, args);
      const outcome = parseExecuteOutcome(callJson);
      if (outcome.executable || outcome.error_code === "permission_denied") {
        return outcome;
      }
    } catch (err) {
      const message = err.message ?? String(err);
      if (/permission|denied|forbidden|401|403/i.test(message)) {
        return { executable: false, error_code: "permission_denied", error: message };
      }
    }
  }
  return { executable: false, error_code: "execute_failed", error: "Could not execute ability" };
}

export async function enrichAbilitiesWithSmoke(creds, abilities, mcpSession = null) {
  if (!abilities?.length) {
    return [];
  }

  let headers;
  let sessionId;
  let tools;
  let executeTool;

  if (mcpSession) {
    ({ headers, sessionId, tools } = mcpSession);
  } else {
    const mcpResult = await fetchWpMcpAbilities(creds);
    tools = mcpResult.tools;
    const session = await openWpMcpSession(creds);
    headers = session.headers;
    sessionId = session.sessionId;
  }

  executeTool = findExecuteTool(tools);
  if (!executeTool) {
    return abilities.map((ability) => ({
      ...ability,
      discovered: true,
      executable: null,
      error_code: "no_execute_tool",
      error: "MCP execute-ability tool not found",
    }));
  }

  const enriched = [];
  for (const ability of abilities) {
    const outcome = await tryExecuteAbility(creds, sessionId, headers, executeTool, ability.name);
    enriched.push({
      ...ability,
      discovered: true,
      executable: outcome.executable,
      error_code: outcome.error_code,
      error: outcome.error,
    });
  }
  return enriched;
}

export function abilityNamespace(name) {
  const slash = String(name).indexOf("/");
  if (slash === -1) {
    return name;
  }
  return name.slice(0, slash);
}

export function countAbilitySummary(abilities) {
  const list = abilities ?? [];
  return {
    discovered: list.length,
    executable: list.filter((a) => a.executable === true).length,
    blocked: list.filter((a) => a.executable === false).length,
    unknown: list.filter((a) => a.executable == null).length,
  };
}
