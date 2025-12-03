import { db } from '@/lib/db/drizzle';
import { buildJobs, chatMessages, chatSessions, type TicketData } from '@/lib/db/schema';
import { getKosukeGitHubToken, getUserGitHubToken } from '@/lib/github/client';
import { enqueueBuild, hasActiveBuild } from '@/lib/queue';
import type { StreamEvent } from '@/lib/types/agent';
import type { KosukeAgentConfig } from '@/lib/types/kosuke-agent';
import type Anthropic from '@anthropic-ai/sdk';
import { PlanEventName, type MessageAttachmentPayload, type Ticket } from '@kosuke-ai/cli';
import { and, asc, eq } from 'drizzle-orm';
import { KosukeEventProcessor } from './event-processor';
import { generateTicketsPath, runPlan } from './plan-service';

interface KosukeAgentState {
  phase: 'idle' | 'planning' | 'clarification' | 'building' | 'complete';
  tickets: Ticket[];
  ticketsPath: string | null;
}

/**
 * Kosuke Agent
 * Orchestrates the plan→build workflow
 * Plan phase streams, build phase enqueues background job
 */
export class KosukeAgent {
  private config: KosukeAgentConfig;
  private sessionPath: string;
  private eventProcessor: KosukeEventProcessor;
  private state: KosukeAgentState;
  private chatSessionDbId: string | null = null;

  private constructor(config: KosukeAgentConfig, sessionPath: string) {
    this.config = config;
    this.sessionPath = sessionPath;
    this.eventProcessor = new KosukeEventProcessor();
    this.state = {
      phase: 'idle',
      tickets: [],
      ticketsPath: null,
    };

    console.log(`🤖 KosukeAgent initialized for project ${config.projectId}`);
    console.log(`📁 Working directory: ${sessionPath}`);
  }

  /**
   * Factory method to create and initialize a KosukeAgent
   */
  static async create(config: KosukeAgentConfig): Promise<KosukeAgent> {
    const { sessionManager } = await import('@/lib/sessions');

    const sessionPath = sessionManager.getSessionPath(config.projectId, config.sessionId);

    return new KosukeAgent(config, sessionPath);
  }

