import {
  callWpMcpTool,
  fetchWpMcpAbilities,
  openWpMcpSession,
} from "./wp-smoke.mjs";

function findExecuteTool(tools) {
  return tools.find((tool) => /execute-ability|execute_ability/i.test(tool.name ?? ""));
}

export function abilityInputSchema(ability) {
  return ability?.input_schema ?? ability?.inputSchema ?? null;
}

export function abilityRequiresSmokeInput(ability) {
  const schema = abilityInputSchema(ability);
  if (Array.isArray(schema?.required) && schema.required.length > 0) {
    return true;
  }

  const props = schema?.properties ?? {};
  const keys = Object.keys(props);
  if (keys.length === 0) {
    const name = String(ability?.name ?? "").toLowerCase();
    return /\/(get-|update-|delete-|publish-|verify-|create-)/.test(name);
  }

  const common = ["post_id", "id", "file_name", "snippet_id", "slug", "name"];
  return common.some((key) => key in props);
}

export function buildSmokeProbeInput(ability, probeContext = {}) {
  const schema = abilityInputSchema(ability);
  const props = schema?.properties ?? {};
  const required = schema?.required ?? [];
  const input = {};

  if (probeContext.samplePostId) {
    if ("post_id" in props || required.includes("post_id")) {
      input.post_id = probeContext.samplePostId;
    }
    if ("id" in props || (required.includes("id") && !("post_id" in props))) {
      input.id = probeContext.samplePostId;
    }
  }
  if ("file_name" in props && probeContext.sampleSnippetId) {
    input.file_name = probeContext.sampleSnippetId;
  }

  return input;
}

export function isEnginePingAbility(ability) {
  return String(ability?.name ?? "").endsWith("/ping");
}

function looksLikeInputError(message) {
  return /required|missing|argument|invalid input|validation|must provide/i.test(String(message ?? ""));
}

export function reclassifySmokeOutcome(outcome, ability) {
  if (outcome.executable === true) {
    return outcome;
  }

  if (outcome.error_code === "needs_input") {
    return { ...outcome, executable: null };
  }

  if (outcome.error_code !== "permission_denied") {
    return outcome;
  }

  if (isEnginePingAbility(ability)) {
    return outcome;
  }

  if (abilityRequiresSmokeInput(ability) || looksLikeInputError(outcome.error)) {
    return {
      executable: null,
      error_code: "needs_input",
      error: outcome.error,
    };
  }

  return outcome;
}

export function isAbilitySmokeBlocked(ability) {
  if (ability?.executable === true) {
    return false;
  }
  if (ability?.executable == null) {
    return false;
  }
  if (ability?.error_code === "needs_input") {
    return false;
  }
  return ability?.executable === false;
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
      return { executable: null, error_code: "needs_input", error: text };
    }
    return { executable: false, error_code: "tool_error", error: text };
  }

  return { executable: true, error_code: null, error: null };
}

function executeArgumentShapes(abilityName, probeInput = {}) {
  const inputs = [{}];
  if (Object.keys(probeInput).length > 0) {
    inputs.push(probeInput);
  }

  const shapes = [];
  for (const input of inputs) {
    shapes.push(
      { ability_name: abilityName, parameters: input },
      { ability_name: abilityName, input },
      { ability: abilityName, input },
      { name: abilityName, arguments: input }
    );
  }
  return shapes;
}

async function tryExecuteAbility(creds, sessionId, headers, executeTool, ability, probeContext) {
  const probeInput = buildSmokeProbeInput(ability, probeContext);
  const tryInputsFirst = abilityRequiresSmokeInput(ability) && Object.keys(probeInput).length > 0;
  const inputOrder = tryInputsFirst ? [probeInput, {}] : [{}, probeInput].filter((v, i, a) => i === 0 || Object.keys(v).length > 0);

  for (const input of inputOrder) {
    for (const args of executeArgumentShapes(ability.name, input)) {
      try {
        const callJson = await callWpMcpTool(creds, sessionId, headers, executeTool.name, args);
        const outcome = reclassifySmokeOutcome(parseExecuteOutcome(callJson), ability);
        if (outcome.executable === true) {
          return outcome;
        }
        if (outcome.error_code === "permission_denied" && !isEnginePingAbility(ability)) {
          continue;
        }
        if (outcome.executable === null) {
          return outcome;
        }
      } catch (err) {
        const message = err.message ?? String(err);
        if (/permission|denied|forbidden|401|403/i.test(message)) {
          const denied = reclassifySmokeOutcome(
            { executable: false, error_code: "permission_denied", error: message },
            ability
          );
          if (denied.executable !== false) {
            return denied;
          }
          continue;
        }
      }
    }
  }

  return { executable: false, error_code: "execute_failed", error: "Could not execute ability" };
}

export async function enrichAbilitiesWithSmoke(creds, abilities, mcpSession = null, probeContext = {}) {
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
    const outcome = await tryExecuteAbility(
      creds,
      sessionId,
      headers,
      executeTool,
      ability,
      probeContext
    );
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

export function listEnginePingAbilities(abilities) {
  return (abilities ?? []).filter((ability) => isEnginePingAbility(ability));
}

export function evaluateCompanionEngineCheck(abilities) {
  const pings = listEnginePingAbilities(abilities);
  if (pings.length === 0) {
    return {
      status: "skip",
      message: "No engine ping ability discovered (optional)",
      detail: "",
    };
  }

  const executable = pings.find((ability) => ability.executable === true);
  if (executable) {
    return {
      status: "pass",
      message: `${executable.name} executable`,
      detail: executable.name,
    };
  }

  const blocked = pings.filter((ability) => isAbilitySmokeBlocked(ability));
  if (blocked.length > 0) {
    return {
      status: "fail",
      message: `Engine ping blocked for MCP user (${blocked.map((a) => a.name).join(", ")})`,
      detail: blocked.map((a) => a.name).join(", "),
    };
  }

  return {
    status: "skip",
    message: "Engine ping status inconclusive — re-run audit after configuring abilities",
    detail: pings.map((a) => a.name).join(", "),
  };
}

export function countAbilitySummary(abilities) {
  const list = abilities ?? [];
  return {
    discovered: list.length,
    executable: list.filter((a) => a.executable === true).length,
    blocked: list.filter((a) => isAbilitySmokeBlocked(a)).length,
    needs_input: list.filter((a) => a.executable == null && a.error_code === "needs_input").length,
    unknown: list.filter(
      (a) => a.executable == null && a.error_code !== "needs_input" && a.error_code !== "no_execute_tool"
    ).length,
  };
}
