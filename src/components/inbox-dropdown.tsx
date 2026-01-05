'use client';

import { formatDistanceToNow } from 'date-fns';
import { CheckCheck, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNotifications, useUnreadCounts } from '@/hooks/use-notifications';
import { useProductUpdates } from '@/hooks/use-product-updates';
import type { Notification, ProductUpdateWithReadStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

interface InboxDropdownProps {
  onClose: () => void;
}

function NotificationItem({
  notification,
  onClose,
  onMarkRead,
}: {
  notification: Notification;
  onClose: () => void;
  onMarkRead: (id: string) => void;
}) {
  const handleClick = () => {
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }
    if (notification.linkUrl) {
      onClose();
    }
  };

  const content = (
    <div
      className={cn(
        'flex gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer',
        !notification.isRead && 'bg-muted/30'
      )}
      onClick={handleClick}
    >
      <div className="flex-shrink-0 mt-1">
        {!notification.isRead && <div className="h-2 w-2 rounded-full bg-destructive" />}
        {notification.isRead && <div className="h-2 w-2" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{notification.title}</p>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{notification.message}</p>
        <p className="text-xs text-muted-foreground mt-1.5">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </p>
      </div>
      {notification.linkUrl && (
        <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
      )}
    </div>
  );

  if (notification.linkUrl) {
    return (
      <Link href={notification.linkUrl} onClick={handleClick}>
        {content}
      </Link>
    );
  }

  return content;
}

function ProductUpdateItem({
  update,
  onClose,
  onMarkRead,
}: {
  update: ProductUpdateWithReadStatus;
  onClose: () => void;
  onMarkRead: (id: string) => void;
}) {
  const handleClick = () => {
    if (!update.isRead) {
      onMarkRead(update.id);
    }
    if (update.linkUrl) {
      onClose();
    }
  };

  const content = (
    <div
      className={cn(
        'p-3 hover:bg-muted/50 transition-colors cursor-pointer',
        !update.isRead && 'bg-muted/30'
      )}
      onClick={handleClick}
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0 mt-1">
          {!update.isRead && <div className="h-2 w-2 rounded-full bg-destructive" />}
          {update.isRead && <div className="h-2 w-2" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{update.title}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{update.description}</p>
        </div>
      </div>
      {update.imageUrl && (
        <div className="mt-3 ml-5 relative aspect-[16/9] w-full max-w-[300px] rounded-lg overflow-hidden">
          <Image src={update.imageUrl} alt={update.title} fill className="object-cover" />
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-2 ml-5">
        {formatDistanceToNow(new Date(update.publishedAt), { addSuffix: true })}
      </p>
    </div>
  );

  if (update.linkUrl) {
    return (
      <Link href={update.linkUrl} target="_blank" rel="noopener noreferrer" onClick={handleClick}>
        {content}
      </Link>
    );
  }

  return content;
}

function NotificationsSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-3 p-3">
          <Skeleton className="h-2 w-2 rounded-full mt-2" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[350px] px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/70 mt-1">{description}</p>
    </div>
  );
}

export function InboxDropdown({ onClose }: InboxDropdownProps) {
  const { counts } = useUnreadCounts();
  const {
    notifications,
    isLoading: isLoadingNotifications,
    markAsRead: markNotificationRead,
    markAllAsRead,
    isMarkingAllRead,
  } = useNotifications();
  const { updates, isLoading: isLoadingUpdates, markAsRead: markUpdateRead } = useProductUpdates();

  const hasUnreadNotifications = counts.notifications > 0;

  return (
    <Tabs defaultValue="inbox" className="w-full">
      <div className="px-2 pt-2">
        <TabsList className="w-full">
          <TabsTrigger value="inbox" className="flex-1 justify-center">
            Inbox
            {counts.notifications > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">({counts.notifications})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="updates" className="flex-1 justify-center">
            What&apos;s new
            {counts.productUpdates > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({counts.productUpdates})
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="inbox" className="mt-0">
        <ScrollArea className="h-[350px]">
          {isLoadingNotifications ? (
            <NotificationsSkeleton />
          ) : notifications.length === 0 ? (
            <EmptyState title="No notifications" description="You're all caught up!" />
          ) : (
            <div className="divide-y">
              {notifications.map(notification => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onClose={onClose}
                  onMarkRead={id => markNotificationRead([id])}
                />
              ))}
            </div>
          )}
        </ScrollArea>
        {hasUnreadNotifications && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => markAllAsRead()}
              disabled={isMarkingAllRead}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              Mark all as read
            </Button>
          </div>
        )}
      </TabsContent>

      <TabsContent value="updates" className="mt-0">
        <ScrollArea className="h-[350px]">
          {isLoadingUpdates ? (
            <NotificationsSkeleton />
          ) : updates.length === 0 ? (
            <EmptyState title="No updates yet" description="Check back soon for product updates!" />
          ) : (
            <div className="divide-y">
              {updates.map(update => (
                <ProductUpdateItem
                  key={update.id}
                  update={update}
                  onClose={onClose}
                  onMarkRead={markUpdateRead}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
