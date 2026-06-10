import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { registerAllTools } from '../tools/index.js'

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'gtasks-mcp', version: '1.0.0' })
  registerAllTools(server)
  return server
}

export function createTransport(): WebStandardStreamableHTTPServerTransport {
  return new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
}
