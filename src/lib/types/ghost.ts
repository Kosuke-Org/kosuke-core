/**
 * Ghost CMS Types
 * Types for Ghost Content API (pages) and Admin API (members)
 */

// =============================================================================
// Content API Types (for legal pages)
// =============================================================================

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

// =============================================================================
// Admin API Types (for member management)
// =============================================================================

// Payload for creating a Ghost member
export interface GhostMemberPayload {
  email: string;
  name?: string;
  labels?: Array<{ name: string }>;
  subscribed?: boolean;
  newsletters?: Array<{ id?: string }>;
}

// Response from Ghost member operations
export interface GhostMemberResponse {
  success: boolean;
  message: string;
  alreadyExists?: boolean;
  unavailable?: boolean;
}
