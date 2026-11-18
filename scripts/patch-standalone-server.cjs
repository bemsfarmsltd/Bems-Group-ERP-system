const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. Clean up any wedged old bemserp.work next-server OR orphaned lsnode.js processes
try {
  const myPid = process.pid;
  const myPpid = process.ppid;
  const myCwd = process.cwd();
  const psOut = execSync('ps -eo pid,ppid,etime,args', { encoding: 'utf8' });
  const lines = psOut.split('\n').filter((l) => l.includes('node') || l.includes('lsnode') || l.includes('next'));

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = parseInt(parts[0], 10);
    if (!pid || pid === myPid || pid === myPpid) continue;

    let procCwd = '';
    let procEnv = '';
    try {
      procCwd = fs.readlinkSync(`/proc/${pid}/cwd`);
    } catch {}
    try {
      procEnv = fs.readFileSync(`/proc/${pid}/environ`, 'utf8').replace(/\0/g, ' ');
    } catch {}

    const isBemsErpFrontend =
      (procCwd.includes('/domains/bemserp.work') || procEnv.includes('/domains/bemserp.work')) &&
      !procCwd.includes('/domains/api.bemserp.work') &&
      !procEnv.includes('/domains/api.bemserp.work');

    const isCurrentBuildProcess =
      procCwd === myCwd ||
      line.includes('npm run build') ||
      line.includes('patch-standalone-server') ||
      line.includes('next build') ||
      line.includes('postcss');

    if (isBemsErpFrontend && !isCurrentBuildProcess) {
      try {
        process.kill(pid, 'SIGKILL');
        console.log(`[patch-standalone-server] KILLED stale bemserp.work PID ${pid} (cwd=${procCwd})`);
      } catch (e) {
        console.log(`[patch-standalone-server] Failed to kill PID ${pid}: ${e.message}`);
      }
    }
  }
} catch (err) {
  console.warn('[patch-standalone-server] Process cleanup warning:', err.message);
}

// 2. Patch .next/standalone/server.js with CloudLinux LVE thread & crash guards
const standaloneServerPath = path.join(process.cwd(), '.next', 'standalone', 'server.js');

if (fs.existsSync(standaloneServerPath)) {
  const original = fs.readFileSync(standaloneServerPath, 'utf8');
  const banner = [
    '// CloudLinux LVE thread & diagnostic guard',
    "process.env.TOKIO_WORKER_THREADS = process.env.TOKIO_WORKER_THREADS || '1';",
    "process.env.RAYON_NUM_THREADS = process.env.RAYON_NUM_THREADS || '1';",
    "process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '2';",
    "process.on('uncaughtException', (err) => { console.error('[standalone uncaughtException]', err && err.stack ? err.stack : err); });",
    "process.on('unhandledRejection', (err) => { console.error('[standalone unhandledRejection]', err && err.stack ? err.stack : err); });",
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
