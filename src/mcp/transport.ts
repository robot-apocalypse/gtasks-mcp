import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { registerAllTools } from '../tools/index.js'

export async function handleMcpRequest(request: Request): Promise<Response> {
  const server = new McpServer({ name: 'gtasks-mcp', version: '1.0.0' })
  registerAllTools(server)

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  // Close the server after the transport closes, not before the response is fully streamed
  transport.onclose = () => { server.close().catch(() => {}) }

  await server.connect(transport)
  return transport.handleRequest(request)
}
