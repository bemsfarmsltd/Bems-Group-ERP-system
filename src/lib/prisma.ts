if (!process.env.TOKIO_WORKER_THREADS) process.env.TOKIO_WORKER_THREADS = "1";
if (!process.env.RAYON_NUM_THREADS) process.env.RAYON_NUM_THREADS = "1";
if (!process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = "2";

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Use PgBouncer flags only when connected to a Supavisor pooler host (*.pooler.supabase.com or explicit :6543).
// Never rewrite direct db.<ref>.supabase.co:5432 hosts to :6543, as direct hosts only listen on port 5432.
let connectionUrl = process.env.DATABASE_URL || "";
if (
  connectionUrl &&
  (connectionUrl.includes(":6543") || connectionUrl.includes("pooler.supabase.com")) &&
  !connectionUrl.includes("pgbouncer=true")
) {
  const separator = connectionUrl.includes("?") ? "&" : "?";
  connectionUrl += `${separator}pgbouncer=true&connection_limit=5&pool_timeout=10&connect_timeout=10`;
} else if (connectionUrl && !connectionUrl.includes("connection_limit=")) {
  const separator = connectionUrl.includes("?") ? "&" : "?";
  connectionUrl += `${separator}connection_limit=5&pool_timeout=10&connect_timeout=10`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: connectionUrl ? { db: { url: connectionUrl } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// Always maintain a single singleton client across all requests in the process
globalForPrisma.prisma = prisma;

/**
 * Executes a Prisma query with automatic retry on transient pooler / socket drops.
 */
export async function withPrismaRetry<T>(
  queryFn: () => Promise<T>,
  maxRetries = 2,
  delayMs = 120
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await queryFn();
    } catch (err: any) {
      attempt++;
      const message = String(err?.message || "");
      const isTransient =
        message.includes("closed the connection") ||
        message.includes("Can't reach database server") ||
        message.includes("timed out") ||
        message.includes("connection pool");

      if (attempt > maxRetries || !isTransient) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}
