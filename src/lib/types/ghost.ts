/**
 * Ghost CMS Types
 * Types for interacting with Ghost Content API
 * Used for legal pages (terms, privacy, cookies)
 */

// Ghost Page type for legal pages
export interface GhostPage {
  id: string;
  uuid: string;
  title: string;
  slug: string;
  html: string;
  feature_image: string | null;
  featured: boolean;
  created_at: string;
  updated_at: string;
  published_at: string;
  excerpt: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  og_image?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  twitter_image?: string | null;
  twitter_title?: string | null;
  twitter_description?: string | null;
  custom_excerpt?: string | null;
}
