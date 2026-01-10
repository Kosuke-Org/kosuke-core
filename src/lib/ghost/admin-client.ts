import 'server-only';

import GhostAdminAPI from '@tryghost/admin-api';

import type { GhostMemberPayload, GhostMemberResponse } from '@/lib/types/ghost';

/**
 * Ghost Admin API Client
 * Used for member management (adding new signups to Ghost)
 */

// Lazy initialization of Ghost Admin API client
let ghostAdminClient: InstanceType<typeof GhostAdminAPI> | null = null;

/**
 * Get or create the Ghost Admin API client
 * Lazily initialized to avoid errors during build time
 * Returns null if credentials are missing
 */
function getGhostAdminClient(): InstanceType<typeof GhostAdminAPI> | null {
  const ghostUrl = process.env.NEXT_PUBLIC_GHOST_URL;
  const adminKey = process.env.GHOST_ADMIN_API_KEY;

  if (!ghostUrl || !adminKey) {
    return null;
  }

  if (!ghostAdminClient) {
    ghostAdminClient = new GhostAdminAPI({
      url: ghostUrl,
      key: adminKey,
      version: 'v5.0',
    });
  }

  return ghostAdminClient;
}

/**
 * Add a new member to Ghost CMS
 * Used when a new user signs up to Kosuke
 *
 * @param email - User's email address
 * @param name - Optional user name
 * @returns Result object with success status
 */
export async function addGhostMember(email: string, name?: string): Promise<GhostMemberResponse> {
  const client = getGhostAdminClient();

  if (!client) {
    console.warn('[Ghost] Admin API not configured, skipping member creation');
    return {
      success: false,
      unavailable: true,
      message: 'Ghost Admin API not configured',
    };
  }

  try {
    const memberPayload: GhostMemberPayload = {
      email,
      name: name || undefined,
      labels: [{ name: 'kosuke-core-signup' }],
      subscribed: true,
      newsletters: [],
    };

    await client.members.add(memberPayload as unknown as Parameters<typeof client.members.add>[0]);

    console.log(`[Ghost] Member added: ${email}`);
    return {
      success: true,
      message: 'Member added to Ghost',
    };
  } catch (error: unknown) {
    // Handle duplicate email gracefully (treat as success)
    if (error && typeof error === 'object' && 'type' in error) {
      const ghostError = error as { type?: string; message?: string };
      if (ghostError.type === 'ValidationError' && ghostError.message?.includes('already exists')) {
        console.log(`[Ghost] Member already exists: ${email}`);
        return {
          success: true,
          alreadyExists: true,
          message: 'Member already exists in Ghost',
        };
      }
    }

    console.warn('[Ghost] Failed to add member:', error);
    return {
      success: false,
      message: 'Failed to add member to Ghost',
    };
  }
}
