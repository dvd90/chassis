import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools';

/**
 * MCP server exposing this API's capabilities to AI agents over stdio.
 * Run with `npm run mcp` (uses tsx — the MCP SDK is ESM-only and is kept
 * out of the compiled `dist` build on purpose).
 */
const server = new McpServer({ name: 'chassis', version: '0.1.0' });
registerTools(server);

void server.connect(new StdioServerTransport());
