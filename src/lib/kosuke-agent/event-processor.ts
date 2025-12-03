import type { AssistantBlock, StreamEvent } from '@/lib/types';
import {
  BuildEventName,
  PlanEventName,
  type BuildStreamEventType,
  type BuildTokenUsage,
  type PlanStreamEventType,
  type Ticket,
} from '@kosuke-ai/cli';

/**
 * Kosuke Event Processor
 * Converts plan/build events to StreamEvent format compatible with existing chat UI
 */
export class KosukeEventProcessor {
  private allBlocks: AssistantBlock[] = [];
  private currentContent = '';
  // Track pending tools by ID for matching with results
  private pendingTools: Map<string, number> = new Map();

  // Token usage accumulation
  private tokensUsed: BuildTokenUsage = {
    input: 0,
    output: 0,
    cacheCreation: 0,
    cacheRead: 0,
  };
  private totalCost = 0;

  // Ticket tracking
  private tickets: Ticket[] = [];
  private ticketsPath: string | null = null;

  constructor() {}

  /**
   * Process a plan stream event and yield client events
   *
   * Streams all Claude output (text, tool calls) until clarification or completion.
   */
  async *processPlanEvent(event: PlanStreamEventType): AsyncGenerator<StreamEvent> {
    switch (event.type) {
      case PlanEventName.TEXT_DELTA:
        yield* this.handleTextDelta(event.content);
        break;

      case PlanEventName.TOOL_USE:
        // Close any open text block before starting tool
        // This ensures text after tools creates a new block
        if (this.currentContent) {
          this.finalizeContent(); // Save content to allBlocks before resetting
          yield { type: 'content_block_stop', index: 0 };
        }

        // Store tool block for persistence (AssistantBlock format)
        this.allBlocks.push({
          type: 'tool',
          name: event.toolName,
          input: event.input as Record<string, unknown>,
          status: 'running',
        });
        // Track pending tool index for matching with result
        this.pendingTools.set(event.toolId, this.allBlocks.length - 1);

        // Emit tool_start event for UI to render
        yield {
          type: 'tool_start',
          tool_name: event.toolName,
          tool_input: event.input,
          tool_id: event.toolId,
        };
        break;

      case PlanEventName.TOOL_RESULT:
        // Update the stored tool block with result
        const toolIndex = this.pendingTools.get(event.toolId);
        if (toolIndex !== undefined) {
          const toolBlock = this.allBlocks[toolIndex];
          if (toolBlock && toolBlock.type === 'tool') {
            toolBlock.status = event.isError ? 'error' : 'completed';
            toolBlock.result = event.result;
          }
          this.pendingTools.delete(event.toolId);
        }

        // Emit tool_stop event for UI to show success/failure
        yield {
          type: 'tool_stop',
          tool_id: event.toolId,
          tool_result: event.result,
          is_error: event.isError,
        };
        break;

      case PlanEventName.CLARIFICATION:
        this.finalizeContent(); // Save content to allBlocks before closing
        yield {
          type: 'content_block_stop',
          index: 0,
        };
        break;

      case PlanEventName.TICKETS_GENERATED:
        this.tickets = event.tickets;
        this.ticketsPath = event.ticketsPath;
        // Add tickets summary to content
        const ticketsSummary = this.formatTicketsSummary(event.tickets);
        yield* this.handleTextDelta(ticketsSummary);
        // Note: ticketsSummary is already accumulated in currentContent via handleTextDelta
        // It will be saved when finalizeContent is called
        break;

      case PlanEventName.COMPLETE:
        this.ticketsPath = event.ticketsPath;
        this.tokensUsed = event.tokensUsed;
        this.totalCost = event.cost;
        // Close any active text block
        yield { type: 'content_block_stop', index: 0 };
        break;

      case PlanEventName.ERROR:
        yield {
          type: 'error',
          message: event.message,
        };
        break;
    }
  }

  /**
   * Process a build progress event and yield client events
   */
  async *processBuildEvent(event: BuildStreamEventType): AsyncGenerator<StreamEvent> {
    switch (event.type) {
      case BuildEventName.TICKET_START:
        yield* this.handleTextDelta(
          `\n\n🔧 **Processing ticket ${event.ticketIndex + 1}/${event.totalTickets}:** ${event.ticket.title}\n`
        );
        break;

      case BuildEventName.TICKET_COMPLETE:
        const status = event.success ? '✅' : '❌';
        const statusText = event.success
          ? 'completed'
          : `failed: ${event.error || 'Unknown error'}`;
        yield* this.handleTextDelta(`${status} Ticket ${event.ticket.id} ${statusText}\n`);

        // Accumulate tokens
        if (event.tokensUsed) {
          this.tokensUsed.input += event.tokensUsed.input;
          this.tokensUsed.output += event.tokensUsed.output;
          this.tokensUsed.cacheCreation += event.tokensUsed.cacheCreation;
          this.tokensUsed.cacheRead += event.tokensUsed.cacheRead;
        }
        this.totalCost += event.cost || 0;
        break;

      case BuildEventName.STATUS:
        yield* this.handleTextDelta(`ℹ️ ${event.message}\n`);
        break;

      case BuildEventName.BUILD_COMPLETE:
        const summary = this.formatBuildSummary(
          event.successCount,
          event.failedCount,
          event.totalTickets,
          event.totalCost
        );
        yield* this.handleTextDelta(summary);
        // Update totals
        this.tokensUsed = event.totalTokensUsed;
        this.totalCost = event.totalCost;
        // Close content block
        yield { type: 'content_block_stop', index: 0 };
        break;

      case BuildEventName.ERROR:
        yield {
          type: 'error',
          message: event.message,
        };
        break;
    }
  }

