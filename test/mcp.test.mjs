import { test } from "node:test";
import assert from "node:assert/strict";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { registerTools } from "../dist/tools.js";
import { FlightdeckApiError } from "../dist/client.js";

// A plain object that quacks like FlightdeckClient. Each method records its
// call and returns a canned value (or throws, when `impl` says so) so we can
// assert on what registerTools handed through.
function makeFakeClient(overrides = {}) {
  const calls = [];
  const record = (name) => (...args) => {
    calls.push({ name, args });
    if (typeof overrides[name] === "function") return overrides[name](...args);
    return Promise.resolve({ ok: true, name, args });
  };
  return {
    calls,
    me: record("me"),
    listProjects: record("listProjects"),
    getProject: record("getProject"),
    listWorkItems: record("listWorkItems"),
    getWorkItem: record("getWorkItem"),
    createWorkItem: record("createWorkItem"),
    updateWorkItem: record("updateWorkItem"),
    deleteWorkItem: record("deleteWorkItem"),
    listCycles: record("listCycles"),
    getCycle: record("getCycle"),
    listModules: record("listModules"),
    getModule: record("getModule"),
    listComments: record("listComments"),
    createComment: record("createComment"),
  };
}

// Wire an MCP Client to a server that has registerTools applied, sharing the
// fake client so the test can inspect recorded calls.
async function connect(fakeClient) {
  const server = new McpServer({ name: "flightdeck-test", version: "0.0.0" });
  registerTools(server, fakeClient);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { client, server };
}

test("tools/list advertises exactly 14 tools", async () => {
  const fake = makeFakeClient();
  const { client } = await connect(fake);

  const { tools } = await client.listTools();
  assert.equal(tools.length, 14);

  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "create_comment",
    "create_work_item",
    "delete_work_item",
    "get_cycle",
    "get_me",
    "get_module",
    "get_project",
    "get_work_item",
    "list_comments",
    "list_cycles",
    "list_modules",
    "list_projects",
    "list_work_items",
    "update_work_item",
  ]);

  await client.close();
});

test("get_work_item accepts a NUMERIC id and reaches fakeClient.getWorkItem", async () => {
  const fake = makeFakeClient({
    getWorkItem: (workItemId) =>
      Promise.resolve({ id: workItemId, key: "WEB-1", title: "Hello" }),
  });
  const { client } = await connect(fake);

  const result = await client.callTool({
    name: "get_work_item",
    arguments: { work_item_id: 34706 },
  });

  // Zod validated the numeric id and the call went through.
  assert.notEqual(result.isError, true);
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].name, "getWorkItem");
  assert.equal(fake.calls[0].args[0], 34706);

  // The handler serialized the client's return value as JSON text.
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.id, 34706);
  assert.equal(payload.title, "Hello");

  await client.close();
});

test("an API error from the client surfaces as isError with a readable message", async () => {
  const fake = makeFakeClient({
    getWorkItem: () =>
      Promise.reject(new FlightdeckApiError(404, "Work item not found")),
  });
  const { client } = await connect(fake);

  const result = await client.callTool({
    name: "get_work_item",
    arguments: { work_item_id: 99999 },
  });

  assert.equal(result.isError, true);
  const text = result.content[0].text;
  assert.match(text, /Flightdeck API error \(404\)/);
  assert.match(text, /Work item not found/);

  await client.close();
});

test("create_work_item passes project_id + picked attrs through to the client", async () => {
  const fake = makeFakeClient();
  const { client } = await connect(fake);

  await client.callTool({
    name: "create_work_item",
    arguments: { project_id: 103, title: "New item", priority: "high" },
  });

  assert.equal(fake.calls.length, 1);
  const call = fake.calls[0];
  assert.equal(call.name, "createWorkItem");
  assert.equal(call.args[0], 103);
  assert.deepEqual(call.args[1], { title: "New item", priority: "high" });

  await client.close();
});
