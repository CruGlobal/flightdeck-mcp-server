# Flightdeck MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI
clients (Claude Code/Desktop, Cursor, …) first-class access to a
[Flightdeck](https://github.com/cruglobal/flightdeck) instance — listing and
creating projects, work items, cycles, modules and comments.

It's a **thin client** over Flightdeck's public REST API (`/api/v1`): it speaks
MCP over stdio to the AI client and HTTPS to your Flightdeck install, using a
personal access token. It never touches the app internals — the public API is
its entire surface.

## Prerequisites

- Node.js ≥ 18
- A Flightdeck install with the public API enabled (FD-21+)
- A **personal access token**: in Flightdeck, go to **Settings → API tokens**,
  create one, and copy the `fd_pat_…` value (shown only once). The token is
  scoped to a single workspace and acts as you.

## Configuration

Two environment variables:

| Variable                | Required | Example                          |
| ----------------------- | -------- | -------------------------------- |
| `FLIGHTDECK_BASE_URL`   | yes      | `https://flightdeck.example.com` |
| `FLIGHTDECK_API_TOKEN`  | yes      | `fd_pat_xxxxxxxx…`               |

## Use with Claude Code

```sh
claude mcp add flightdeck \
  --env FLIGHTDECK_BASE_URL=https://flightdeck.example.com \
  --env FLIGHTDECK_API_TOKEN=fd_pat_xxxxxxxx \
  -- npx -y @cruglobal/flightdeck-mcp-server
```

## Use with Claude Desktop / Cursor

Add to your MCP config (`claude_desktop_config.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "flightdeck": {
      "command": "npx",
      "args": ["-y", "@cruglobal/flightdeck-mcp-server"],
      "env": {
        "FLIGHTDECK_BASE_URL": "https://flightdeck.example.com",
        "FLIGHTDECK_API_TOKEN": "fd_pat_xxxxxxxx"
      }
    }
  }
}
```

## Tools

| Tool                | Description                                                        |
| ------------------- | ----------------------------------------------------------------- |
| `get_me`            | Who/what the token maps to (user, workspace, token). Health check. |
| `list_projects`     | List projects in the workspace.                                   |
| `get_project`       | Retrieve a project by id.                                       |
| `list_work_items`   | List a project's work items (summary shape).                      |
| `get_work_item`     | Retrieve a work item by id (full shape).                        |
| `create_work_item`  | Create a work item in a project (`title` required).               |
| `update_work_item`  | Update a work item; only supplied fields change.                  |
| `delete_work_item`  | Delete a work item by id.                                       |
| `list_cycles`       | List a project's cycles.                                          |
| `get_cycle`         | Retrieve a cycle by id.                                         |
| `list_modules`      | List a project's modules.                                         |
| `get_module`        | Retrieve a module by id.                                        |
| `list_comments`     | List a work item's comments.                                      |
| `create_comment`    | Add a comment to a work item.                                     |

List tools accept `page` and `per_page` (max 100).

Writes are tenant-safe on the server: any referenced state, cycle, parent or
label must belong to the work item's own project, and assignees must be members
of the workspace — otherwise the API rejects the request.

## Development

```sh
npm install
npm run build      # compile TypeScript to dist/
npm run watch      # recompile on change
FLIGHTDECK_BASE_URL=… FLIGHTDECK_API_TOKEN=… npm start
```

## License

MIT
