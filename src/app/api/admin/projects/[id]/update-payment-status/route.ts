import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { ClerkService } from '@/lib/clerk/service';
import { db } from '@/lib/db/drizzle';
import { projectAuditLogs, projects, type ProjectStatus } from '@/lib/db/schema';
import { sendProjectStatusNotification } from '@/lib/email';

interface UpdatePaymentStatusBody {
  status?: ProjectStatus;
  stripeInvoiceUrl?: string;
}

/**
 * POST /api/admin/projects/[id]/update-payment-status
 * Update project payment status and/or Stripe invoice URL
 * Requires super admin access
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const { userId } = await auth();
    const { id: projectId } = await params;
    const body: UpdatePaymentStatusBody = await request.json();

    // Get project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const updates: { status?: ProjectStatus; stripeInvoiceUrl?: string; updatedAt: Date } = {
      updatedAt: new Date(),
    };

    // Handle status update (super admin can set any status)
    if (body.status) {
      updates.status = body.status;
    }

    // Handle Stripe invoice URL update
    if (body.stripeInvoiceUrl !== undefined) {
      // Validate URL format if provided
      if (body.stripeInvoiceUrl && !isValidUrl(body.stripeInvoiceUrl)) {
        return NextResponse.json({ error: 'Invalid Stripe invoice URL format' }, { status: 400 });
      }
      updates.stripeInvoiceUrl = body.stripeInvoiceUrl;
    }

    // Require at least one update
    if (!body.status && body.stripeInvoiceUrl === undefined) {
      return NextResponse.json(
        { error: 'Must provide either status or stripeInvoiceUrl to update' },
        { status: 400 }
      );
    }

    // Update project
    await db.update(projects).set(updates).where(eq(projects.id, projectId));

    // Create audit log
    await db.insert(projectAuditLogs).values({
      projectId,
      userId: userId || 'admin',
      action: body.status ? 'payment_status_updated' : 'stripe_invoice_url_updated',
      previousValue: body.status ? project.status : project.stripeInvoiceUrl || null,
      newValue: body.status || body.stripeInvoiceUrl || null,
      metadata: {
        updatedAt: new Date().toISOString(),
        updatedBy: userId || 'admin',
        ...(body.status && { previousStatus: project.status, newStatus: body.status }),
        ...(body.stripeInvoiceUrl !== undefined && {
          previousStripeInvoiceUrl: project.stripeInvoiceUrl,
          newStripeInvoiceUrl: body.stripeInvoiceUrl,
        }),
      },
    });

    console.log(
      `[API /admin/update-payment-status] ✅ Project ${projectId} updated: ${JSON.stringify({
        status: body.status,
        stripeInvoiceUrl: body.stripeInvoiceUrl ? '[URL]' : undefined,
      })}`
    );

    // Send email notification to project creator if status changed
    if (body.status && project.createdBy) {
      // Non-blocking email send
      (async () => {
        try {
          const clerkService = new ClerkService();
          const user = await clerkService.getUser(project.createdBy!);

          await sendProjectStatusNotification({
            recipientEmail: user.email,
            recipientName: user.name,
            projectId: project.id,
            projectName: project.name,
            previousStatus: project.status,
            newStatus: body.status!,
            stripeInvoiceUrl: body.stripeInvoiceUrl ?? project.stripeInvoiceUrl,
          });
        } catch (emailError) {
          console.error(
            '[API /admin/update-payment-status] Failed to send email notification:',
            emailError
          );
        }
      })();
    }

    return NextResponse.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        status: body.status || project.status,
        stripeInvoiceUrl: body.stripeInvoiceUrl ?? project.stripeInvoiceUrl,
        message: 'Project payment status updated successfully',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[API /admin/update-payment-status] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to update project payment status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Validate URL format
 */
function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}
