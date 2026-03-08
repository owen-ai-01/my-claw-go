import { ensureUserContainer } from './docker-manager';
import { ensureSessionById } from './session-store';

const warmingUsers = new Map<string, number>();
const WARMUP_DEDUP_MS = 10 * 60 * 1000;

export function warmupRuntimeForUser(userId: string, reason = 'payment') {
  const now = Date.now();
  const last = warmingUsers.get(userId) || 0;
  if (now - last < WARMUP_DEDUP_MS) {
    return;
  }
  warmingUsers.set(userId, now);

  setImmediate(async () => {
    try {
      const session = await ensureSessionById(userId, `warmup:${reason}`);
      const result = await ensureUserContainer(session);
      if (!result.ok) {
        console.warn(
          `[MyClawGo] runtime warmup failed for ${userId}: ${result.error}`
        );
      } else {
        console.log(
          `[MyClawGo] runtime warmup ready for ${userId}, mode=${result.mode}`
        );
      }
    } catch (error) {
      console.warn(
        `[MyClawGo] runtime warmup exception for ${userId}:`,
        error
      );
    } finally {
      const current = warmingUsers.get(userId);
      if (current === now) {
        warmingUsers.delete(userId);
      }
    }
  });
}
