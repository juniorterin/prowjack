"use strict";
require("../helpers/testEnv");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startRouterApp } = require("../helpers/testApp");
const configureRouter = require("../../routes/configure");

describe("configure/health routes", () => {
  test("GET /health returns 200 OK", async (t) => {
    const app = await startRouterApp(configureRouter);
    t.after(() => app.close());
    const res = await fetch(`${app.baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "OK");
  });

  test("GET / and GET /configure serve the configure page", async (t) => {
    const app = await startRouterApp(configureRouter);
    t.after(() => app.close());
    const root = await fetch(`${app.baseUrl}/`);
    assert.equal(root.status, 200);
    const configure = await fetch(`${app.baseUrl}/configure`);
    assert.equal(configure.status, 200);
  });
});
