// Re-export base types from schema (only types that are actually used)
export type { Notification, ProductUpdate } from '@/lib/db/schema';

// Unread counts for the inbox badge
export interface UnreadCounts {
  notifications: number;
  productUpdates: number;
  total: number;
}

// Product update with read status for the current user
export interface ProductUpdateWithReadStatus {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  linkUrl: string | null;
  publishedAt: Date;
  createdAt: Date;
  isRead: boolean;
}

// Notification settings update payload
export interface UpdateNotificationSettingsPayload {
  emailNotifications?: boolean;
  projectUpdates?: boolean;
  productUpdates?: boolean;
}
