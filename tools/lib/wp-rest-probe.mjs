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

async function probeNamespace(siteRoot, namespace, headers) {
  const url = `${siteRoot.replace(/\/$/, "")}/wp-json/${namespace}`;
  try {
    const res = await fetch(url, { headers, method: "GET" });
    return { namespace, status: res.status, ok: res.ok };
  } catch (err) {
    return { namespace, status: 0, ok: false, error: err.message ?? String(err) };
  }
}

export async function probeRestInventory({ siteRoot, username, password }) {
  const root = siteRoot.replace(/\/$/, "");
  const headers = authHeaders(username, password);
  const inventory = {
    post_meta_keys_sample: [],
    meta_prefixes: [],
    namespaces: [],
    namespace_probes: [],
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
  return { ok: res.ok, status: res.status, url, body };
}
