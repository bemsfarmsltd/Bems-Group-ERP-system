const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. Inspect and clean up any wedged old Next.js standalone server processes for bemserp.work
try {
  const psOut = execSync('ps -eo pid,ppid,etime,args || ps aux', { encoding: 'utf8' });
  const myPid = process.pid;
  const myPpid = process.ppid;
  const lines = psOut.split('\n').filter((l) => l.includes('node') || l.includes('lsnode') || l.includes('next'));
  console.log('[patch-standalone-server] Active node processes:\n' + lines.join('\n'));

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = parseInt(parts[0], 10);
    if (!pid || pid === myPid || pid === myPpid) continue;
    // Only target old running server.js / lsnode processes for bemserp.work (never build or api.bemserp.work)
    if (
      (line.includes('bemserp.work') && !line.includes('api.bemserp.work') && !line.includes('hbuilds')) ||
      line.includes('.next/standalone/server.js')
    ) {
      try {
        process.kill(pid, 'SIGKILL');
        console.log(`[patch-standalone-server] Sent SIGKILL to wedged bemserp.work server PID ${pid}`);
      } catch (e) {
        console.log(`[patch-standalone-server] Could not kill PID ${pid}: ${e.message}`);
      }
    }
  }
} catch (err) {
  console.warn('[patch-standalone-server] Process check warning:', err.message);
}

// 2. Patch .next/standalone/server.js with CloudLinux thread caps & SIGTERM fast exit
const standaloneServerPath = path.join(process.cwd(), '.next', 'standalone', 'server.js');

if (fs.existsSync(standaloneServerPath)) {
  const original = fs.readFileSync(standaloneServerPath, 'utf8');
  const banner = [
    '// CloudLinux LVE thread & process lifecycle guard',
    "process.env.TOKIO_WORKER_THREADS = process.env.TOKIO_WORKER_THREADS || '1';",
    "process.env.RAYON_NUM_THREADS = process.env.RAYON_NUM_THREADS || '1';",
    "process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '2';",
    "process.on('SIGTERM', () => process.exit(0));",
    "process.on('SIGINT', () => process.exit(0));",
    '',
  ].join('\n');

  if (!original.includes('TOKIO_WORKER_THREADS')) {
    fs.writeFileSync(standaloneServerPath, banner + original, 'utf8');
    console.log('[patch-standalone-server] Patched .next/standalone/server.js with CloudLinux LVE guards.');
  }
} else {
  console.warn('[patch-standalone-server] .next/standalone/server.js not found, skipping.');
}
