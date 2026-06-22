import fs from "node:fs";
import path from "node:path";

const input = JSON.parse(await readStdin());
const filePath = String(input.file_path ?? input.path ?? "");

if (!/mcp\.json$/i.test(filePath)) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

process.stdout.write(
  JSON.stringify({
    agent_message:
      "MCP config: edit agent-adapters templates in ent/, then run ent sync. Workspace .cursor/mcp.json is generated.",
  })
);

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
