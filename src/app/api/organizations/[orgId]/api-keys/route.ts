import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { clerkService } from '@/lib/clerk';
import { decrypt, encrypt, maskApiKey } from '@/lib/crypto';
import { db } from '@/lib/db/drizzle';
import { organizationApiKeys } from '@/lib/db/schema';

const updateApiKeySchema = z.object({
  anthropicApiKey: z.string().min(1, 'API key is required'),
});

/**
 * Validate an Anthropic API key by making a minimal test request
 */
async function validateAnthropicApiKey(
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    if (response.ok) {
      return { valid: true };
    }

    const errorData = (await response.json()) as { error?: { message?: string } };
    const errorMessage = errorData?.error?.message || 'Invalid API key';

    // Check for specific error types
    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key - authentication failed' };
    }
    if (response.status === 403) {
      return { valid: false, error: 'API key does not have permission to access this model' };
    }

    return { valid: false, error: errorMessage };
  } catch (error) {
    console.error('Error validating Anthropic API key:', error);
    return { valid: false, error: 'Failed to validate API key - network error' };
  }
}

/**
 * GET /api/organizations/[orgId]/api-keys
 * Check if organization has a custom API key configured
 */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized('User not authenticated');
    }

    const { orgId } = await params;

    // Check if user is member of the organization
    const isMember = await clerkService.isOrgMember(userId, orgId);
    if (!isMember) {
      return ApiErrorHandler.forbidden('Not a member of this organization');
    }

    // Get the API key record
    const apiKeyRecord = await db.query.organizationApiKeys.findFirst({
      where: eq(organizationApiKeys.orgId, orgId),
    });

    if (!apiKeyRecord?.anthropicApiKey) {
      return NextResponse.json({
        hasCustomKey: false,
        maskedKey: null,
      });
    }

    // Decrypt and mask the key for display
    const decryptedKey = decrypt(apiKeyRecord.anthropicApiKey);
    const maskedKey = maskApiKey(decryptedKey);

    return NextResponse.json({
      hasCustomKey: true,
      maskedKey,
      updatedAt: apiKeyRecord.updatedAt,
    });
  } catch (error) {
    console.error('Error getting organization API key:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * PUT /api/organizations/[orgId]/api-keys
 * Set or update organization's Anthropic API key (admin only)
 */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized('User not authenticated');
    }

    const { orgId } = await params;

    // Check if user is admin
    const isAdmin = await clerkService.isOrgAdmin(userId, orgId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden('Only admins can manage API keys');
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updateApiKeySchema.parse(body);

    // Validate the API key with Anthropic
    const validation = await validateAnthropicApiKey(validatedData.anthropicApiKey);
    if (!validation.valid) {
      return ApiErrorHandler.badRequest(validation.error || 'Invalid API key');
    }

    // Encrypt the API key
    const encryptedKey = encrypt(validatedData.anthropicApiKey);

    // Upsert the API key record
    await db
      .insert(organizationApiKeys)
      .values({
        orgId,
        anthropicApiKey: encryptedKey,
      })
      .onConflictDoUpdate({
        target: organizationApiKeys.orgId,
        set: {
          anthropicApiKey: encryptedKey,
          updatedAt: new Date(),
        },
      });

    // Return masked key
    const maskedKey = maskApiKey(validatedData.anthropicApiKey);

    return NextResponse.json({
      success: true,
      hasCustomKey: true,
      maskedKey,
      message: 'API key saved successfully',
    });
  } catch (error) {
    console.error('Error updating organization API key:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * DELETE /api/organizations/[orgId]/api-keys
 * Remove organization's custom API key (admin only)
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized('User not authenticated');
    }

    const { orgId } = await params;

    // Check if user is admin
    const isAdmin = await clerkService.isOrgAdmin(userId, orgId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden('Only admins can manage API keys');
    }

    // Delete the API key record
    await db.delete(organizationApiKeys).where(eq(organizationApiKeys.orgId, orgId));

    return NextResponse.json({
      success: true,
      hasCustomKey: false,
      message: 'API key removed successfully',
    });
  } catch (error) {
    console.error('Error deleting organization API key:', error);
    return ApiErrorHandler.handle(error);
  }
}
