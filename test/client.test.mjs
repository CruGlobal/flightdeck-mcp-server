import { test } from "node:test";
import assert from "node:assert/strict";

import { FlightdeckClient, FlightdeckApiError } from "../dist/client.js";

const BASE = "https://flightdeck.example.com";
const TOKEN = "fd_pat_test123";

// Install a fake fetch, run the body, restore the real fetch afterward.
// The fake records the last call and returns whatever `impl` produces.
async function withFetch(impl, body) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return impl(url, init);
  };
  try {
    await body(calls);
  } finally {
    globalThis.fetch = original;
  }
}

// Build a minimal Response-like object the client can consume.
function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async text() {
      return payload === undefined ? "" : JSON.stringify(payload);
    },
  };
}

function newClient() {
  return new FlightdeckClient(BASE, TOKEN);
}

test("request() prefixes /api/v1 and sets auth + accept headers", async () => {
  await withFetch(
    () => jsonResponse({ ok: true }),
    async (calls) => {
      await newClient().request("/me");
      assert.equal(calls.length, 1);
      const { url, init } = calls[0];
      assert.equal(String(url), `${BASE}/api/v1/me`);
      assert.equal(init.method, "GET");
      assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
      assert.equal(init.headers.Accept, "application/json");
      // No body on a GET -> no Content-Type header set.
      assert.equal(init.headers["Content-Type"], undefined);
      assert.equal(init.body, undefined);
    },
  );
});

test("request() drops undefined/null/'' query params and keeps the rest", async () => {
  await withFetch(
    () => jsonResponse({ results: [] }),
    async (calls) => {
      await newClient().request("/projects", {
        query: {
          page: 2,
          per_page: undefined,
          q: null,
          empty: "",
          zero: 0,
          flag: false,
        },
      });
      const url = new URL(String(calls[0].url));
      assert.equal(url.searchParams.get("page"), "2");
      assert.equal(url.searchParams.has("per_page"), false);
      assert.equal(url.searchParams.has("q"), false);
      assert.equal(url.searchParams.has("empty"), false);
      // 0 and false are NOT dropped — only undefined/null/'' are.
      assert.equal(url.searchParams.get("zero"), "0");
      assert.equal(url.searchParams.get("flag"), "false");
    },
  );
});

test("request() sets Content-Type and JSON body only when a body is given", async () => {
  await withFetch(
    () => jsonResponse({ id: 1 }),
    async (calls) => {
      await newClient().request("/work_items/1", {
        method: "PATCH",
        body: { work_item: { title: "Hi" } },
      });
      const { init } = calls[0];
      assert.equal(init.method, "PATCH");
      assert.equal(init.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(init.body), { work_item: { title: "Hi" } });
    },
  );
});

test("createWorkItem wraps attributes as { work_item: attrs } and POSTs", async () => {
  await withFetch(
    () => jsonResponse({ id: 5 }),
    async (calls) => {
      await newClient().createWorkItem(103, { title: "New", priority: "high" });
      const { url, init } = calls[0];
      assert.equal(String(url), `${BASE}/api/v1/projects/103/work_items`);
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), {
        work_item: { title: "New", priority: "high" },
      });
    },
  );
});

test("createComment wraps body as { comment: { body } } and POSTs", async () => {
  await withFetch(
    () => jsonResponse({ id: 9 }),
    async (calls) => {
      await newClient().createComment(34706, "Looks good");
      const { url, init } = calls[0];
      assert.equal(String(url), `${BASE}/api/v1/work_items/34706/comments`);
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), {
        comment: { body: "Looks good" },
      });
    },
  );
});

test("a 204 No Content response resolves to undefined (deleteWorkItem)", async () => {
  await withFetch(
    () => ({ ok: true, status: 204, async text() { return ""; } }),
    async (calls) => {
      const result = await newClient().deleteWorkItem(34706);
      assert.equal(result, undefined);
      const { url, init } = calls[0];
      assert.equal(String(url), `${BASE}/api/v1/work_items/34706`);
      assert.equal(init.method, "DELETE");
    },
  );
});

test("a non-2xx { error } body throws FlightdeckApiError with status + message", async () => {
  await withFetch(
    () => jsonResponse({ error: "Work item not found" }, { ok: false, status: 404 }),
    async () => {
      await assert.rejects(
        () => newClient().getWorkItem(99999),
        (err) => {
          assert.ok(err instanceof FlightdeckApiError);
          assert.equal(err.status, 404);
          assert.equal(err.message, "Work item not found");
          assert.equal(err.name, "FlightdeckApiError");
          return true;
        },
      );
    },
  );
});

test("a non-2xx without an { error } envelope falls back to HTTP <status>", async () => {
  await withFetch(
    () => jsonResponse({ something: "else" }, { ok: false, status: 500 }),
    async () => {
      await assert.rejects(
        () => newClient().getWorkItem(1),
        (err) => {
          assert.ok(err instanceof FlightdeckApiError);
          assert.equal(err.status, 500);
          assert.equal(err.message, "HTTP 500");
          return true;
        },
      );
    },
  );
});

test("a fetch rejection becomes FlightdeckApiError with status 0", async () => {
  await withFetch(
    () => {
      throw new Error("ECONNREFUSED");
    },
    async () => {
      await assert.rejects(
        () => newClient().me(),
        (err) => {
          assert.ok(err instanceof FlightdeckApiError);
          assert.equal(err.status, 0);
          assert.match(err.message, /Could not reach Flightdeck/);
          assert.match(err.message, /ECONNREFUSED/);
          return true;
        },
      );
    },
  );
});

test("seg(): a numeric id is interpolated straight into the path", async () => {
  await withFetch(
    () => jsonResponse({ id: 34706 }),
    async (calls) => {
      await newClient().getWorkItem(34706);
      assert.equal(String(calls[0].url), `${BASE}/api/v1/work_items/34706`);
    },
  );
});

test("seg(): string ids are URL-encoded", async () => {
  await withFetch(
    () => jsonResponse({ id: 1 }),
    async (calls) => {
      await newClient().getProject("a b/c");
      assert.equal(
        String(calls[0].url),
        `${BASE}/api/v1/projects/a%20b%2Fc`,
      );
    },
  );
});
