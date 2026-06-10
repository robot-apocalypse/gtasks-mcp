import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerTaskListTools } from './taskLists.js'
import { registerTaskTools } from './tasks.js'

export function registerAllTools(server: McpServer): void {
  registerTaskListTools(server)
  registerTaskTools(server)
}
