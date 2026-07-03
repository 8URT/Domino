#!/usr/bin/env node
/**
 * Minimal shared storage server for Domino Lakaz.
 * Rooms are kept in memory on this machine so every device that hits the
 * same URL (e.g. http://192.168.x.x:8000) sees the same room codes.
 *
 * Usage: node server.js
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 8000;
const ROOT = __dirname;
const store = new Map(); // storage key -> JSON string

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function send(res, status, body, type){
  res.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function sendJson(res, status, obj){
  send(res, status, JSON.stringify(obj), "application/json; charset=utf-8");
}

function readBody(req){
  return new Promise((resolve, reject)=>{
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", ()=> resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res)=>{
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if(req.method === "OPTIONS"){
    send(res, 204, "");
    return;
  }

  // Shared key-value API (matches window.storage shim in the HTML)
  if(url.pathname.startsWith("/api/storage/")){
    const key = decodeURIComponent(url.pathname.slice("/api/storage/".length));
    if(key === "_health"){ sendJson(res, 200, { ok: true }); return; }
    if(!key){ send(res, 400, "Missing key"); return; }

    if(req.method === "GET"){
      if(!store.has(key)){ sendJson(res, 200, null); return; }
      sendJson(res, 200, { value: store.get(key) });
      return;
    }
    if(req.method === "PUT"){
      try{
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}");
        if(typeof body.value !== "string"){
          send(res, 400, "Expected { value: string }");
          return;
        }
        store.set(key, body.value);
        sendJson(res, 200, { ok: true });
      }catch(e){
        send(res, 400, "Bad JSON");
      }
      return;
    }
    if(req.method === "DELETE"){
      store.delete(key);
      sendJson(res, 200, { ok: true });
      return;
    }
    send(res, 405, "Method not allowed");
    return;
  }

  // Static files
  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const abs = path.join(ROOT, filePath);
  if(!abs.startsWith(ROOT)){ send(res, 403, "Forbidden"); return; }

  fs.readFile(abs, (err, data)=>{
    if(err){
      send(res, 404, "Not found");
      return;
    }
    send(res, 200, data, MIME[path.extname(abs)] || "application/octet-stream");
  });
});

server.listen(PORT, "0.0.0.0", ()=>{
  console.log(`Domino Lakaz server running:`);
  console.log(`  Local:   http://localhost:${PORT}/mauritian-domino.html`);
  console.log(`  Network: http://<your-ip>:${PORT}/mauritian-domino.html  (share this for phones on the same Wi‑Fi)`);
});
