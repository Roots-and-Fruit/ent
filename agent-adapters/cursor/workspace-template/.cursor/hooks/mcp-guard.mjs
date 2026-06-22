import process from "node:process";

const input = JSON.parse(await readStdin());
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

process.stdout.write(
  JSON.stringify({
    permission: "allow",
    agent_message:
      "Ent MCP: use workspace .env credentials. Re-run ent audit after MCP or .env changes.",
  })
);

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}
