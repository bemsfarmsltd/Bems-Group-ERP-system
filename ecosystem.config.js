module.exports = {
  apps: [
    {
      name: "bems-erp-frontend",
      script: "server.js",
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
    {
      name: "bems-erp-backend",
      script: "scripts/run-typescript.cjs",
      args: "backend/server.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        BACKEND_PORT: 4000,
      },
    },
  ],
};
