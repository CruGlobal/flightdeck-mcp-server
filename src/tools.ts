import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FlightdeckApiError, type FlightdeckClient } from "./client.js";

// Flightdeck resource ids are integers, and the API returns them as numbers.
// Accept either a number or a numeric string so a client can pass an id straight
// back from a previous response without stringifying it first.
const id = (description: string) => z.union([z.string(), z.number()]).describe(description);

// Pagination is shared by every list tool.
const pagination = {
  page: z.number().int().positive().optional().describe("1-based page number (default 1)"),
  per_page: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Results per page, max 100 (default 50)"),
};

// Writable work-item attributes, mirrored from the API's strong params. Every
// field is optional so the same shape serves both create and update; the tools
// add their own required fields (project_id / work_item_id) on top.
const workItemFields = {
  title: z.string().optional().describe("Work item title"),
  description: z.string().optional().describe("Plain-text description (empty string clears it)"),
  priority: z
    .enum(["urgent", "high", "medium", "low", "none"])
    .optional()
    .describe("Priority of the work item"),
  state_id: id("State id — must belong to the item's project").optional(),
  parent_id: id("Parent work item id — same project").optional(),
  cycle_id: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .describe("Cycle id (same project), or null to remove the item from its cycle"),
  assignee_ids: z
    .array(z.union([z.string(), z.number()]))
    .optional()
    .describe("User ids to assign; must be members of the workspace"),
  label_ids: z
    .array(z.union([z.string(), z.number()]))
    .optional()
    .describe("Label ids to apply; must belong to the item's project"),
  start_date: z.string().nullable().optional().describe("ISO 8601 date (YYYY-MM-DD), or null to clear"),
  target_date: z.string().nullable().optional().describe("ISO 8601 date (YYYY-MM-DD), or null to clear"),
  estimate_point: z.number().nullable().optional().describe("Estimate points, or null to clear"),
  draft: z.boolean().optional().describe("Whether the item is a draft"),
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

// Wrap each handler so an API error becomes a clean, model-readable tool error
// instead of an unhandled rejection.
function guard(handler: () => Promise<unknown>): () => Promise<ToolResult> {
  return async () => {
    try {
      return ok(await handler());
    } catch (error) {
      const message =
        error instanceof FlightdeckApiError
          ? `Flightdeck API error (${error.status}): ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
      return { content: [{ type: "text", text: message }], isError: true };
    }
  };
}

// Build a request body from only the keys the caller actually supplied, so a
// PATCH never blanks out fields that were merely omitted.
function pick<T extends Record<string, unknown>>(source: T, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

const WRITABLE_KEYS = Object.keys(workItemFields);

export function registerTools(server: McpServer, client: FlightdeckClient): void {
  // ---- Identity ----------------------------------------------------------
  server.registerTool(
    "get_me",
    {
      title: "Get current identity",
      description:
        "Return the user, workspace and token behind the configured Flightdeck API token. Useful as a connectivity/health check.",
      inputSchema: {},
    },
    guard(() => client.me()),
  );

  // ---- Projects ----------------------------------------------------------
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List the projects in the token's workspace (paginated).",
      inputSchema: { ...pagination },
    },
    async (args) => guard(() => client.listProjects({ page: args.page, per_page: args.per_page }))(),
  );

  server.registerTool(
    "get_project",
    {
      title: "Get a project",
      description: "Retrieve a single project by its id.",
      inputSchema: { project_id: id("Project id") },
    },
    async (args) => guard(() => client.getProject(args.project_id))(),
  );

  // ---- Work items --------------------------------------------------------
  server.registerTool(
    "list_work_items",
    {
      title: "List work items",
      description:
        "List work items in a project (summary shape), ordered by sequence number. Paginated.",
      inputSchema: { project_id: id("Project id"), ...pagination },
    },
    async (args) =>
      guard(() =>
        client.listWorkItems(args.project_id, { page: args.page, per_page: args.per_page }),
      )(),
  );

  server.registerTool(
    "get_work_item",
    {
      title: "Get a work item",
      description:
        "Retrieve one work item by id (full shape: description + assignees, labels, parent, cycle).",
      inputSchema: { work_item_id: id("Work item id") },
    },
    async (args) => guard(() => client.getWorkItem(args.work_item_id))(),
  );

  server.registerTool(
    "create_work_item",
    {
      title: "Create a work item",
      description:
        "Create a work item in a project. `title` is required; all other fields optional. Related ids (state/cycle/parent/label) must belong to the same project; assignees must be workspace members.",
      inputSchema: {
        project_id: id("Project id to create the item in"),
        title: z.string().describe("Work item title (required)"),
        ...Object.fromEntries(
          Object.entries(workItemFields).filter(([key]) => key !== "title"),
        ),
      },
    },
    async (args) => {
      const { project_id, ...rest } = args as Record<string, unknown> & { project_id: string };
      const attributes = pick(rest as Record<string, unknown>, WRITABLE_KEYS);
      return guard(() => client.createWorkItem(project_id, attributes))();
    },
  );

  server.registerTool(
    "update_work_item",
    {
      title: "Update a work item",
      description:
        "Update a work item by id. Only the fields you pass are changed. Pass cycle_id: null to remove it from its cycle.",
      inputSchema: {
        work_item_id: id("Work item id"),
        ...workItemFields,
      },
    },
    async (args) => {
      const { work_item_id, ...rest } = args as Record<string, unknown> & {
        work_item_id: string;
      };
      const attributes = pick(rest as Record<string, unknown>, WRITABLE_KEYS);
      return guard(() => client.updateWorkItem(work_item_id, attributes))();
    },
  );

  server.registerTool(
    "delete_work_item",
    {
      title: "Delete a work item",
      description: "Permanently delete a work item by id.",
      inputSchema: { work_item_id: id("Work item id") },
    },
    async (args) => guard(() => client.deleteWorkItem(args.work_item_id).then(() => ({ deleted: true })))(),
  );

  // ---- Cycles ------------------------------------------------------------
  server.registerTool(
    "list_cycles",
    {
      title: "List cycles",
      description: "List the cycles (sprints) of a project. Paginated.",
      inputSchema: { project_id: id("Project id"), ...pagination },
    },
    async (args) =>
      guard(() => client.listCycles(args.project_id, { page: args.page, per_page: args.per_page }))(),
  );

  server.registerTool(
    "get_cycle",
    {
      title: "Get a cycle",
      description: "Retrieve one cycle by id (includes progress_percent).",
      inputSchema: { cycle_id: id("Cycle id") },
    },
    async (args) => guard(() => client.getCycle(args.cycle_id))(),
  );

  // ---- Modules -----------------------------------------------------------
  server.registerTool(
    "list_modules",
    {
      title: "List modules",
      description: "List the modules (feature groups) of a project. Paginated.",
      inputSchema: { project_id: id("Project id"), ...pagination },
    },
    async (args) =>
      guard(() => client.listModules(args.project_id, { page: args.page, per_page: args.per_page }))(),
  );

  server.registerTool(
    "get_module",
    {
      title: "Get a module",
      description: "Retrieve one module by id (includes progress_percent).",
      inputSchema: { module_id: id("Module id") },
    },
    async (args) => guard(() => client.getModule(args.module_id))(),
  );

  // ---- Comments ----------------------------------------------------------
  server.registerTool(
    "list_comments",
    {
      title: "List comments",
      description: "List the comments on a work item, oldest first. Paginated.",
      inputSchema: { work_item_id: id("Work item id"), ...pagination },
    },
    async (args) =>
      guard(() =>
        client.listComments(args.work_item_id, { page: args.page, per_page: args.per_page }),
      )(),
  );

  server.registerTool(
    "create_comment",
    {
      title: "Create a comment",
      description: "Add a comment to a work item.",
      inputSchema: {
        work_item_id: id("Work item id"),
        body: z.string().describe("Comment text"),
      },
    },
    async (args) => guard(() => client.createComment(args.work_item_id, args.body))(),
  );
}
