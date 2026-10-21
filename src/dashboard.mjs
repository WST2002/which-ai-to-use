import { randomBytes } from "node:crypto";
import http from "node:http";
import path from "node:path";
import { aiAction, checkupAction, doctorAction, fixAction, handoffAction, recommendAction, scoreAction, slimAction, tokensAction, usageAction } from "./actions.mjs";
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
  score: (context) => scoreAction(context),
  usage: (context) => usageAction(context),
  ai: (context, body) => aiAction({ ...context, task: body.task, consent: body.consent === true }),
  slim: (context, body) => slimAction({ ...context, consent: body.consent === true, apply: body.apply === true }),
};

/** Runs one dashboard action for the project. Shared by the local server and the VS Code sidebar. */
export async function runAction(name, body, { cwd, home, detect = detectTools, ask }) {
  const action = ACTIONS[name];
  if (!action) throw new Error(`unknown action ${name}`);
  const without = Array.isArray(body.without) ? body.without.filter((id) => toolById(id)) : [];
  const installed = detect().filter((found) => !without.includes(found.id));
  return action({ cwd, home, installed, ...(ask ? { ask } : {}) }, body);
}

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
/** `ask` replaces the real AI call (tests only use it to avoid spending anyone's usage). */
export function startDashboard({ cwd, home, detect = detectTools, port = 0, version = "", ask }) {
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
    if (!ACTIONS[match[1]]) return json(res, 404, { error: `unknown action ${match[1]}` });

    try {
      return json(res, 200, await runAction(match[1], await readBody(req), { cwd, home, detect, ask }));
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
