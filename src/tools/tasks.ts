import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getTasksClient } from '../google/client.js'

export function registerTaskTools(server: McpServer): void {
  server.registerTool(
    'list_tasks',
    {
      description: 'Returns tasks in a specific task list',
      inputSchema: {
        taskListId: z.string().describe('The ID of the task list'),
        showCompleted: z
          .boolean()
          .optional()
          .describe('Include completed tasks (default: false)')
      }
    },
    async ({ taskListId, showCompleted = false }) => {
      const tasks = await getTasksClient()
      const res = await tasks.tasks.list({
        tasklist: taskListId,
        showCompleted,
        showHidden: showCompleted
      })
      const items = (res.data.items ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        notes: t.notes,
        due: t.due,
        completed: t.completed,
        status: t.status
      }))
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(items, null, 2) }]
      }
    }
  )

  server.registerTool(
    'create_task',
    {
      description: 'Creates a new task in a task list',
      inputSchema: {
        taskListId: z.string().describe('The ID of the task list'),
        title: z.string().describe('Task title'),
        notes: z.string().optional().describe('Task notes/description'),
        due: z
          .string()
          .optional()
          .describe('Due date as RFC3339 string, e.g. 2024-12-31T00:00:00.000Z')
      }
    },
    async ({ taskListId, title, notes, due }) => {
      const tasks = await getTasksClient()
      const res = await tasks.tasks.insert({
        tasklist: taskListId,
        requestBody: { title, notes, due }
      })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }]
      }
    }
  )

  server.registerTool(
    'update_task',
    {
      description:
        'Updates an existing task. Use status "completed" to mark done, "needsAction" to reopen.',
      inputSchema: {
        taskListId: z.string().describe('The ID of the task list'),
        taskId: z.string().describe('The ID of the task to update'),
        title: z.string().optional().describe('New task title'),
        notes: z.string().optional().describe('New task notes'),
        due: z.string().optional().describe('New due date as RFC3339 string'),
        status: z
          .enum(['needsAction', 'completed'])
          .optional()
          .describe('Task completion status')
      }
    },
    async ({ taskListId, taskId, title, notes, due, status }) => {
      const tasks = await getTasksClient()
      const requestBody: Record<string, string> = {}
      if (title !== undefined) requestBody.title = title
      if (notes !== undefined) requestBody.notes = notes
      if (due !== undefined) requestBody.due = due
      if (status !== undefined) requestBody.status = status
      const res = await tasks.tasks.patch({
        tasklist: taskListId,
        task: taskId,
        requestBody
      })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }]
      }
    }
  )

  server.registerTool(
    'delete_task',
    {
      description: 'Permanently deletes a task',
      inputSchema: {
        taskListId: z.string().describe('The ID of the task list'),
        taskId: z.string().describe('The ID of the task to delete')
      }
    },
    async ({ taskListId, taskId }) => {
      const tasks = await getTasksClient()
      await tasks.tasks.delete({ tasklist: taskListId, task: taskId })
      return {
        content: [{ type: 'text' as const, text: `Task ${taskId} deleted.` }]
      }
    }
  )
}
