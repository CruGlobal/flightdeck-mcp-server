#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { FlightdeckClient } from "./client.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new FlightdeckClient(config.baseUrl, config.token);

  const server = new McpServer({
    name: "flightdeck-mcp-server",
    version: "0.1.0",
  });

  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is reserved for the MCP protocol; all human-facing logging goes to stderr.
  console.error(`flightdeck-mcp-server connected to ${config.baseUrl} (stdio)`);
}

main().catch((error) => {
  console.error("Fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
