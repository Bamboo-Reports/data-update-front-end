import { gunzipSync, gzipSync } from "node:zlib";
import { Redis } from "@upstash/redis";

/**
 * Shared state for a multi-instance deployment.
 *
 * On Vercel every request may land on a different serverless instance, so a
 * plain module-level cache is both cold most of the time and invisible to the
 * instance that just wrote to the sheet. This module layers three tiers:
 *
 *   memory  →  Redis  →  Google Sheets
 *
 * with a per-key version counter in Redis. A read costs one tiny `GET` of the
 * counter; if it matches the copy in memory, the memory copy is served. A
 * write bumps the counter, which invalidates every instance at once.
 *
 * Without `UPSTASH_REDIS_REST_URL` the tier collapses to memory only, which is
 * exactly the single-process behaviour local dev expects.
 */

let client: Redis | null | undefined;

export function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

/* versions */

const localVersions = new Map<string, number>();

async function currentVersion(key: string): Promise<number> {
  const r = redis();
  if (!r) return localVersions.get(key) ?? 0;
  const v = await r.get<number | string>(`v:${key}`);
  return Number(v ?? 0);
}

async function bumpVersion(key: string): Promise<void> {
  const r = redis();
  if (!r) {
    localVersions.set(key, (localVersions.get(key) ?? 0) + 1);
    return;
  }
  await r.incr(`v:${key}`);
}

/* blobs */

function pack(value: unknown): string {
  return gzipSync(Buffer.from(JSON.stringify(value))).toString("base64");
}

function unpack<T>(blob: string): T {
  return JSON.parse(gunzipSync(Buffer.from(blob, "base64")).toString()) as T;
}

/**
 * One cached value with a load function behind it. `ttlMs` bounds how long a
 * copy can be served without going back to the source, which is what lets
 * edits made directly in the sheet show up; app writes call `invalidate()`
 * and are visible everywhere immediately.
 */
export class VersionedCache<T> {
  private memory: { value: T; version: number; loadedAt: number } | null = null;
  private inflight: Promise<T> | null = null;

  constructor(
    private readonly key: string,
    private readonly ttlMs: number,
    private readonly load: () => Promise<T>,
  ) {}

  /** `force` skips every cache and reads the source. Used under write locks. */
  async get(force = false): Promise<T> {
    if (force) {
      const value = await this.load();
      await this.remember(value, await this.safeVersion());
      return value;
    }
    if (this.inflight) return this.inflight;

    const request = (async () => {
      const version = await this.safeVersion();
      const hit = this.memory;
      if (hit && hit.version === version && Date.now() - hit.loadedAt < this.ttlMs) {
        return hit.value;
      }

      const shared = await this.readShared(version);
      if (shared !== null) {
        this.memory = { value: shared, version, loadedAt: Date.now() };
        return shared;
      }

      const value = await this.load();
      await this.remember(value, version);
      return value;
    })();

    this.inflight = request;
    try {
      return await request;
    } finally {
      if (this.inflight === request) this.inflight = null;
    }
  }

  async invalidate(): Promise<void> {
    this.memory = null;
    try {
      await bumpVersion(this.key);
    } catch (error) {
      console.error(`[cache] failed to bump ${this.key}`, error);
    }
  }

  // Awaited rather than fire-and-forget: a serverless instance may be frozen
  // the moment the response goes out, and a half-written blob helps nobody.
  private async remember(value: T, version: number): Promise<void> {
    this.memory = { value, version, loadedAt: Date.now() };
    await this.writeShared(value, version);
  }

  private async safeVersion(): Promise<number> {
    try {
      return await currentVersion(this.key);
    } catch (error) {
      console.error(`[cache] version read failed for ${this.key}`, error);
      // Serving from memory beats failing the request; the worst case is one
      // instance seeing a change a little late.
      return this.memory?.version ?? 0;
    }
  }

  private blobKey(version: number): string {
    return `blob:${this.key}:${version}`;
  }

  private async readShared(version: number): Promise<T | null> {
    const r = redis();
    if (!r) return null;
    try {
      const blob = await r.get<string>(this.blobKey(version));
      return blob ? unpack<T>(blob) : null;
    } catch (error) {
      console.error(`[cache] shared read failed for ${this.key}`, error);
      return null;
    }
  }

  private async writeShared(value: T, version: number): Promise<void> {
    const r = redis();
    if (!r) return;
    try {
      await r.set(this.blobKey(version), pack(value), {
        px: this.ttlMs,
      });
    } catch (error) {
      // Typically the value is over the plan's size limit. Memory still has
      // it, so the only cost is that other instances read from Google.
      console.error(`[cache] shared write failed for ${this.key}`, error);
    }
  }
}

/* locks */

const LOCK_TTL_MS = 20_000;
const LOCK_WAIT_MS = 15_000;

const RELEASE = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0`;

export class LockTimeoutError extends Error {
  constructor(key: string) {
    super(`Another change to ${key} is still being saved. Try again in a moment.`);
    this.name = "LockTimeoutError";
  }
}

/**
 * Cross-instance mutex. Returns `null` when Redis is not configured so the
 * caller can fall back to its in-process chain.
 */
export async function acquireLock(key: string): Promise<(() => Promise<void>) | null> {
  const r = redis();
  if (!r) return null;

  const lockKey = `lock:${key}`;
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  let delay = 40;

  while (true) {
    const ok = await r.set(lockKey, token, { nx: true, px: LOCK_TTL_MS });
    if (ok === "OK") break;
    if (Date.now() >= deadline) throw new LockTimeoutError(key);
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, 400);
  }

  return async () => {
    try {
      await r.eval(RELEASE, [lockKey], [token]);
    } catch (error) {
      // The lock expires on its own; a failed release only delays the next writer.
      console.error(`[cache] lock release failed for ${key}`, error);
    }
  };
}
