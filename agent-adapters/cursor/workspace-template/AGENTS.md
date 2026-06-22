# Ent workspace

Mutable ring around immutable `ent/` kit. Consumer workspace index: open the **parent** folder that contains `ent/`, not `ent/` alone.

In a multi-root workspace, onboard and MCP ops use the **ent-workspace** folder (the consumer root), not the **ent-kit** folder (the kit source checkout).

<!-- ent:begin -->
| Path | Role |
|------|------|
| `ent/` | Installed kit — update via `git pull` only |
| `content/` | Site content |
| `.ent/` | Audit and onboard state |
| `.env` | Credentials |
<!-- ent:end -->
