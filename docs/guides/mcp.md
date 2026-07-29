# MCP server

There are two, and they do opposite things:

|                                                                | What it exposes                                          |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| **`--mcp` module** (this page)                                 | _your_ API, as tools an agent can call                   |
| **[`chassis-mcp`](https://www.npmjs.com/package/chassis-mcp)** | Chassis itself — an agent calls it to _create_ a project |

If you want an agent to scaffold Chassis projects for you, that's the second
one; point your client at `npx -y chassis-mcp` and it gains
`list_chassis_options`, `create_chassis_project` and `chassis_conventions`.
The rest of this page is about the first.

---

The MCP module (`--mcp`) exposes your API to AI agents as
[Model Context Protocol](https://modelcontextprotocol.io) tools. It runs as a
**separate stdio process** — the way agent clients (Claude Desktop, etc.)
launch tool servers — not mounted in the HTTP app. That keeps the ESM-only MCP
SDK out of the compiled `dist` build; it runs via `tsx`.

## Run it

```bash
npm run mcp        # starts the stdio server
```

Point your agent client at that command. `MCP_API_URL` (default
`http://localhost:8000`) tells the server where the running API is.

## Add tools

Tools live in `src/mcp/tools.ts`. The example proxies the API's health probe;
add your own with `server.registerTool`:

```ts
server.registerTool(
  'list_widgets',
  { description: 'List all widgets', inputSchema: {} },
  async () => {
    const res = await fetch(`${config.mcp.apiUrl}/widgets`);
    return { content: [{ type: 'text', text: await res.text() }] };
  }
);
```

Give a tool inputs with a Zod raw shape as its `inputSchema`
(`{ id: z.string() }`), and the handler receives typed args.

Tools that call your own endpoints keep a single source of truth (the HTTP
API); tools can equally call service functions directly.
