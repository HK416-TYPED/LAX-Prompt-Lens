// Local UI harness: Chrome APIs and paid requests are mocked. Never ship this
// as the extension or use it to validate real Chrome permission behaviour.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const types = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png", ".svg": "image/svg+xml" };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const target = path.resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/panel.html" : url.pathname));
    if (!target.startsWith(root) || target.includes(`${path.sep}..${path.sep}`)) { res.writeHead(403).end(); return; }
    let content = await readFile(target);
    if (target.endsWith(".html")) content = content.toString().replace('<script type="module" src=', '<script src="tools/preview-mock.js"></script><script type="module" src=');
    res.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(content);
  } catch { res.writeHead(404).end("Not found"); }
}).listen(8765, "127.0.0.1", () => console.log("Lens UI mock harness: http://127.0.0.1:8765/panel.html"));
