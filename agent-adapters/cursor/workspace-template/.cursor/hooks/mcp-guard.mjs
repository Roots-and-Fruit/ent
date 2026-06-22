import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { readHookInput, hookProjectDir } from "./hook-io.mjs";
import { buildMcpGuardMessage } from "./site-snapshot.mjs";

const input = await readHookInput();
const toolName = String(input.tool_name ?? "");
const toolInputRaw = input.tool_input;
const toolInput =
  typeof toolInputRaw === "string"
    ? safeParse(toolInputRaw)
    : toolInputRaw && typeof toolInputRaw === "object"
      ? toolInputRaw
      : {};

const isWordPressMcp = /wordpress|mcp-adapter|execute-ability|discover-abilities/i.test(
  `${toolName} ${JSON.stringify(input.command ?? "")} ${JSON.stringify(input.url ?? "")}`
);

const allow = { permission: "allow" };

if (!isWordPressMcp) {
  process.stdout.write(JSON.stringify(allow));
  process.exit(0);
}

const projectDir = hookProjectDir(input);
const profilePath = path.join(projectDir, ".ent", "site-profile.json");
let profile = null;
if (fs.existsSync(profilePath)) {
  try {
    profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  } catch {
    profile = null;
  }
}

process.stdout.write(
  JSON.stringify({
    permission: "allow",
    agent_message: buildMcpGuardMessage(profile, toolName, toolInput),
  })
);

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
