# MCP server

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