  /**
   * Run the agent with a user message
   *
   * This handles the full plan→build workflow:
   * 1. Plan phase: Generate tickets from user prompt (streaming)
   * 2. Handle clarifications if needed
   * 3. Build phase: Enqueue background job (returns immediately)
   *
   * @param message - User message (prompt for planning, or answer for clarification)
   * @param assistantMessageId - ID of the assistant message to update
   * @param attachments - Optional attachments (images, PDFs) for context in plan phase
   */
  async *run(
    message: string,
    assistantMessageId: string,
    attachments?: MessageAttachmentPayload[]
  ): AsyncGenerator<StreamEvent> {
    console.log(`🚀 Starting Kosuke workflow for session ${this.config.sessionId}`);
    const startTime = Date.now();

    try {
      // Fetch conversation history for resumption
      const conversationHistory = await this.fetchConversationHistory();
      const isResuming = conversationHistory.length > 0;

      if (isResuming) {
        console.log(
          `📜 Resuming conversation with ${conversationHistory.length} previous messages`
        );
      }

      // Start plan→build cycle
      this.eventProcessor.reset();
      this.state.phase = 'planning';

      // === PLAN PHASE ===
      console.log(`📋 Starting plan phase...`);
      yield* this.runPlanPhase(message, attachments, conversationHistory);

      if (this.isWaitingForClarification()) {
        console.log(`❓ Waiting for clarification...`);
        // Save partial state to DB and end stream so user can respond
        await this.finalizeProcessing(assistantMessageId);
        yield { type: 'message_complete' };
        return;
      }

      // === BUILD PHASE ===
      if (this.state.tickets.length > 0) {
        console.log(`🔨 Starting build phase with ${this.state.tickets.length} tickets...`);
        yield* this.enqueueBuildJob();
      } else {
        console.log(`⚠️ No tickets generated, skipping build phase`);
        yield* this.emitText('\n\n⚠️ No tickets were generated. Please provide more details.\n');
        yield { type: 'content_block_stop', index: 0 };
      }

      // === FINALIZE ===
      await this.finalizeProcessing(assistantMessageId);

      yield { type: 'message_complete' };

      const duration = Date.now() - startTime;
      console.log(`⏱️ Total processing time: ${(duration / 1000).toFixed(2)}s`);
    } catch (error) {
      console.error(`❌ Error in Kosuke workflow:`, error);
      await this.handleError(error, assistantMessageId);
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Run the plan phase
   */
  private async *runPlanPhase(
    prompt: string,
    attachments?: MessageAttachmentPayload[],
    conversationHistory?: Anthropic.MessageParam[]
  ): AsyncGenerator<StreamEvent> {
    const ticketsPath = generateTicketsPath(this.sessionPath);

    const planStream = runPlan(
      prompt,
      {
        cwd: this.sessionPath,
        ticketsPath,
        noTest: !this.config.enableTest,
      },
      attachments,
      conversationHistory
    );

    for await (const event of planStream) {
      // Process plan event
      for await (const clientEvent of this.eventProcessor.processPlanEvent(event)) {
        yield clientEvent;
      }

      // Check for clarification - break loop to end stream and wait for user response
      if (event.type === PlanEventName.CLARIFICATION) {
        this.state.phase = 'clarification';
        break; // Exit loop - CLI is blocked waiting for sendAnswer, we'll resume with new request
      }

      // Check for completion
      if (event.type === PlanEventName.COMPLETE) {
        this.state.tickets = this.eventProcessor.getTickets();
        this.state.ticketsPath = ticketsPath;
        this.state.phase = 'building';
      }

      // Check for error - break loop on errors too
      if (event.type === PlanEventName.ERROR) {
        this.state.phase = 'complete';
        break;
      }
    }
  }

  /**
   * Enqueue build job - returns immediately
   */
  private async *enqueueBuildJob(): AsyncGenerator<StreamEvent> {
    if (!this.state.ticketsPath) {
      yield* this.emitText('\n\n❌ No tickets path set\n');
      yield { type: 'content_block_stop', index: 0 };
      return;
    }

    // Get chat session DB ID
    const chatSessionId = await this.getChatSessionDbId();
    if (!chatSessionId) {
      yield* this.emitText('\n\n❌ Chat session not found\n');
      yield { type: 'content_block_stop', index: 0 };
      return;
    }

    // Check for existing active build
    const hasActive = await hasActiveBuild(chatSessionId);
    if (hasActive) {
      yield* this.emitText('\n\n⚠️ A build is already in progress for this session.\n');
      yield { type: 'content_block_stop', index: 0 };
      return;
    }

    // Convert tickets to TicketData format for DB
    const ticketData: TicketData[] = this.state.tickets.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      type: t.type,
      category: t.category,
      estimatedEffort: t.estimatedEffort,
      status: t.status as TicketData['status'],
      error: t.error,
    }));

    // Get GitHub token based on whether project is imported or created
    let githubToken: string;
    if (this.config.isImported) {
      // Imported repos use the user's OAuth token
      const userToken = await getUserGitHubToken(this.config.userId);
      if (!userToken) {
        yield* this.emitText(
          '\n\n❌ GitHub not connected. Please reconnect your GitHub account.\n'
        );
        yield { type: 'content_block_stop', index: 0 };
        return;
      }
      githubToken = userToken;
    } else {
      // Created repos use the Kosuke GitHub App token
      githubToken = await getKosukeGitHubToken();
    }

    // Create build job record in DB
    const [buildJob] = await db
      .insert(buildJobs)
      .values({
        chatSessionId,
        projectId: this.config.projectId,
        status: 'pending',
        tickets: ticketData,
        totalTickets: ticketData.filter(t => t.status === 'Todo' || t.status === 'Error').length,
      })
      .returning();

    // Enqueue the build job
    const bullJobId = await enqueueBuild({
      buildJobId: buildJob.id,
      chatSessionId,
      projectId: this.config.projectId,
      sessionPath: this.sessionPath,
      ticketsPath: this.state.ticketsPath,
      tickets: ticketData,
      dbUrl: this.config.dbUrl,
      githubToken,
      enableReview: this.config.enableReview ?? true,
      enableTest: this.config.enableTest ?? false,
      testUrl: this.config.testUrl,
    });

    // Update build job with BullMQ job ID
    await db.update(buildJobs).set({ bullJobId }).where(eq(buildJobs.id, buildJob.id));

    console.log(`[BUILD] 📋 Build job ${buildJob.id} enqueued (BullMQ: ${bullJobId})`);

    // Create a build message in the chat history
    // This message will be rendered as a BuildMessage component
    await db.insert(chatMessages).values({
      projectId: this.config.projectId,
      chatSessionId,
      role: 'assistant',
      content: null, // Content is rendered by BuildMessage component
      metadata: { buildJobId: buildJob.id },
    });

