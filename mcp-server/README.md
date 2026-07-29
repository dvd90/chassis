# chassis-mcp

An [MCP](https://modelcontextprotocol.io) server that scaffolds
[Chassis](https://dvd90.github.io/chassis/) backends — a decorator-driven
**Express 5 + TypeScript** starter with an optional database, auth provider
and Next.js front end.

It lets an agent go from _"build me an API with Postgres and auth"_ to a
project that already typechecks, lints and tests green, without knowing the
CLI's flags.

## Install

Point your MCP client at the package. No global install needed:

```json
{
  "mcpServers": {
    "chassis": {
      "command": "npx",
      "args": ["-y", "chassis-mcp"]
    }
  }
}
```

<details>
<summary>Where that file lives</summary>

- **Claude Desktop** — `claude_desktop_config.json`
- **Claude Code** — `claude mcp add chassis -- npx -y chassis-mcp`
- **Cursor** — `.cursor/mcp.json`
- **VS Code** — `.vscode/mcp.json`

</details>

## Tools

| Tool                     | What it does                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `list_chassis_options`   | The presets, databases, auth providers and add-ons on offer. Call it first when the stack isn't decided. |
| `create_chassis_project` | Scaffolds into a new or empty directory and reports the layout, the API root and the next commands.      |
| `chassis_conventions`    | How to write code in the result — controllers, responses, errors, validation, definition of done.        |

The option list is **imported from `create-chassis`**, not restated here, so
this server can't advertise a stack the CLI doesn't support. An unsupported
value is rejected with the list of valid ones before the CLI runs.

## Example

> Build me an API with Postgres, JWT auth and a Next.js front end, in ./shop

```
list_chassis_options       → sees `fullstack`, and that web=true implies a monorepo
create_chassis_project     → { directory: "./shop", preset: "fullstack" }
                           ← { monorepo: true, apiRoot: "apps/api", nextSteps: [...] }
chassis_conventions        → reads ./shop/AGENTS.md before writing any code
```

What lands is a workspaces monorepo with `apps/api` and `apps/web`, auth wired
on both sides, and only the modules that were chosen — declined ones are
removed from the source _and_ from `package.json`.

## Notes

- **Nothing is overwritten.** A non-empty target directory is refused.
- `install` defaults to `false` because it's slow; run `npm install` yourself,
  or pass `install: true`.
- Creating a project downloads the template from GitHub, so it needs network
  access.
- This is **not** the MCP server inside a generated project (`npm run mcp`),
  which exposes _that project's_ API as tools. This one creates projects.

MIT · [source](https://github.com/dvd90/chassis/tree/master/mcp-server) ·
[docs](https://dvd90.github.io/chassis/)
