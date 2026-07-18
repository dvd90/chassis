import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools';

// Co-located with src/mcp so it is pruned together when MCP is declined.
describe('mcp tools', () => {
  it('registers the example tool without throwing', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    expect(() => registerTools(server)).not.toThrow();
  });
});
