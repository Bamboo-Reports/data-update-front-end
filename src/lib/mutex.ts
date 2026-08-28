import { acquireLock } from "./cache";

/**
 * Serialises writes so two concurrent requests cannot both claim the same new
 * id or interleave a read-modify-write.
 *
 * The in-process chain handles requests on the same instance without a
 * network round trip; the Redis lock (when configured) extends that across
 * every instance of a serverless deployment.
 */
const chains = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const release = await acquireLock(key);
    try {
      return await fn();
    } finally {
      if (release) await release();
    }
  };
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(run, run);
  // Keep the chain alive but swallow rejections so one failure does not
  // poison every subsequent write.
  chains.set(key, next.catch(() => undefined));
  return next;
}
