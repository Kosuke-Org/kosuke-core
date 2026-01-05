'use client';

import { Bell } from 'lucide-react';
import { useState } from 'react';

import { InboxDropdown } from '@/components/inbox-dropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUnreadCounts } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';

export function NavbarInbox() {
  const [open, setOpen] = useState(false);
  const { counts, isLoading } = useUnreadCounts();

  const unreadCount = counts.total;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative h-9 w-9', open && 'bg-accent text-accent-foreground')}
          aria-label={`Inbox${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        >
          <Bell className="h-5 w-5" />
          {!isLoading && unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 text-xs font-medium flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="end" sideOffset={8}>
        <InboxDropdown onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
