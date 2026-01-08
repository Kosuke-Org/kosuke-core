/**
 * Event Formatters & Logging
 * Formats SSE events for worker console output with styling
 *
 * Organized by event domain:
 * - Build phase events (started, progress, done, etc.)
 * - Ship events (tool_call, message, phase, done)
 * - Test events (started, turn, completed, etc.)
 * - Migrate events (started, done)
 * - Validation events (started, step_*, completed, error)
 * - Submit events (review, commit, pr phases)
 */

import {
  BUILD_EVENTS,
  MIGRATE_EVENTS,
  SHIP_EVENTS,
  SUBMIT_EVENTS,
  TEST_EVENTS,
  VALIDATION_EVENTS,
  type BuildSSEEvent,
  type MessagePayload,
  type SubmitSSEEvent,
  type ToolCallPayload,
} from '@Kosuke-Org/cli';

const SEPARATOR = '='.repeat(80);
const SEPARATOR_LIGHT = '-'.repeat(60);

// ============================================================================
// Type Guards
// ============================================================================

function isShipEvent(event: BuildSSEEvent): boolean {
  return event.type.startsWith('ship_');
}

function isTestEvent(event: BuildSSEEvent): boolean {
  return event.type.startsWith('test_');
}

function isMigrateEvent(event: BuildSSEEvent): boolean {
  return event.type.startsWith('migrate_');
}

