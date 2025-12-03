import type { BuildStreamEventType, Ticket } from '@kosuke-ai/cli';

interface BuildServiceConfig {
  cwd: string;
  dbUrl: string;
  enableReview?: boolean;
  enableTest?: boolean;
  testUrl?: string;
}

/**
 * Process tickets sequentially using kosuke-cli's buildCoreStreaming
 *
 * @param tickets - Array of tickets to process
 * @param config - Build service configuration
 * @yields BuildStreamEventType
 */
export async function* runBuild(
  tickets: Ticket[],
  config: BuildServiceConfig
): AsyncGenerator<BuildStreamEventType> {
  try {
    // Import buildCoreStreaming dynamically to avoid bundling issues
    const { buildCoreStreaming, sortTicketsByProcessingOrder } = await import('@kosuke-ai/cli');

    // Filter tickets that need processing (Todo or Error status)
    const ticketsToProcess = tickets.filter(t => t.status === 'Todo' || t.status === 'Error');

    if (ticketsToProcess.length === 0) {
      yield {
        type: 'build_complete',
        successCount: 0,
        failedCount: 0,
        totalTickets: 0,
        totalTokensUsed: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
        totalCost: 0,
      };
      return;
    }

    const sortedTickets = sortTicketsByProcessingOrder(ticketsToProcess);

    const buildStream = buildCoreStreaming(sortedTickets, {
      directory: config.cwd,
      dbUrl: config.dbUrl,
      review: config.enableReview ?? true,
      url: config.testUrl,
      noLogs: true,
    });

    for await (const event of buildStream) {
      yield event;
    }
  } catch (error) {
    yield {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    };

    yield {
      type: 'build_complete',
      successCount: 0,
      failedCount: tickets.length,
      totalTickets: tickets.length,
      totalTokensUsed: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
      totalCost: 0,
    };
  }
}
