import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config';

/**
 * Register this API's capabilities as MCP tools. Add your own with
 * `server.registerTool(name, { description, inputSchema }, handler)` —
 * see docs/guides/mcp.md.
 */
export function registerTools(server: McpServer): void {
  // Example tool: proxy the API's liveness probe. Replace with tools that
  // call your own endpoints or service functions.
  server.registerTool(
    'api_health',
    {
      title: 'API health',
      description: "Check the running API's liveness probe",
      inputSchema: {}
    },
    async () => {
      const res = await fetch(`${config.mcp.apiUrl}/healthz`);
      return { content: [{ type: 'text', text: await res.text() }] };
    }
  );
}
