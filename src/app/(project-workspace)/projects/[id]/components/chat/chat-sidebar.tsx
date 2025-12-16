'use client';

import { Filter, Plus } from 'lucide-react';

import { useChatSidebar } from '@/hooks/use-chat-sidebar';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';

import type { ChatSessionStatus } from '@/lib/types/chat-sessions';
import { cn } from '@/lib/utils';
import { ChatSessionItem } from './chat-session-item';
import { NewChatDialog } from './new-chat-dialog';
import { RenameSessionDialog } from './rename-session-dialog';

interface ChatSidebarProps {
  projectId: string;
  activeChatSessionId: string | null;
  onChatSessionChange: (sessionId: string) => void;
  className?: string;
}

const STATUS_OPTIONS: { value: ChatSessionStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'completed', label: 'Completed' },
];

export default function ChatSidebar({
  projectId,
  activeChatSessionId,
  onChatSessionChange,
  className,
}: ChatSidebarProps) {
  const {
    // State
    filteredSessions,
    statusFilter,
    isNewChatModalOpen,
    editingSession,
    newChatTitle,

    // Actions
    setIsNewChatModalOpen,
    setEditingSession,
    setNewChatTitle,
    setStatusFilter,
    handleCreateChat,
    handleUpdateSession,
    handleDeleteSession,
    handleDuplicateSession,
    handleViewGitHubBranch,

    // Loading states
    isCreating,
  } = useChatSidebar({
    projectId,
    onChatSessionChange,
  });

  const handleStatusToggle = (status: ChatSessionStatus) => {
    if (statusFilter.includes(status)) {
      // Don't allow removing the last filter
      if (statusFilter.length > 1) {
        setStatusFilter(statusFilter.filter(s => s !== status));
      }
    } else {
      setStatusFilter([...statusFilter, status]);
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with New Chat button and Filter */}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsNewChatModalOpen(true)} className="flex-1" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>

          {/* Status Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={cn('h-8 w-8', statusFilter.length < 3 && 'text-primary')}
              >
                <Filter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {STATUS_OPTIONS.map(option => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={statusFilter.includes(option.value)}
                  onCheckedChange={() => handleStatusToggle(option.value)}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Chat Sessions List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {filteredSessions.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              No sessions match the selected filters
            </div>
          ) : (
            filteredSessions.map(session => (
              <ChatSessionItem
                key={session.id}
                session={session}
                isActive={activeChatSessionId === session.id}
                onClick={() => onChatSessionChange(session.id)}
                onRename={setEditingSession}
                onDuplicate={handleDuplicateSession}
                onViewBranch={handleViewGitHubBranch}
                onToggleArchive={s =>
                  handleUpdateSession(s, {
                    status: s.status === 'archived' ? 'active' : 'archived',
                  })
                }
                onDelete={handleDeleteSession}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <NewChatDialog
        open={isNewChatModalOpen}
        onOpenChange={setIsNewChatModalOpen}
        title={newChatTitle}
        setTitle={setNewChatTitle}
        isCreating={isCreating}
        onCreate={handleCreateChat}
      />

      <RenameSessionDialog
        session={editingSession}
        onOpenChange={open => !open && setEditingSession(null)}
        onRename={(session, title) => handleUpdateSession(session, { title })}
      />
    </div>
  );
}
