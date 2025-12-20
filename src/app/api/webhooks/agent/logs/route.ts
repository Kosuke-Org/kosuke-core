import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { agentLogInsertSchema } from '@/lib/db/schema';
import { addAgentLogJob } from '@/lib/queue/queues/agent-logs';

/**
 * POST /api/webhooks/agent/logs
 * Endpoint for kosuke-cli to log command executions
 * Uses BullMQ queue for async processing
 */
export async function POST(request: Request) {
  // Verify API key from CLI
  const apiKey = request.headers.get('x-cli-api-key');
  const expectedKey = process.env.SANDBOX_WEBHOOK_SECRET;
  if (!expectedKey) {
    console.error(`Received Agent logs webhook but SANDBOX_WEBHOOK_SECRET is not configured`);
    return NextResponse.json({ message: 'Unable to verify webhook signature' });
  }
  if (!apiKey || apiKey !== expectedKey) {
    console.error(`Received Agent logs webhook but API key is invalid`);
    return NextResponse.json({ message: 'Wrong webhook signature' });
  }

  // Parse and validate request body
  const body = await request.json();
  console.log('🔍 Saving log:', body);
  let validatedData;
  try {
    validatedData = agentLogInsertSchema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }
    throw error;
  }

  // Queue log for async processing (non-blocking)
  const job = await addAgentLogJob(validatedData);

  console.log(`✅ Queued log for project ${validatedData.projectId}: ${validatedData.command}`);

  return NextResponse.json({ success: true, jobId: job.id });
}
