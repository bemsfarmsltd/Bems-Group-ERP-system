// Production startup script for Hostinger Node.js Application Manager
process.env.TOKIO_WORKER_THREADS = process.env.TOKIO_WORKER_THREADS || "1";
process.env.RAYON_NUM_THREADS = process.env.RAYON_NUM_THREADS || "1";
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || "2";
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

const fs = require("fs");
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const rawPort = process.env.PORT || "3000";
const isNumericPort = /^\d+$/.test(String(rawPort));
const port = isNumericPort ? parseInt(rawPort, 10) : 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const srv = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  }).once("error", (err) => {
    console.error(err);
    process.exit(1);
  });

  if (isNumericPort) {
    srv.listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
  } else {
    try {
      if (fs.existsSync(rawPort)) fs.unlinkSync(rawPort);
    } catch {}
    srv.listen(rawPort, () => {
      console.log(`> Ready on unix socket ${rawPort}`);
    });
  }
});
