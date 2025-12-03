import GhostContentAPI from '@tryghost/content-api';

import type { GhostPage } from '@/lib/types/ghost';

// Lazy initialization of Ghost Content API client
let ghostClient: InstanceType<typeof GhostContentAPI> | null = null;

/**
 * Get or create the Ghost Content API client
 * This is lazily initialized to avoid errors during build time
 * Returns null if credentials are missing (allows build to succeed)
 */
function getGhostClient(): InstanceType<typeof GhostContentAPI> | null {
  // Return null if credentials are missing (e.g., during CI build)
  if (!process.env.NEXT_PUBLIC_GHOST_URL || !process.env.NEXT_PUBLIC_GHOST_CONTENT_API_KEY) {
    return null;
  }

  if (!ghostClient) {
    ghostClient = new GhostContentAPI({
      url: process.env.NEXT_PUBLIC_GHOST_URL,
      key: process.env.NEXT_PUBLIC_GHOST_CONTENT_API_KEY,
      version: 'v5.0',
    });
  }

  return ghostClient;
}

/**
 * Fetch a page by ID
 * Used for legal pages (terms, privacy, cookies)
 */
export async function getPageById(id: string): Promise<GhostPage | null> {
  try {
    const client = getGhostClient();
    if (!client) return null;

    const page = (await client.pages.read({ id })) as GhostPage;
    return page;
  } catch (error) {
    console.error(`Error fetching page ${id}:`, error);
    return null;
  }
}