function isValidationEvent(event: BuildSSEEvent): boolean {
  return event.type.startsWith('validation_');
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatToolCall(prefix: string, data: ToolCallPayload): string {
  const params = data.params || {};
  const paramStr =
    (params.path as string) ||
    (params.command as string) ||
    (params.pattern as string) ||
    (params.query as string) ||
    '';
  return `🔧 ${prefix}: ${data.action}${paramStr ? ` ${paramStr}` : ''}`;
}

function formatMessage(data: MessagePayload): string | null {
  if (!data.text || data.text.length === 0) return null;
  const text = data.text.substring(0, 200);
  return text.length >= 200 ? `${text}...` : text;
}

// ============================================================================
// Domain-Specific Formatters
// ============================================================================

/**
 * Format build phase events (started, progress, done, ticket lifecycle)
 */
function formatBuildPhaseEvent(event: BuildSSEEvent): string[] {
  const lines: string[] = [];

  switch (event.type) {
    case BUILD_EVENTS.STARTED:
      lines.push('');
      lines.push(SEPARATOR);
      lines.push(`🏗️  Build Started`);
      lines.push(`   Tickets: ${event.data.totalTickets}`);
      lines.push(`   File: ${event.data.ticketsFile}`);
      lines.push(`   Commit: ${event.data.startCommit?.substring(0, 8)}`);
      lines.push(SEPARATOR);
      break;

    case BUILD_EVENTS.TICKET_STARTED:
      lines.push('');
      lines.push(SEPARATOR);
      lines.push(`📦 Ticket ${event.data.index}/${event.data.total}: ${event.data.ticket.id}`);
      lines.push(`   Title: ${event.data.ticket.title}`);
      lines.push(`   Type: ${event.data.ticket.type || 'feature'}`);
      if (event.data.ticket.category) {
        lines.push(`   Category: ${event.data.ticket.category}`);
      }
      lines.push(SEPARATOR);
      break;

    case BUILD_EVENTS.TICKET_PHASE: {
      const phaseEmoji: Record<string, string> = {
        ship: '🚢',
        test: '🧪',
        migrate: '🗄️',
      };
      lines.push(
        `${phaseEmoji[event.data.phase] || '🔄'} Phase: ${event.data.phase.toUpperCase()} (${event.data.status})`
      );
      break;
    }

    case BUILD_EVENTS.TICKET_COMPLETED: {
      const emoji = event.data.result === 'success' ? '✅' : '❌';
      lines.push('');
      lines.push(SEPARATOR_LIGHT);
      lines.push(`${emoji} Ticket ${event.data.result}: ${event.data.ticket.id}`);
      lines.push(`   ${event.data.ticket.title}`);
      lines.push(SEPARATOR_LIGHT);
      break;
    }

    case BUILD_EVENTS.TICKET_COMMITTED:
      lines.push(`💾 Committed: ${event.data.commitMessage}`);
      break;

    case BUILD_EVENTS.TICKET_RETRY:
      lines.push('');
      lines.push(SEPARATOR_LIGHT);
      lines.push(
        `🔄 Retry ${event.data.attempt}/${event.data.maxAttempts}: ${event.data.ticketId}`
      );
      lines.push(`   Error: ${event.data.error}`);
      lines.push(SEPARATOR_LIGHT);
      break;

    case BUILD_EVENTS.STOPPED:
      lines.push('');
      lines.push(SEPARATOR);
      lines.push(`🛑 Build Stopped: ${event.data.reason}`);
      lines.push(`   Remaining: ${event.data.remainingTickets} tickets`);
      lines.push(SEPARATOR);
      break;

    case BUILD_EVENTS.PROGRESS:
      lines.push(
        `📊 Progress: ${event.data.completed}/${event.data.total} (${event.data.percentage}%)`
      );
      break;

    case BUILD_EVENTS.LINT_STARTED:
      lines.push('');
      lines.push(SEPARATOR_LIGHT);
      lines.push(`🔧 Lint Phase Started`);
      lines.push(SEPARATOR_LIGHT);
      break;

    case BUILD_EVENTS.LINT_COMPLETED:
      lines.push(`✅ Lint Complete: ${event.data.fixCount} fixes`);
      break;

    case BUILD_EVENTS.DONE:
      lines.push('');
      lines.push(SEPARATOR);
      lines.push(`🏁 Build Complete`);
      lines.push(`   Success: ${event.data.success}`);
      lines.push(`   Processed: ${event.data.ticketsProcessed}`);
      lines.push(`   Succeeded: ${event.data.ticketsSucceeded}`);
      lines.push(`   Failed: ${event.data.ticketsFailed}`);
      if (event.data.error) lines.push(`   Error: ${event.data.error}`);
      lines.push(SEPARATOR);
      break;

    default:
      lines.push(`⚠️ Unknown build event: ${(event as { type: string }).type}`);
      lines.push(`   ${JSON.stringify((event as { data: unknown }).data)}`);
  }

  return lines;
}

/**
 * Format ship events (tool_call, message, phase, done)
 */
function formatShipEvent(event: BuildSSEEvent): string[] {
  const lines: string[] = [];

  switch (event.type) {
    case SHIP_EVENTS.TOOL_CALL:
      lines.push(formatToolCall('Ship', event.data));
      break;

    case SHIP_EVENTS.MESSAGE: {
      const shipMsg = formatMessage(event.data);
      if (shipMsg) lines.push(`💭 ${shipMsg}`);
      break;
    }

    case SHIP_EVENTS.PHASE:
      lines.push(`ℹ️  Ship: ${event.data.phase} (${event.data.status})`);
      if (event.data.error) lines.push(`   Error: ${event.data.error}`);
      break;

    case SHIP_EVENTS.DONE:
      lines.push(`✅ Ship Done | Fixes: ${event.data.implementationFixCount}`);
      if (event.data.error) lines.push(`   Error: ${event.data.error}`);
      break;
  }

  return lines;
}

/**
 * Format test events (started, turn, completed, etc.)
 */
function formatTestEvent(event: BuildSSEEvent): string[] {
  const lines: string[] = [];

  switch (event.type) {
    case TEST_EVENTS.TOOL_CALL:
      lines.push(formatToolCall('Test', event.data));
      break;

    case TEST_EVENTS.MESSAGE: {
      const testMsg = formatMessage(event.data);
      if (testMsg) lines.push(`🧪 ${testMsg}`);
      break;
    }

    case TEST_EVENTS.STARTED:
      lines.push(`🧪 Test Started: ${event.data.testIdentifier}`);
      lines.push(`   URL: ${event.data.url} | Headless: ${event.data.headless}`);
      break;

    case TEST_EVENTS.TURN:
      lines.push(`🧪 Test Turn: ${event.data.turnNumber}/${event.data.maxTurns}`);
      break;

    case TEST_EVENTS.COMPLETED:
      lines.push(`🧪 Test ${event.data.success ? 'Passed ✅' : 'Failed ❌'}`);
      break;

    case TEST_EVENTS.MCP_CONNECTED:
      lines.push(`🔌 MCP Connected: ${event.data.toolsAvailable} tools`);
      break;

    case TEST_EVENTS.DONE:
      lines.push(`✅ Test Done | Success: ${event.data.success}`);
      if (event.data.error) lines.push(`   Error: ${event.data.error}`);
      break;
  }

  return lines;
}

/**
 * Format migrate events (started, done)
 */
function formatMigrateEvent(event: BuildSSEEvent): string[] {
  const lines: string[] = [];

  switch (event.type) {
    case MIGRATE_EVENTS.TOOL_CALL:
      lines.push(formatToolCall('Migrate', event.data));
      break;

    case MIGRATE_EVENTS.MESSAGE: {
      const migrateMsg = formatMessage(event.data);
      if (migrateMsg) lines.push(`🗄️ ${migrateMsg}`);
      break;
    }

    case MIGRATE_EVENTS.STARTED:
      lines.push(`🗄️ Migration Started`);
      lines.push(`   DB: ${event.data.dbUrl.replace(/:[^:]+@/, ':****@')}`);
      break;

    case MIGRATE_EVENTS.DONE:
      lines.push(`✅ Migration Done | Applied: ${event.data.migrationsApplied}`);
      if (event.data.error) lines.push(`   Error: ${event.data.error}`);
      break;
  }

  return lines;
}

/**
 * Format validation events (started, step_*, completed, error)
 */
function formatValidationEvent(event: BuildSSEEvent): string[] {
  const lines: string[] = [];

  switch (event.type) {
    case VALIDATION_EVENTS.STARTED:
      lines.push(`🔍 Validation Started: ${event.data.steps.join(', ')}`);
      break;

    case VALIDATION_EVENTS.STEP_STARTED:
      lines.push(`   Step ${event.data.index}/${event.data.total}: ${event.data.step}`);
      break;

    case VALIDATION_EVENTS.STEP_SKIPPED:
      lines.push(`   ⏭️ Skipped: ${event.data.step} (${event.data.reason})`);
      break;

    case VALIDATION_EVENTS.STEP_PASSED:
      lines.push(`   ✅ Passed: ${event.data.step}`);
      break;

    case VALIDATION_EVENTS.STEP_FAILED:
      lines.push(`   ❌ Failed: ${event.data.step}`);
      if (event.data.error) lines.push(`      Error: ${event.data.error}`);
      break;

    case VALIDATION_EVENTS.STEP_FIXED:
      lines.push(`   🔧 Fixed: ${event.data.step}`);
      break;

    case VALIDATION_EVENTS.FIX_STARTED:
      lines.push(`   🔧 Fix attempt ${event.data.index}/${event.data.total}: ${event.data.step}`);
      break;

    case VALIDATION_EVENTS.FIX_COMPLETED:
      lines.push(`   ✅ Fix completed: ${event.data.step}`);
      break;

    case VALIDATION_EVENTS.TOOL_CALL:
      lines.push(formatToolCall('Validation', event.data));
      break;

    case VALIDATION_EVENTS.COMPLETED:
      lines.push(`✅ Validation Complete | Fixes: ${event.data.fixCount}`);
      break;

    case VALIDATION_EVENTS.ERROR:
      lines.push(`❌ Validation Error: ${event.data.message}`);
      break;
  }

  return lines;
}

// ============================================================================
// Main Formatters
// ============================================================================

/**
 * Format a build SSE event for logging
 * Returns an array of log lines (each should be logged separately)
 */
function formatBuildEvent(event: BuildSSEEvent): string[] {
  if (isShipEvent(event)) return formatShipEvent(event);
  if (isTestEvent(event)) return formatTestEvent(event);
  if (isMigrateEvent(event)) return formatMigrateEvent(event);
  if (isValidationEvent(event)) return formatValidationEvent(event);
  return formatBuildPhaseEvent(event);
}

/**
 * Format a submit SSE event for logging
 */
function formatSubmitEvent(event: SubmitSSEEvent): string[] {
  const lines: string[] = [];

  switch (event.type) {
    case SUBMIT_EVENTS.STARTED:
      lines.push(`🚀 Submit Started: ${event.data.cwd}`);
      break;

    case SUBMIT_EVENTS.REVIEW_STARTED:
      lines.push('');
      lines.push(SEPARATOR_LIGHT);
      lines.push(`🔍 Review Phase Started (${event.data.ticketCount} tickets)`);
      lines.push(SEPARATOR_LIGHT);
      break;

    case SUBMIT_EVENTS.REVIEW_TOOL_CALL:
      lines.push(formatToolCall('Review', event.data));
      break;

    case SUBMIT_EVENTS.REVIEW_MESSAGE: {
      const msg = formatMessage(event.data);
      if (msg) lines.push(`💭 ${msg}`);
      break;
    }

    case SUBMIT_EVENTS.REVIEW_GIT_DIFF:
      lines.push(`📝 Git diff: ${event.data.diffSize} chars`);
      break;

    case SUBMIT_EVENTS.REVIEW_COMPLETED:
      lines.push(
        `✅ Review Complete | Issues: ${event.data.issuesFound} | Fixes: ${event.data.fixesApplied}`
      );
      break;

    case SUBMIT_EVENTS.COMMIT_STARTED:
      lines.push('');
      lines.push(SEPARATOR_LIGHT);
      lines.push(`💾 Commit Phase Started`);
      lines.push(`   Message: ${event.data.message}`);
      lines.push(SEPARATOR_LIGHT);
      break;

    case SUBMIT_EVENTS.COMMIT_TOOL_CALL:
      lines.push(formatToolCall('Commit', event.data));
      break;

    case SUBMIT_EVENTS.COMMIT_MESSAGE: {
      const msg = formatMessage(event.data);
      if (msg) lines.push(`💭 ${msg}`);
      break;
    }

    case SUBMIT_EVENTS.COMMIT_PROGRESS:
      if (event.data.attempt !== undefined && event.data.maxRetries !== undefined) {
        lines.push(
          `ℹ️ Commit: ${event.data.phase} (${event.data.attempt}/${event.data.maxRetries})`
        );
      } else {
        lines.push(`ℹ️ Commit: ${event.data.phase}`);
      }
      break;

    case SUBMIT_EVENTS.COMMIT_SKIPPED:
      lines.push(`ℹ️ Commit skipped: ${event.data.reason}`);
      break;

    case SUBMIT_EVENTS.COMMIT_COMPLETED:
      lines.push(`✅ Commit Complete: ${event.data.commitSha || 'unknown'}`);
      break;

    case SUBMIT_EVENTS.PR_STARTED:
      lines.push('');
      lines.push(SEPARATOR_LIGHT);
      lines.push(`📋 PR Creation Started`);
      lines.push(`   ${event.data.head} → ${event.data.base}`);
      lines.push(`   Title: ${event.data.title}`);
      lines.push(SEPARATOR_LIGHT);
      break;

    case SUBMIT_EVENTS.PR_COMPLETED:
      lines.push(`✅ PR Created: ${event.data.prUrl}`);
      break;

    case SUBMIT_EVENTS.DONE:
      lines.push('');
      lines.push(SEPARATOR);
      lines.push(`🎉 Submit ${event.data.success ? 'Complete' : 'Failed'}`);
      if (event.data.prUrl) lines.push(`   PR: ${event.data.prUrl}`);
      if (event.data.error) lines.push(`   Error: ${event.data.error}`);
      lines.push(SEPARATOR);
      break;

    case SUBMIT_EVENTS.ERROR:
      lines.push(`❌ Error: ${event.data.message}`);
      break;

    default:
      lines.push(`⚠️ Unknown: ${(event as { type: string }).type}`);
      lines.push(`   ${JSON.stringify((event as { data: unknown }).data)}`);
  }

  return lines;
}

/**
 * Log a build SSE event with [BUILD] prefix
 */
export function logBuildEvent(event: BuildSSEEvent): void {
  for (const line of formatBuildEvent(event)) {
    console.log(`[BUILD] ${line}`);
  }
}

/**
 * Log a submit SSE event with [SUBMIT] prefix
 */
export function logSubmitEvent(event: SubmitSSEEvent): void {
  for (const line of formatSubmitEvent(event)) {
    console.log(`[SUBMIT] ${line}`);
  }
}
