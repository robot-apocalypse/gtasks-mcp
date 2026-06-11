import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getTasksClient, googleErrorMessage } from '../google/client.js'

export function registerTaskListTools(server: McpServer): void {
  server.registerTool(
    'list_task_lists',
    {
      description: 'Returns all Google Task lists for the authenticated user'
    },
    async () => {
      try {
        const tasks = await getTasksClient()
        const res = await tasks.tasklists.list()
        const lists = (res.data.items ?? []).map((l) => ({
          id: l.id,
          title: l.title,
          updated: l.updated
        }))
        return { content: [{ type: 'text' as const, text: JSON.stringify(lists, null, 2) }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: googleErrorMessage(err) }], isError: true }
      }
    }
  )
}
