import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseEnvFile } from "./env.mjs";
import { enrichAbilitiesWithSmoke, countAbilitySummary, isAbilitySmokeBlocked } from "./ability-smoke.mjs";
import { probeRestInventory, fetchSamplePostId } from "./wp-rest-probe.mjs";
import { fetchWpMcpAbilities } from "./wp-smoke.mjs";

export const SITE_PROFILE_FILE = "site-profile.json";

function normalizeHost(input) {
  if (!input?.trim()) {
    return null;
  }
  try {
    const host = new URL(input.trim()).hostname.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function envFingerprint(env) {
  const payload = [env.WP_MCP_URL ?? "", env.WP_MCP_USERNAME ?? ""].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export async function fetchSiteIndex(siteRoot, headers = {}) {
  const res = await fetch(`${siteRoot.replace(/\/$/, "")}/wp-json`, {
    headers: { Accept: "application/json", ...headers },
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const data = await res.json();
  return {
    ok: true,
    name: data?.name ?? null,
    url: data?.url ?? null,
    host: normalizeHost(data?.url ?? siteRoot),
  };
}

export async function buildSiteProfile(workspaceRoot, options = {}) {
  if (options.mcpSmoke) {
    return buildSiteProfileFromSmoke(workspaceRoot, options);
  }
  return probeSiteProfile(workspaceRoot, options);
}

async function buildSiteProfileFromSmoke(workspaceRoot, options) {
  const root = path.resolve(workspaceRoot);
  const envPath = path.join(root, ".env");
  const env = parseEnvFile(envPath);
  const url = options.url?.trim();
  const username = options.username?.trim();
  const password = options.password?.trim();
  const smoke = options.mcpSmoke;

  const profile = {
    probed_at: new Date().toISOString(),
    env_fingerprint: envFingerprint(env),
    site: { name: null, url: null, host: null },
    mcp: {
      endpoint: url ?? null,
      endpoint_host: normalizeHost(url),
      server_name: options.mcpServerName ?? null,
      adapter_ok: Boolean(smoke?.ok),
      tool_count: smoke?.toolCount ?? 0,
      tools: [],
    },
    abilities: [],
    checks: {
      identity_ok: false,
      rest_ok: smoke ? smoke.stage !== "rest" && smoke.stage !== "env" : false,
      mcp_ok: Boolean(smoke?.ok && (smoke.toolCount ?? 0) > 0),
      abilities_usable: true,
    },
  };

  if (!url) {
    profile.rest = {
      post_meta_keys_sample: [],
      meta_prefixes: [],
      namespaces: [],
      namespace_probes: [],
      post_types: [],
      sample_post_id: null,
      sample_post_id: null,
    };
    profile.abilities_summary = countAbilitySummary(profile.abilities);
    return profile;
  }

  const siteRoot = url.replace(/\/wp-json\/.*$/, "");
  const headers =
    username && password
      ? { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` }
      : {};

  const index = await fetchSiteIndex(siteRoot, headers);
  if (index.ok) {
    profile.site.name = index.name;
    profile.site.url = index.url;
    profile.site.host = index.host;
  }

  const envHost = normalizeHost(url);
  const siteHost = profile.site.host ?? normalizeHost(siteRoot);
  profile.checks.identity_ok = Boolean(envHost && siteHost && envHost === siteHost);

  if (smoke?.ok && username && password) {
    try {
      const mcpResult = await fetchWpMcpAbilities({ url, username, password });
      profile.mcp.tools = (mcpResult.tools ?? []).map((t) => t.name).filter(Boolean);
      profile.abilities = mcpResult.abilities ?? [];
    } catch {
      profile.abilities = [];
    }
  }

  return finalizeSiteProfile(profile, {
    siteRoot,
    username,
    password,
    url,
    smokeOk: Boolean(smoke?.ok),
  });
}

async function finalizeSiteProfile(profile, { siteRoot, username, password, url, smokeOk }) {
  if (!url || !username || !password) {
    profile.rest = {
      post_meta_keys_sample: [],
      meta_prefixes: [],
      namespaces: [],
      namespace_probes: [],
      post_types: [],
      sample_post_id: null,
      sample_post_id: null,
    };
    profile.abilities_summary = countAbilitySummary(profile.abilities);
    return profile;
  }

  if (profile.checks.rest_ok) {
    profile.rest = await probeRestInventory({ siteRoot, username, password });
    profile.rest.sample_post_id = await fetchSamplePostId(siteRoot, username, password);
  } else {
    profile.rest = {
      post_meta_keys_sample: [],
      meta_prefixes: [],
      namespaces: [],
      namespace_probes: [],
      post_types: [],
      sample_post_id: null,
      sample_post_id: null,
    };
  }

  if (smokeOk && profile.abilities.length > 0) {
    const probeContext = { samplePostId: profile.rest?.sample_post_id ?? null };
    profile.abilities = await enrichAbilitiesWithSmoke(
      { url, username, password },
      profile.abilities,
      null,
      probeContext
    );
  } else if (profile.abilities.length > 0) {
    profile.abilities = profile.abilities.map((ability) => ({
      ...ability,
      discovered: true,
      executable: null,
      error_code: null,
      error: null,
    }));
  }

  profile.abilities_summary = countAbilitySummary(profile.abilities);
  profile.checks.abilities_usable =
    profile.abilities.length === 0 ||
    profile.abilities.every((ability) => !isAbilitySmokeBlocked(ability));

  return profile;
}

export async function probeSiteProfile(workspaceRoot, options = {}) {
  const root = path.resolve(workspaceRoot);
  const envPath = path.join(root, ".env");
  const env = parseEnvFile(envPath);
  const url = options.url?.trim() ?? env.WP_MCP_URL?.trim();
  const username = options.username?.trim() ?? env.WP_MCP_USERNAME?.trim();
  const password = options.password?.trim() ?? env.WP_MCP_PASSWORD?.trim();
  const mcpServerName = options.mcpServerName ?? null;

  const profile = {
    probed_at: new Date().toISOString(),
    env_fingerprint: envFingerprint(env),
    site: { name: null, url: null, host: null },
    mcp: {
      endpoint: url ?? null,
      endpoint_host: normalizeHost(url),
      server_name: mcpServerName,
      adapter_ok: false,
      tool_count: 0,
      tools: [],
    },
    abilities: [],
    checks: {
      identity_ok: false,
      rest_ok: false,
      mcp_ok: false,
      abilities_usable: true,
    },
  };

  if (!url || !username || !password) {
    profile.rest = {
      post_meta_keys_sample: [],
      meta_prefixes: [],
      namespaces: [],
      namespace_probes: [],
      post_types: [],
      sample_post_id: null,
      sample_post_id: null,
    };
    profile.abilities_summary = countAbilitySummary(profile.abilities);
    return profile;
  }

  const siteRoot = url.replace(/\/wp-json\/.*$/, "");
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}` };

  try {
    const meRes = await fetch(`${siteRoot}/wp-json/wp/v2/users/me?context=edit`, { headers });
    profile.checks.rest_ok = meRes.ok;
  } catch {
    profile.checks.rest_ok = false;
  }

  const index = await fetchSiteIndex(siteRoot, headers);
  if (index.ok) {
    profile.site.name = index.name;
    profile.site.url = index.url;
    profile.site.host = index.host;
  }

  const envHost = normalizeHost(url);
  const siteHost = profile.site.host ?? normalizeHost(siteRoot);
  profile.checks.identity_ok = Boolean(envHost && siteHost && envHost === siteHost);

  if (profile.checks.rest_ok) {
    try {
      const mcpResult = await fetchWpMcpAbilities({ url, username, password });
      profile.mcp.tools = (mcpResult.tools ?? []).map((t) => t.name).filter(Boolean);
      profile.mcp.tool_count = profile.mcp.tools.length;
      profile.mcp.adapter_ok = profile.mcp.tool_count > 0;
      profile.abilities = mcpResult.abilities ?? [];
      profile.checks.mcp_ok = profile.mcp.adapter_ok;
    } catch {
      profile.mcp.adapter_ok = false;
      profile.checks.mcp_ok = false;
    }
  }

  return finalizeSiteProfile(profile, {
    siteRoot,
    username,
    password,
    url,
    smokeOk: profile.checks.mcp_ok,
  });
}

export function readSiteProfile(workspaceRoot) {
  const profilePath = path.join(workspaceRoot, ".ent", SITE_PROFILE_FILE);
  if (!fs.existsSync(profilePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(profilePath, "utf8"));
  } catch {
    return null;
  }
}

export function writeSiteProfile(workspaceRoot, profile) {
  const profilePath = path.join(workspaceRoot, ".ent", SITE_PROFILE_FILE);
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + "\n", "utf8");
  return profilePath;
}

export function isSiteProfileStale(workspaceRoot, profile) {
  if (!profile?.probed_at) {
    return true;
  }
  const env = parseEnvFile(path.join(workspaceRoot, ".env"));
  if (profile.env_fingerprint !== envFingerprint(env)) {
    return true;
  }
  const ageMs = Date.now() - Date.parse(profile.probed_at);
  return ageMs > 7 * 24 * 60 * 60 * 1000;
}

export function abilityHaystack(abilities) {
  return (abilities ?? [])
    .map((a) => `${a.name} ${a.label} ${a.description}`.toLowerCase())
    .join(" ");
}

export function profileHasAbilityPattern(profile, patterns, { executableOnly = false } = {}) {
  const abilities = (profile?.abilities ?? []).filter((ability) =>
    executableOnly ? ability.executable === true : true
  );
  const haystack = abilityHaystack(abilities);
  if (!haystack) {
    return false;
  }
  return patterns.some((p) => haystack.includes(String(p).toLowerCase()));
}

export function listExecutableAbilityNames(profile) {
  return (profile?.abilities ?? [])
    .filter((ability) => ability.executable === true)
    .map((ability) => ability.name);
}

export function isAbilityAllowed(profile, abilityName) {
  const name = String(abilityName ?? "").trim();
  if (!name) {
    return false;
  }
  const match = (profile?.abilities ?? []).find((ability) => ability.name === name);
  return Boolean(match && match.executable === true);
}
