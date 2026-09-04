"use strict";
const http = require("http");
const express = require("express");

// Monta um app Express mínimo com o(s) router(s) informado(s) e sobe num
// servidor HTTP efêmero (porta 0) — os testes de integração batem nele com o
// fetch nativo do Node, sem precisar de supertest ou qualquer dependência nova.
async function startRouterApp(routers, { json = true } = {}) {
  const app = express();
  if (json) app.use(express.json());
  for (const router of Array.isArray(routers) ? routers : [routers]) {
    app.use("/", router);
  }
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

module.exports = { startRouterApp };
