import type Anthropic from '@anthropic-ai/sdk';
import type { MessageAttachmentPayload, PlanStreamEventType } from '@kosuke-ai/cli';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface PlanServiceConfig {
  cwd: string;
  noTest?: boolean;
  ticketsPath: string;
}

/**
 * Run the plan phase with full streaming support
 *
 * When resuming after clarification, pass conversationHistory to continue
 * the conversation with Claude. The user's answer will be the prompt.
 *
 * @param prompt - The feature/bug description (or clarification answer)
 * @param config - Plan service configuration
 * @param attachments - Optional attachments (images, PDFs) for context
 * @param conversationHistory - Conversation history for resuming after clarification
 * @yields PlanStreamEventType
 */
export async function* runPlan(
  prompt: string,
  config: PlanServiceConfig,
  attachments?: MessageAttachmentPayload[],
  conversationHistory?: Anthropic.MessageParam[]
): AsyncGenerator<PlanStreamEventType> {
  try {
    const { planCoreStreaming } = await import('@kosuke-ai/cli');

    const planStream = planCoreStreaming({
      prompt,
      directory: config.cwd,
      noTest: config.noTest ?? true,
      ticketsPath: config.ticketsPath,
      attachments,
      // Type cast needed due to different @anthropic-ai/sdk versions between packages
      conversationHistory: conversationHistory as Parameters<
        typeof planCoreStreaming
      >[0]['conversationHistory'],
    });

    for await (const event of planStream) {
      yield event;
    }
  } catch (error) {
    yield {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Generate a timestamped tickets path
 * Creates the tickets directory if it doesn't exist
 */
export function generateTicketsPath(cwd: string): string {
  const ticketsDir = join(cwd, 'tickets');

  // Create tickets folder if it doesn't exist
  if (!existsSync(ticketsDir)) {
    mkdirSync(ticketsDir, { recursive: true });
  }

  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[T:]/g, '-')
    .replace(/\.\d{3}Z$/, '');

  return join(ticketsDir, `${timestamp}.ticket.json`);
}