    // Emit notification to client (will be replaced by the build message)
    yield* this.emitText('\n\n🔨 Build started - processing tickets...\n');
    yield { type: 'content_block_stop', index: 0 };

    this.state.phase = 'building';
  }

  /**
   * Get the database ID for the chat session
   */
  private async getChatSessionDbId(): Promise<string | null> {
    if (this.chatSessionDbId) return this.chatSessionDbId;

    const session = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(eq(chatSessions.sessionId, this.config.sessionId))
      .limit(1);

    if (session.length === 0) return null;

    this.chatSessionDbId = session[0].id;
    return this.chatSessionDbId;
  }

  /**
   * Fetch conversation history from database
   * Converts stored messages to Anthropic.MessageParam format
   */
  private async fetchConversationHistory(): Promise<Anthropic.MessageParam[]> {
    // Get the chat session
    const session = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.sessionId, this.config.sessionId))
      .limit(1);

    if (session.length === 0) {
      return [];
    }

    this.chatSessionDbId = session[0].id;

    // Fetch all messages for this session, ordered by creation time
    const messages = await db
      .select({
        role: chatMessages.role,
        content: chatMessages.content,
      })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.chatSessionId, session[0].id)
          // Exclude the current message (it will be added as the prompt)
        )
      )
      .orderBy(asc(chatMessages.timestamp));

    // Convert to Anthropic format (skip messages without content)
    return messages
      .filter(m => m.content)
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content!,
      }));
  }

  /**
   * Emit text delta event
   */
  private async *emitText(text: string): AsyncGenerator<StreamEvent> {
    yield { type: 'content_block_start', index: 0 };
    yield {
      type: 'content_block_delta',
      delta_type: 'text_delta',
      text,
      index: 0,
    };
  }

  /**
   * Finalize processing and update database
   */
  private async finalizeProcessing(assistantMessageId: string): Promise<void> {
    try {
      const blocks = this.eventProcessor.getAccumulatedBlocks();
      const content = this.eventProcessor.getAccumulatedContent();
      const tokenUsage = this.eventProcessor.getTokenUsage();

      console.log(`📊 Token usage: ${tokenUsage.totalTokens} total`);
      console.log(`💰 Cost: $${this.eventProcessor.getTotalCost().toFixed(4)}`);

      await db
        .update(chatMessages)
        .set({
          content: content || null,
          blocks: blocks as unknown as Record<string, unknown>[],
          tokensInput: tokenUsage.inputTokens,
          tokensOutput: tokenUsage.outputTokens,
          contextTokens: tokenUsage.contextTokens,
        })
        .where(eq(chatMessages.id, assistantMessageId));

      console.log(`✅ Updated assistant message ${assistantMessageId} in database`);
    } catch (error) {
      console.error(`❌ Error finalizing processing:`, error);
      throw error;
    }
  }

  /**
   * Handle errors and update database
   */
  private async handleError(error: unknown, assistantMessageId: string): Promise<void> {
    try {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const partialBlocks = this.eventProcessor.getAccumulatedBlocks();
      const partialContent = this.eventProcessor.getAccumulatedContent();
      const tokenUsage = this.eventProcessor.getTokenUsage();

      const errorBlocks = [
        ...partialBlocks,
        {
          type: 'error',
          message: errorMessage,
        },
      ];

      const errorContent = partialContent
        ? `${partialContent}\n\n**Error:** ${errorMessage}`
        : `**Error:** ${errorMessage}`;

      await db
        .update(chatMessages)
        .set({
          content: errorContent,
          blocks: errorBlocks as unknown as Record<string, unknown>[],
          tokensInput: tokenUsage.inputTokens,
          tokensOutput: tokenUsage.outputTokens,
          contextTokens: tokenUsage.contextTokens,
        })
        .where(eq(chatMessages.id, assistantMessageId));

      console.log(`✅ Updated assistant message with error state`);
    } catch (dbError) {
      console.error(`❌ Failed to update database with error state:`, dbError);
    }
  }

  /**
   * Get current agent state
   */
  getState(): KosukeAgentState {
    return { ...this.state };
  }

  /**
   * Get generated tickets
   */
  getTickets(): Ticket[] {
    return this.state.tickets;
  }

  /**
   * Check if agent is waiting for clarification
   */
  isWaitingForClarification(): boolean {
    return this.state.phase === 'clarification';
  }
}
