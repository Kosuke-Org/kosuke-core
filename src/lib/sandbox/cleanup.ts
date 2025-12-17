import { db } from '@/lib/db/drizzle';
import { chatSessions } from '@/lib/db/schema';
import { getSandboxManager } from '@/lib/sandbox';
import { eq, lt } from 'drizzle-orm';

/**
 * Clean up inactive sandbox sessions
 * @param thresholdMinutes - Sessions inactive for longer than this are stopped
 * @returns Number of sessions cleaned up
 */
export async function cleanupInactiveSessions(thresholdMinutes: number) {
  console.log(`[CLEANUP] 🧹 Starting cleanup (threshold: ${thresholdMinutes}min)...`);

  const sandboxManager = getSandboxManager();
  const cutoffTime = new Date(Date.now() - thresholdMinutes * 60 * 1000);

  // Find all sessions inactive for > threshold
  const inactiveSessions = await db
    .select()
    .from(chatSessions)
    .where(lt(chatSessions.lastActivityAt, cutoffTime));

  console.log(`[CLEANUP] Found ${inactiveSessions.length} inactive sessions`);

  let cleanedCount = 0;
  let skippedCount = 0;

  for (const session of inactiveSessions) {
    try {
      // Re-check activity before stopping (prevent race condition)
      const current = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, session.id))
        .limit(1);

      if (current[0] && current[0].lastActivityAt >= cutoffTime) {
        console.log(`[CLEANUP] ⏭️ Skipping ${session.id} (recently active)`);
        skippedCount++;
        continue;
      }

      // Check if sandbox exists before trying to stop
      const sandbox = await sandboxManager.getSandbox(session.id);
      if (sandbox && sandbox.status === 'running') {
        // Skip production sandboxes - they should keep running
        if (sandbox.mode === 'production') {
          console.log(`[CLEANUP] ⏭️ Skipping production sandbox ${session.id}`);
          skippedCount++;
          continue;
        }

        await sandboxManager.stopSandbox(session.id);
        cleanedCount++;
        console.log(`[CLEANUP] 🛑 Stopped sandbox for session ${session.id}`);
      }
    } catch (error) {
      console.error(
        `[CLEANUP] ❌ Failed to cleanup session ${session.id}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  console.log(
    `[CLEANUP] ✅ Cleaned up ${cleanedCount}/${inactiveSessions.length} sessions` +
      (skippedCount > 0 ? ` (${skippedCount} skipped due to recent activity)` : '')
  );
  return cleanedCount;
}
