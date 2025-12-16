import 'server-only';
import { auth } from '@clerk/nextjs/server';

/**
 * Super Admin Permissions
 * This module handles super admin access control for the application
 *
 * Configuration:
 * Set SUPER_ADMIN_EMAILS environment variable with comma-separated email addresses
 * Example: SUPER_ADMIN_EMAILS=admin@kosuke.ai,admin2@kosuke.ai
 */

/**
 * Get list of super admin emails from environment
 */
function getSuperAdminEmails(): Set<string> {
  const emails = process.env.SUPER_ADMIN_EMAILS || '';
  return new Set(
    emails
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Check if a user is a super admin by userId
 * @param userId - Clerk user ID
 * @returns Promise<boolean>
 */
export async function isSuperAdminByUserId(userId: string): Promise<boolean> {
  try {
    if (!userId) return false;

    // Get user's email from Clerk
    const { createClerkClient } = await import('@clerk/nextjs/server');
    const clerkClient = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    const user = await clerkClient.users.getUser(userId);

    if (!user.primaryEmailAddress?.emailAddress) {
      return false;
    }

    const userEmail = user.primaryEmailAddress.emailAddress.toLowerCase();
    const superAdminEmails = getSuperAdminEmails();

    return superAdminEmails.has(userEmail);
  } catch (error) {
    console.error('Error checking super admin status:', error);
    return false;
  }
}

/**
 * Check if the current user is a super admin
 * Use this in API routes and server components (NOT in middleware)
 * @returns Promise<boolean>
 */
async function isSuperAdmin(): Promise<boolean> {
  try {
    const { userId } = await auth();
    if (!userId) return false;

    return isSuperAdminByUserId(userId);
  } catch (error) {
    console.error('Error checking super admin status:', error);
    return false;
  }
}

/**
 * Require super admin access or throw error
 * Use this in API routes that require super admin access
 */
export async function requireSuperAdmin(): Promise<void> {
  const isAdmin = await isSuperAdmin();

  if (!isAdmin) {
    throw new Error('Super admin access required');
  }
}