  /**
   * Handle text delta - emit event and accumulate
   */
  private async *handleTextDelta(text: string): AsyncGenerator<StreamEvent> {
    // Start content block if first text
    if (this.currentContent === '') {
      yield { type: 'content_block_start', index: 0 };
    }

    this.currentContent += text;

    yield {
      type: 'content_block_delta',
      delta_type: 'text_delta',
      text,
      index: 0,
    };
  }

  /**
   * Format tickets as markdown summary
   */
  private formatTicketsSummary(tickets: Ticket[]): string {
    if (tickets.length === 0) {
      return '\n\n**No tickets generated.**\n';
    }

    const lines: string[] = ['\n\n## 📋 Generated Tickets\n'];

    // Group by type
    const byType = tickets.reduce(
      (acc, ticket) => {
        const type = ticket.type || 'other';
        if (!acc[type]) acc[type] = [];
        acc[type].push(ticket);
        return acc;
      },
      {} as Record<string, Ticket[]>
    );

    const typeOrder = ['schema', 'engine', 'backend', 'frontend', 'test'];

    for (const type of typeOrder) {
      const typeTickets = byType[type];
      if (!typeTickets || typeTickets.length === 0) continue;

      lines.push(`\n### ${type.charAt(0).toUpperCase() + type.slice(1)}`);
      for (const ticket of typeTickets) {
        const effort = '🔹'.repeat(Math.min(ticket.estimatedEffort, 5));
        lines.push(`- **${ticket.id}**: ${ticket.title} ${effort}`);
      }
    }

    lines.push(`\n**Total: ${tickets.length} tickets**\n`);
    return lines.join('\n');
  }

  /**
   * Format build summary
   */
  private formatBuildSummary(success: number, failed: number, total: number, cost: number): string {
    const lines: string[] = ['\n\n## 🏁 Build Complete\n'];

    if (failed === 0) {
      lines.push(`✅ **All ${total} tickets completed successfully!**`);
    } else {
      lines.push(`⚠️ **${success}/${total} tickets completed** (${failed} failed)`);
    }

    lines.push(`\n💰 **Cost:** $${cost.toFixed(4)}`);

    return lines.join('\n');
  }

  /**
   * Finalize and save accumulated content as a block
   */
  finalizeContent(): void {
    if (this.currentContent.trim()) {
      this.allBlocks.push({
        type: 'text',
        content: this.currentContent,
      });
      this.currentContent = '';
    }
  }

  /**
   * Get accumulated blocks for database storage
   */
  getAccumulatedBlocks(): AssistantBlock[] {
    this.finalizeContent();
    return this.allBlocks;
  }

  /**
   * Get accumulated content as string (from all blocks + current)
   */
  getAccumulatedContent(): string {
    // Build content from all saved blocks plus any current content
    let content = '';
    for (const block of this.allBlocks) {
      if (block.type === 'text') {
        content += block.content + '\n\n';
      }
    }
    // Add any current content not yet saved
    if (this.currentContent.trim()) {
      content += this.currentContent;
    }
    return content.trim();
  }

  /**
   * Get token usage statistics
   */
  getTokenUsage() {
    return {
      inputTokens: this.tokensUsed.input,
      outputTokens: this.tokensUsed.output,
      contextTokens: this.tokensUsed.cacheRead,
      totalTokens: this.tokensUsed.input + this.tokensUsed.output,
    };
  }

  /**
   * Get total cost
   */
  getTotalCost(): number {
    return this.totalCost;
  }

  /**
   * Get generated tickets
   */
  getTickets(): Ticket[] {
    return this.tickets;
  }

  /**
   * Get tickets path
   */
  getTicketsPath(): string | null {
    return this.ticketsPath;
  }

  /**
   * Reset processor state
   */
  reset(): void {
    this.allBlocks = [];
    this.currentContent = '';
    this.pendingTools.clear();
    this.tokensUsed = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
    this.totalCost = 0;
    this.tickets = [];
    this.ticketsPath = null;
  }
}
