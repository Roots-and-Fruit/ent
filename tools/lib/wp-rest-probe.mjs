function authHeaders(username, password) {
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  return {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  };
}

function uniqueMetaPrefixes(keys) {
  const prefixes = new Set();
  for (const key of keys) {
    if (!key.startsWith("_")) {
      continue;
    }
    const parts = key.split("_").filter(Boolean);
    if (parts.length >= 2) {
      prefixes.add(`_${parts[0]}_`);
    }
  }
  return [...prefixes].sort();
}

function extractNamespaces(routes) {
  const namespaces = new Set();
  for (const route of Object.keys(routes ?? {})) {
    const match = route.match(/^\/([^/]+\/v\d+)/);
    if (!match) {
      continue;
    }
    const ns = match[1];
    if (ns.startsWith("wp/")) {
      continue;
    }
    namespaces.add(ns);
  }
  return [...namespaces].sort();
}

export function parseWpTotalHeaders(headers) {
  const totalRaw = headers.get("X-WP-Total");
  const pagesRaw = headers.get("X-WP-TotalPages");
  const total = totalRaw != null && totalRaw !== "" ? Number(totalRaw) : null;
  const totalPages = pagesRaw != null && pagesRaw !== "" ? Number(pagesRaw) : null;
  return {
    total: Number.isFinite(total) ? total : null,
    totalPages: Number.isFinite(totalPages) ? totalPages : null,
  };
}

export function normalizeRestPostTypes(typesPayload) {
  const entries = [];
  for (const [slug, type] of Object.entries(typesPayload ?? {})) {
    if (!type || typeof type !== "object") {
      continue;
    }
    if (type.rest_base == null || type.visibility?.show_in_rest === false) {
      continue;
    }
    entries.push({
      slug,
      rest_base: type.rest_base,
      name: type.name ?? slug,
      hierarchical: Boolean(type.hierarchical),
    });
  }
  return entries.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function probeNamespace(siteRoot, namespace, headers) {
  const url = `${siteRoot.replace(/\/$/, "")}/wp-json/${namespace}`;
  try {
    const res = await fetch(url, { headers, method: "GET" });
    return { namespace, status: res.status, ok: res.ok };
  } catch (err) {
    return { namespace, status: 0, ok: false, error: err.message ?? String(err) };
  }
}

async function probePublishedTotal(siteRoot, restBase, headers) {
  const url = `${siteRoot.replace(/\/$/, "")}/wp-json/wp/v2/${restBase}?per_page=1&status=publish&_fields=id`;
  try {
    const res = await fetch(url, { headers, method: "GET" });
    const totals = parseWpTotalHeaders(res.headers);
    return {
      rest_base: restBase,
      status: res.status,
      ok: res.ok,
      published_total: res.ok ? totals.total : null,
    };
  } catch (err) {
    return { rest_base: restBase, status: 0, ok: false, published_total: null, error: err.message ?? String(err) };
  }
}

export async function probePostTypeInventory(siteRoot, headers, { maxTypes = 16 } = {}) {
  const root = siteRoot.replace(/\/$/, "");
  try {
    const typesRes = await fetch(`${root}/wp-json/wp/v2/types`, { headers });
    if (!typesRes.ok) {
      return [];
    }
    const types = normalizeRestPostTypes(await typesRes.json());
    const selected = types.slice(0, maxTypes);
    const totals = await Promise.all(
      selected.map((type) => probePublishedTotal(root, type.rest_base, headers))
    );
    const totalByBase = new Map(totals.map((row) => [row.rest_base, row]));
    return selected.map((type) => {
      const probe = totalByBase.get(type.rest_base) ?? {};
      return {
        ...type,
        rest_path: `/wp/v2/${type.rest_base}`,
        published_total: probe.published_total ?? null,
        probe_status: probe.status ?? null,
        probe_ok: probe.ok ?? false,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchSamplePostId(siteRoot, username, password) {
  const root = siteRoot.replace(/\/$/, "");
  const headers = authHeaders(username, password);

  for (const restBase of ["posts", "pages"]) {
    try {
      const res = await fetch(
        `${root}/wp-json/wp/v2/${restBase}?per_page=1&status=publish&_fields=id`,
        { headers }
      );
      if (!res.ok) {
        continue;
      }
      const items = await res.json();
      const id = items?.[0]?.id;
      if (typeof id === "number" && id > 0) {
        return id;
      }
    } catch {
      // try next type
    }
  }

  return null;
}

export async function probeRestInventory({ siteRoot, username, password }) {
  const root = siteRoot.replace(/\/$/, "");
  const headers = authHeaders(username, password);
  const inventory = {
    post_meta_keys_sample: [],
    meta_prefixes: [],
    namespaces: [],
    namespace_probes: [],
    post_types: [],
  };

  try {
    const indexRes = await fetch(`${root}/wp-json`, { headers });
    if (indexRes.ok) {
      const index = await indexRes.json();
      const namespaces = extractNamespaces(index.routes ?? {});
      inventory.namespaces = namespaces;
      const probes = await Promise.all(
        namespaces.slice(0, 8).map((ns) => probeNamespace(root, ns, headers))
      );
      inventory.namespace_probes = probes;
    }
  } catch {
    // REST index optional
  }

  inventory.post_types = await probePostTypeInventory(root, headers);

  try {
    const postRes = await fetch(
      `${root}/wp-json/wp/v2/posts?per_page=1&context=edit&_fields=id,meta`,
      { headers }
    );
    if (postRes.ok) {
      const posts = await postRes.json();
      const meta = posts?.[0]?.meta ?? {};
      inventory.post_meta_keys_sample = Object.keys(meta).sort();
      inventory.meta_prefixes = uniqueMetaPrefixes(inventory.post_meta_keys_sample);
    }
  } catch {
    // sample post optional
  }

  return inventory;
}

export async function wpRestGet({ siteRoot, username, password, restPath, query = "" }) {
  const root = siteRoot.replace(/\/$/, "");
  const headers = authHeaders(username, password);
  const path = restPath.startsWith("/") ? restPath : `/${restPath}`;
  const qs = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  const url = `${root}/wp-json${path}${qs}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  const totals = parseWpTotalHeaders(res.headers);
  return {
    ok: res.ok,
    status: res.status,
    url,
    body,
    headers: {
      total: totals.total,
      totalPages: totals.totalPages,
    },
  };
}
