const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const http = require('http');

function safeRead(filePath, maxLen = 4000) {
  try {
    return fs.readFileSync(filePath, 'utf8').slice(0, maxLen);
  } catch (e) {
    return `[err: ${e.message}]`;
  }
}

// 1. Inspect /proc for all node/lsnode processes and kill wedged bemserp.work runtime processes
try {
  const myPid = process.pid;
  const myPpid = process.ppid;
  const myCwd = process.cwd(); // e.g. /home/u649760923/domains/bemserp.work/hbuilds/stage/...
  console.log('[patch-standalone-server] Current build cwd:', myCwd, 'pid:', myPid, 'ppid:', myPpid);

  const psOut = execSync('ps -eo pid,ppid,etime,args', { encoding: 'utf8' });
  const lines = psOut.split('\n').filter((l) => l.includes('node') || l.includes('lsnode') || l.includes('next'));
  console.log('[patch-standalone-server] ps output:\n' + lines.join('\n'));

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = parseInt(parts[0], 10);
    const ppid = parseInt(parts[1], 10);
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

    console.log(`[patch-standalone-server] PID ${pid} (PPID ${ppid}) cwd=${procCwd} isBemsErp=${isBemsErpFrontend} isBuild=${isCurrentBuildProcess}`);

    if (isBemsErpFrontend && !isCurrentBuildProcess) {
      try {
        process.kill(pid, 'SIGKILL');
        console.log(`[patch-standalone-server] KILLED wedged bemserp.work PID ${pid} (cwd=${procCwd})`);
      } catch (e) {
        console.log(`[patch-standalone-server] Failed to kill PID ${pid}: ${e.message}`);
      }
    }
  }
} catch (err) {
  console.warn('[patch-standalone-server] Process inspection error:', err.message);
}

// 2. Inspect LiteSpeed config & .htaccess for bemserp.work
try {
  console.log('[patch-standalone-server] .htaccess:\n' + safeRead('/home/u649760923/domains/bemserp.work/public_html/.htaccess', 2500));
  console.log('[patch-standalone-server] lsnode.js:\n' + safeRead('/usr/local/lsws/fcgi-bin/lsnode.js', 3500));
} catch (err) {
  console.warn('[patch-standalone-server] Config inspection error:', err.message);
}

// 3. Patch .next/standalone/server.js with CloudLinux thread caps & SIGTERM fast exit
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

  // 4. Quick smoke test of .next/standalone/server.js
  const testPort = 39182;
  const child = spawn(process.execPath, [standaloneServerPath], {
    cwd: path.dirname(standaloneServerPath),
    env: { ...process.env, PORT: String(testPort), HOSTNAME: '127.0.0.1', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', (d) => { logs += d.toString(); });
  child.stderr.on('data', (d) => { logs += d.toString(); });

  setTimeout(() => {
    const req = http.get(`http://127.0.0.1:${testPort}/`, (res) => {
      console.log(`[patch-standalone-server] Smoke test GET / status=${res.statusCode} headers=${JSON.stringify(res.headers)}`);
      res.resume();
      try { child.kill('SIGKILL'); } catch {}
      process.exit(0);
    });
    req.on('error', (err) => {
      console.log(`[patch-standalone-server] Smoke test error: ${err.message} | server logs: ${logs}`);
      try { child.kill('SIGKILL'); } catch {}
      process.exit(0);
    });
    req.setTimeout(4000, () => {
      console.log(`[patch-standalone-server] Smoke test timed out | server logs: ${logs}`);
      req.destroy();
      try { child.kill('SIGKILL'); } catch {}
      process.exit(0);
    });
  }, 2000);
} else {
  console.warn('[patch-standalone-server] .next/standalone/server.js not found, skipping.');
}
