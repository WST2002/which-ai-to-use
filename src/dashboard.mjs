import { randomBytes } from "node:crypto";
import http from "node:http";
import path from "node:path";
import { checkupAction, doctorAction, fixAction, handoffAction, recommendAction, tokensAction } from "./actions.mjs";
import { dashboardPage } from "./dashboard-page.mjs";
import { detectTools } from "./detect.mjs";
import { toolById } from "./tools.mjs";

const MAX_BODY = 16 * 1024;

const ACTIONS = {
  checkup: (context) => checkupAction(context),
  task: (context, body) => recommendAction({ ...context, task: body.task }),
  handoff: (context, body) => handoffAction({ ...context, task: String(body.task ?? "").trim() }),
  fix: (context, body) => fixAction({ ...context, apply: body.apply === true }),
  tokens: (context) => tokensAction(context),
  doctor: (context) => doctorAction(context),
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY) reject(new Error("request too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("request body is not JSON"));
      }
    });
    req.on("error", reject);
  });
}

const send = (res, status, type, body) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(body);
};
const json = (res, status, data) => send(res, status, "application/json; charset=utf-8", JSON.stringify(data));

/**
 * Local dashboard on 127.0.0.1. Requests need the random token from the printed link, a local Host header
 * (blocks DNS rebinding) and no foreign Origin (blocks other websites), because some actions write files.
 */
export function startDashboard({ cwd, home, detect = detectTools, port = 0, version = "" }) {
  const token = randomBytes(16).toString("hex");
  let actualPort = port;
  const localHost = (host) => host === `127.0.0.1:${actualPort}` || host === `localhost:${actualPort}`;
  const localOrigin = (origin) => !origin || origin === `http://127.0.0.1:${actualPort}` || origin === `http://localhost:${actualPort}`;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (!localHost(req.headers.host) || !localOrigin(req.headers.origin)) return send(res, 403, "text/plain", "Forbidden");

    if (req.method === "GET" && url.pathname === "/") {
      if (url.searchParams.get("t") !== token) return send(res, 403, "text/plain", "Open the link printed in your terminal.");
      return send(res, 200, "text/html; charset=utf-8", dashboardPage({ token, project: path.basename(cwd), version }));
    }

    const match = /^\/api\/([a-z]+)$/.exec(url.pathname);
    if (req.method !== "POST" || !match) return send(res, 404, "text/plain", "Not found");
    if (req.headers["x-dashboard-token"] !== token) return send(res, 403, "text/plain", "Forbidden");
    const action = ACTIONS[match[1]];
    if (!action) return json(res, 404, { error: `unknown action ${match[1]}` });

    try {
      const body = await readBody(req);
      const without = Array.isArray(body.without) ? body.without.filter((id) => toolById(id)) : [];
      const installed = detect().filter((found) => !without.includes(found.id));
      return json(res, 200, action({ cwd, home, installed }, body));
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      actualPort = server.address().port;
      resolve({
        port: actualPort,
        token,
        url: `http://127.0.0.1:${actualPort}/?t=${token}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
