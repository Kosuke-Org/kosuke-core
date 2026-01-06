import { NextRequest } from 'next/server';

/**
 * POST /api/maintenance
 * Temporary fake endpoint that simulates CLI maintenance command
 * Returns SSE stream with progress updates, then random success/fail
 *
 * This endpoint will be replaced when the real CLI is ready.
 * The CLI will handle: branch creation, commits, PR opening
 */
export async function POST(request: NextRequest) {
  const { jobType } = (await request.json()) as { jobType: string };

  // Create a streaming response
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Get display name for job type
      const jobDisplayNames: Record<string, string> = {
        sync_rules: 'Sync Rules',
        analyze: 'Code Analysis',
        security_check: 'Security Check',
      };
      const jobDisplayName = jobDisplayNames[jobType] || jobType;

      // Simulate 30 seconds of work with progress updates
      const steps = [
        { message: `Starting ${jobDisplayName} maintenance job...`, delay: 2000 },
        { message: 'Cloning repository...', delay: 3000 },
        { message: 'Creating maintenance branch...', delay: 2000 },
        { message: 'Analyzing project structure...', delay: 4000 },
        { message: `Running ${jobDisplayName.toLowerCase()}...`, delay: 8000 },
        { message: 'Processing results...', delay: 5000 },
        { message: 'Committing changes...', delay: 3000 },
        { message: 'Opening pull request...', delay: 3000 },
      ];

      for (const step of steps) {
        sendEvent({ type: 'progress', message: step.message });
        await new Promise(resolve => setTimeout(resolve, step.delay));
      }

      // Random success/fail (70% success)
      const success = Math.random() > 0.3;

      if (success) {
        // Generate a fake PR URL
        const prNumber = Math.floor(Math.random() * 1000) + 1;
        const prUrl = `https://github.com/example/repo/pull/${prNumber}`;

        sendEvent({
          type: 'done',
          success: true,
          prUrl,
          prNumber,
          summary: `${jobDisplayName} completed successfully.\n\nChanges made:\n- Updated 3 configuration files\n- Applied 2 recommended improvements\n- Fixed 1 potential issue`,
        });
      } else {
        sendEvent({
          type: 'done',
          success: false,
          error:
            'Simulated failure for testing purposes. This is a fake endpoint that will be replaced when the real CLI is ready.',
        });
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
