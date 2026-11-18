const fs = require('fs');
const path = require('path');

const standaloneServerPath = path.join(process.cwd(), '.next', 'standalone', 'server.js');

if (fs.existsSync(standaloneServerPath)) {
  const original = fs.readFileSync(standaloneServerPath, 'utf8');
  const banner = [
    '// CloudLinux LVE thread, Unix socket PORT & process lifecycle guard',
    "process.env.TOKIO_WORKER_THREADS = process.env.TOKIO_WORKER_THREADS || '1';",
    "process.env.RAYON_NUM_THREADS = process.env.RAYON_NUM_THREADS || '1';",
    "process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '2';",
    "process.on('SIGTERM', () => process.exit(0));",
    "process.on('SIGINT', () => process.exit(0));",
    "(function() {",
    "  const rawPort = process.env.PORT || '';",
    "  if (rawPort && !/^\\d+$/.test(rawPort)) {",
    "    const http = require('http');",
    "    const fsMod = require('fs');",
    "    try { if (fsMod.existsSync(rawPort)) fsMod.unlinkSync(rawPort); } catch {}",
    "    const origListen = http.Server.prototype.listen;",
    "    http.Server.prototype.listen = function (...args) {",
    "      if (typeof args[0] === 'number' || (args[0] && typeof args[0] === 'object' && 'port' in args[0])) {",
    "        const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;",
    "        return origListen.call(this, rawPort, cb);",
    "      }",
    "      return origListen.apply(this, args);",
    "    };",
    "  }",
    "})();",
    '',
  ].join('\n');

  if (!original.includes('TOKIO_WORKER_THREADS')) {
    fs.writeFileSync(standaloneServerPath, banner + original, 'utf8');
    console.log('[patch-standalone-server] Patched .next/standalone/server.js with CloudLinux LVE & Unix socket guards.');
  }
} else {
  console.warn('[patch-standalone-server] .next/standalone/server.js not found, skipping.');
}
