import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function getEntRoot() {
  return ENT_ROOT;
}

export function loadManifest(entRoot = ENT_ROOT) {
  const manifestPath = path.join(entRoot, "ent.manifest.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing manifest: ${manifestPath}`);
  }
  const raw = fs.readFileSync(manifestPath, "utf8");
  return YAML.parse(raw);
}

export function validateManifest(manifest) {
  const errors = [];
  const ids = new Set();

  function recordId(id, context) {
    if (!id || typeof id !== "string") {
      errors.push(`${context}: id must be a non-empty string`);
      return;
    }
    if (ids.has(id)) {
      errors.push(`Duplicate check id: ${id}`);
    }
    ids.add(id);
  }

  if (!manifest || typeof manifest !== "object") {
    return ["Manifest must be a YAML object"];
  }

  if (!manifest.version || typeof manifest.version !== "string") {
    errors.push("version must be a string");
  }

  if (!Array.isArray(manifest.core_checks) || manifest.core_checks.length === 0) {
    errors.push("core_checks must be a non-empty array");
  } else {
    for (const check of manifest.core_checks) {
      recordId(check?.id, "core_checks");
      if (!check?.description) {
        errors.push(`core_checks.${check?.id ?? "?"}: description required`);
      }
    }
  }

  if (!manifest.profiles || typeof manifest.profiles !== "object") {
    errors.push("profiles must be an object");
  } else {
    for (const [profileName, profile] of Object.entries(manifest.profiles)) {
      if (!profile?.description) {
        errors.push(`profiles.${profileName}: description required`);
      }
      if (!Array.isArray(profile?.checks) || profile.checks.length === 0) {
        errors.push(`profiles.${profileName}: checks must be a non-empty array`);
        continue;
      }
      for (const check of profile.checks) {
        recordId(check?.id, `profiles.${profileName}`);
        if (!check?.description) {
          errors.push(`profiles.${profileName}.${check?.id ?? "?"}: description required`);
        }
      }
    }
  }

  if (!Array.isArray(manifest.workspace_scaffold) || manifest.workspace_scaffold.length === 0) {
    errors.push("workspace_scaffold must be a non-empty array");
  }

  if (!manifest.agents || typeof manifest.agents !== "object") {
    errors.push("agents must be an object");
  } else {
    for (const [agentName, agent] of Object.entries(manifest.agents)) {
      if (!agent?.template) {
        errors.push(`agents.${agentName}: template required`);
      }
    }
  }

  return errors;
}
