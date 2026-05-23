#!/usr/bin/env node
// Replays a saved session as live SSE so the streaming UI can be tested
// without backend API keys.
//
// Usage:
//   node scripts/mock-sse-server.mjs              # serve all sessions, default cadence
//   node scripts/mock-sse-server.mjs 746fa2380425 # focus a single id (just for clarity in logs)
//   PORT=9001 CADENCE_MS=120 node scripts/mock-sse-server.mjs
//
// Then in the demo dev server:
//   VITE_API_BASE=http://localhost:8000/api npm run dev
//   open /demos/latent-insights/?session=<id>  → live mode

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = "public/data/latent-insights";
const PORT = Number(process.env.PORT ?? 8000);
const CADENCE_MS = Number(process.env.CADENCE_MS ?? 250);
const focusId = process.argv[2];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function sessionPath(id) { return path.join(DATA_DIR, `${id}.json`); }
function feedPath(id)    { return path.join(DATA_DIR, `${id}.feed.json`); }

function sessionMeta(id) {
  const raw = readJson(sessionPath(id));
  return {
    id: raw.id,
    dataset_path: raw.dataset_path,
    created_at: raw.created_at,
    scout_questions: raw.scout_questions,
    urls: {
      self: `http://localhost:${PORT}/api/sessions/${id}`,
      events: `http://localhost:${PORT}/api/sessions/${id}/events`,
      feed: `http://localhost:${PORT}/api/sessions/${id}/feed`,
    },
  };
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const m = url.pathname.match(/^\/api\/sessions\/([^/]+)(\/feed|\/events)?$/);
  if (!m) {
    res.writeHead(404, corsHeaders);
    res.end("not found");
    return;
  }
  const sessionId = m[1];
  const sub = m[2];

  if (focusId && sessionId !== focusId) {
    res.writeHead(404, corsHeaders);
    res.end(`mock server is focused on ${focusId}`);
    return;
  }
  if (!fs.existsSync(feedPath(sessionId))) {
    res.writeHead(404, corsHeaders);
    res.end(`no feed for ${sessionId}`);
    return;
  }

  // --- snapshot ---
  if (!sub) {
    res.writeHead(200, { "content-type": "application/json", ...corsHeaders });
    res.end(JSON.stringify(sessionMeta(sessionId)));
    return;
  }

  // --- bulk feed ---
  if (sub === "/feed") {
    res.writeHead(200, { "content-type": "application/json", ...corsHeaders });
    res.end(fs.readFileSync(feedPath(sessionId)));
    return;
  }

  // --- SSE stream ---
  if (sub === "/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
      ...corsHeaders,
    });
    res.write(": connected\n\n");

    const entries = readJson(feedPath(sessionId));
    let i = 0;
    let closed = false;
    req.on("close", () => { closed = true; });

    const tick = () => {
      if (closed) return;
      if (i >= entries.length) {
        res.write(": stream complete\n\n");
        return;
      }
      const e = entries[i++];
      res.write(`event: ${e.event_type}\n`);
      res.write(`data: ${JSON.stringify(e)}\n\n`);
      setTimeout(tick, CADENCE_MS);
    };
    setTimeout(tick, 50);
    return;
  }

  res.writeHead(404, corsHeaders);
  res.end("not found");
});

server.listen(PORT, () => {
  const available = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".feed.json"))
    .map((f) => f.replace(/\.feed\.json$/, ""));
  console.log(`mock SSE server listening on http://localhost:${PORT}`);
  console.log(`  cadence ${CADENCE_MS}ms between entries`);
  console.log(`  available sessions: ${available.join(", ")}`);
  if (focusId) console.log(`  focused on: ${focusId}`);
  console.log(`\nin another terminal:`);
  console.log(`  VITE_API_BASE=http://localhost:${PORT}/api npm run dev`);
  console.log(`  open /demos/latent-insights/?session=${focusId ?? available[0]}`);
});
