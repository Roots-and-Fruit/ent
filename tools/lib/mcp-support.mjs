import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getEntRoot } from "./manifest.mjs";
import { isEntMcpServerConfig, readMcpJson } from "./mcp-config.mjs";

export function loadMcpSupportCatalog(entRoot = getEntRoot()) {
  const catalogPath = path.join(entRoot, "mcp-support-catalog.yaml");
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Missing MCP support catalog: ${catalogPath}`);
  }
  const doc = YAML.parse(fs.readFileSync(catalogPath, "utf8"));
  if (!Array.isArray(doc?.mcps) || doc.mcps.length === 0) {
    throw new Error("mcp-support-catalog.yaml must define a non-empty mcps array");
  }
  return doc;
}

function matchesPatterns(haystack, patterns = []) {
  const blob = String(haystack ?? "").toLowerCase();
  return patterns.some((pattern) => blob.includes(String(pattern).toLowerCase()));
}

function listMcpServers(workspaceRoot) {
  const mcpPath = path.join(workspaceRoot, ".cursor", "mcp.json");
  const parsed = readMcpJson(mcpPath);
  if (!parsed?.mcpServers) {
    return [];
  }
  return Object.entries(parsed.mcpServers).map(([name, config]) => ({
    name,
    config,
    isEntWordPress: isEntMcpServerConfig(config),
  }));
}

function detectLocalMcp(servers, detection, { excludeEnt = false } = {}) {
  const filtered = excludeEnt ? servers.filter((s) => !s.isEntWordPress) : servers;
  for (const server of filtered) {
    const blob = JSON.stringify({
      name: server.name,
      command: server.config?.command,
      args: server.config?.args,
      env: server.config?.env,
    });
    if (
      matchesPatterns(server.name, detection?.local_server_name_patterns) ||
      matchesPatterns(blob, detection?.local_args_patterns)
    ) {
      return { ok: true, server_name: server.name };
    }
  }
  return { ok: false, server_name: null };
}

function detectRemoteNamespace(siteProfile, namespace) {
  if (!namespace) {
    return { ok: false };
  }
  const namespaces = siteProfile?.rest?.namespaces ?? [];
  if (namespaces.includes(namespace)) {
    return { ok: true };
  }
  const probes = siteProfile?.rest?.namespace_probes ?? [];
  const probe = probes.find((p) => p.namespace === namespace);
  if (probe?.ok) {
    return { ok: true };
  }
  return { ok: false };
}

function detectContentPaths(workspaceRoot, paths = []) {
  for (const rel of paths) {
    const full = path.join(workspaceRoot, rel);
    if (fs.existsSync(full)) {
      return { ok: true, path: rel };
    }
  }
  return { ok: false, path: null };
}

function auditChildren(mcp, report) {
  const labels = mcp.check_labels ?? {};
  return (report.checks ?? [])
    .filter((check) => check.profile === mcp.audit_profile)
    .map((check) => ({
      id: check.id,
      label: labels[check.id] ?? check.message,
      checked: check.status === "pass",
      hint: check.status === "fail" ? check.message : "",
      group: mcp.id,
      kind: "check",
    }));
}

function extensionMcpStatus(mcp, workspaceRoot, siteProfile, servers) {
  const detection = mcp.detection ?? {};
  const local = detectLocalMcp(servers, detection, { excludeEnt: true });
  const remote = detection.remote_namespace
    ? detectRemoteNamespace(siteProfile, detection.remote_namespace)
    : { ok: false };
  const content = detection.content_paths
    ? detectContentPaths(workspaceRoot, detection.content_paths)
    : { ok: false };

  const signals = {
    local_config: local.ok,
    remote_namespace: remote.ok,
    content_present: content.ok,
  };

  const children = (mcp.status_items ?? []).map((item) => {
    const requires = item.requires ?? "local_config";
    const checked = Boolean(signals[requires]);
    return {
      id: `${mcp.id}_${item.id}`,
      label: item.label,
      checked,
      hint: checked ? "" : item.hint ?? "",
      group: mcp.id,
      kind: "status",
    };
  });

  const groupOk = children.length > 0 && children.every((c) => c.checked);
  const groupPartial = children.some((c) => c.checked);

  return {
    id: mcp.id,
    label: mcp.label,
    description: mcp.description ?? "",
    groupOk,
    groupPartial,
    children,
    missing: mcp.missing ?? {},
    signals,
    local_server_name: local.server_name,
  };
}

export function probeMcpSupport(workspaceRoot, report, siteProfile) {
  const catalog = loadMcpSupportCatalog();
  const servers = listMcpServers(workspaceRoot);

  return catalog.mcps.map((mcp) => {
    if (mcp.audit_profile) {
      const children = auditChildren(mcp, report);
      const groupOk = children.length > 0 && children.every((c) => c.checked);
      const groupPartial = children.some((c) => c.checked);
      return {
        id: mcp.id,
        label: mcp.label,
        description: mcp.description ?? "",
        groupOk,
        groupPartial,
        children,
        missing: mcp.missing ?? {},
        kind: "wordpress",
      };
    }
    return {
      kind: "extension",
      ...extensionMcpStatus(mcp, workspaceRoot, siteProfile, servers),
    };
  });
}

export function resolveMcpSupportSection(section, workspaceRoot, report, siteProfile) {
  const groups = probeMcpSupport(workspaceRoot, report, siteProfile);
  const items = [];

  for (const group of groups) {
    const headerChecked = group.groupOk;
    items.push({
      id: `${group.id}_header`,
      label: group.label,
      checked: headerChecked,
      hint: group.description,
      group: group.id,
      kind: "group_header",
      upcoming: false,
    });

    for (const child of group.children) {
      items.push({
        ...child,
        kind: child.kind ?? "status",
        upcoming: false,
      });
    }

    if (!group.groupOk && group.missing?.agent_prompt) {
      items.push({
        id: `${group.id}_agent_prompt`,
        label: "Ask your agent to set this up",
        checked: false,
        hint: group.missing.agent_prompt,
        hintLink: group.missing.hint_link ?? null,
        group: group.id,
        kind: "agent_prompt",
        upcoming: false,
      });
    }
  }

  return items;
}
