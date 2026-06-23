import { parseWpTotalHeaders, normalizeRestPostTypes } from "./wp-rest-probe.mjs";

export function runWpRestProbeTest() {
  const headers = new Headers({
    "X-WP-Total": "137",
    "X-WP-TotalPages": "14",
  });
  const parsed = parseWpTotalHeaders(headers);
  if (parsed.total !== 137 || parsed.totalPages !== 14) {
    throw new Error("parseWpTotalHeaders should parse X-WP-Total headers");
  }

  const empty = parseWpTotalHeaders(new Headers());
  if (empty.total !== null || empty.totalPages !== null) {
    throw new Error("parseWpTotalHeaders should return null for missing headers");
  }

  const types = normalizeRestPostTypes({
    post: { name: "Posts", rest_base: "posts", visibility: { show_in_rest: true } },
    podcast: { name: "Episodes", rest_base: "podcast", visibility: { show_in_rest: true } },
    hidden: { name: "Hidden", rest_base: "hidden", visibility: { show_in_rest: false } },
    broken: null,
  });

  if (types.length !== 2) {
    throw new Error(`normalizeRestPostTypes expected 2 types, got ${types.length}`);
  }
  if (!types.some((t) => t.slug === "podcast" && t.rest_base === "podcast")) {
    throw new Error("normalizeRestPostTypes should include REST-visible podcast type");
  }
}
