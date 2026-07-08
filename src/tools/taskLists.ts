import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
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

  server.registerTool(
    'create_task_list',
    {
      description: 'Creates a new task list',
      inputSchema: {
        title: z.string().describe('Title of the new task list')
      }
    },
    async ({ title }) => {
      try {
        const tasks = await getTasksClient()
        const res = await tasks.tasklists.insert({ requestBody: { title } })
        return { content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: googleErrorMessage(err) }], isError: true }
      }
    }
  )

  server.registerTool(
    'update_task_list',
    {
      description: 'Renames a task list',
      inputSchema: {
        taskListId: z.string().describe('The ID of the task list'),
        title: z.string().describe('New title for the task list')
      }
    },
    async ({ taskListId, title }) => {
      try {
        const tasks = await getTasksClient()
        const res = await tasks.tasklists.patch({ tasklist: taskListId, requestBody: { title } })
        return { content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: googleErrorMessage(err) }], isError: true }
      }
    }
  )

  server.registerTool(
    'delete_task_list',
    {
      description: 'Permanently deletes a task list and all its tasks',
      inputSchema: {
        taskListId: z.string().describe('The ID of the task list to delete')
      }
    },
    async ({ taskListId }) => {
      try {
        const tasks = await getTasksClient()
        await tasks.tasklists.delete({ tasklist: taskListId })
        return { content: [{ type: 'text' as const, text: `Task list ${taskListId} deleted.` }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: googleErrorMessage(err) }], isError: true }
      }
    }
  )
}
