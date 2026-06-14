import { test } from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../dist/config.js";

test("loadConfig returns baseUrl + token from a fake env", () => {
  const cfg = loadConfig({
    FLIGHTDECK_BASE_URL: "https://flightdeck.example.com",
    FLIGHTDECK_API_TOKEN: "fd_pat_abc",
  });
  assert.deepEqual(cfg, {
    baseUrl: "https://flightdeck.example.com",
    token: "fd_pat_abc",
  });
});

test("loadConfig throws when FLIGHTDECK_BASE_URL is missing", () => {
  assert.throws(
    () => loadConfig({ FLIGHTDECK_API_TOKEN: "fd_pat_abc" }),
    /FLIGHTDECK_BASE_URL is required/,
  );
});

test("loadConfig throws when FLIGHTDECK_API_TOKEN is missing", () => {
  assert.throws(
    () => loadConfig({ FLIGHTDECK_BASE_URL: "https://flightdeck.example.com" }),
    /FLIGHTDECK_API_TOKEN is required/,
  );
});

test("loadConfig treats a blank/whitespace value as missing", () => {
  assert.throws(
    () =>
      loadConfig({
        FLIGHTDECK_BASE_URL: "   ",
        FLIGHTDECK_API_TOKEN: "fd_pat_abc",
      }),
    /FLIGHTDECK_BASE_URL is required/,
  );
});

test("loadConfig strips trailing slashes from the base URL", () => {
  const cfg = loadConfig({
    FLIGHTDECK_BASE_URL: "https://flightdeck.example.com///",
    FLIGHTDECK_API_TOKEN: "fd_pat_abc",
  });
  assert.equal(cfg.baseUrl, "https://flightdeck.example.com");
});

test("loadConfig trims surrounding whitespace from both values", () => {
  const cfg = loadConfig({
    FLIGHTDECK_BASE_URL: "  https://flightdeck.example.com/  ",
    FLIGHTDECK_API_TOKEN: "  fd_pat_abc  ",
  });
  assert.equal(cfg.baseUrl, "https://flightdeck.example.com");
  assert.equal(cfg.token, "fd_pat_abc");
});
