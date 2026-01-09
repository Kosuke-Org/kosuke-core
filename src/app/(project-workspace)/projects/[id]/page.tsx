'use client';

import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useMemo, useRef, useState } from 'react';

import { LayoutDashboard, LogOut, Settings } from 'lucide-react';

import { OrganizationSwitcherComponent } from '@/components/organization-switcher';
import { ProjectSettingsModal } from '@/components/project-settings-modal';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatSessions } from '@/hooks/use-chat-sessions';
import { useLatestBuild } from '@/hooks/use-latest-build';
import { useProject } from '@/hooks/use-projects';
import { useSubmitBuild } from '@/hooks/use-submit-build';
import { useUser as useUserHook } from '@/hooks/use-user';
import { ORG_ROLES } from '@/lib/types/clerk';
import { cn } from '@/lib/utils';
import { useClerk, useOrganization, useUser } from '@clerk/nextjs';

// Import components
import ChatInterface from './components/chat/chat-interface';
import ChatSidebar from './components/chat/chat-sidebar';
import PreviewPanel from './components/preview/preview-panel';
import { ProjectHeader } from './components/project-header';

interface ProjectPageProps {
  params: Promise<{
    id: string;
  }>;
}

function ProjectLoadingSkeleton() {
  return (
    <div className="flex h-screen w-full">
      {/* Left Panel Skeleton - Chat */}
      <div className="flex flex-col h-full w-full md:w-2/5">
        {/* Chat Header Skeleton */}
        <header className="h-14 flex items-center bg-background">
          <div className="flex items-center h-full w-full relative">
            <div className="px-4 flex items-center">
              <Skeleton className="h-6 w-6 rounded" />
            </div>
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="absolute right-2">
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        </header>

        {/* Chat Content Skeleton */}
        <div className="flex-1 overflow-hidden">
          <div className="flex flex-col h-full w-full">
            <div className="p-4">
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
            <div className="flex-1 p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-12 rounded-full" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-1" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel Skeleton - Preview */}
      <div className="hidden md:flex md:flex-1 h-full flex-col">
        <div className="flex flex-col h-full">
          {/* Preview Header Skeleton */}
          <header className="h-14 flex items-center justify-between bg-background px-4">
            <Skeleton className="h-5 w-32" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </header>

          {/* Preview Content Skeleton - with rounded border */}
          <div className="flex-1 p-8 flex items-center justify-center border rounded-md border-border">
            <div className="text-center space-y-4">
              <Skeleton className="h-12 w-12 rounded-full mx-auto" />
              <Skeleton className="h-4 w-48 mx-auto" />
              <Skeleton className="h-2 w-64 mx-auto" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProjectPage({ params }: ProjectPageProps) {
  // Unwrap promises using React.use()
  const { id: projectId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const sessionFromUrl = searchParams.get('session');
  const showSettings = searchParams.get('show-settings') === 'true';

  const { user } = useUser();
  const { membership } = useOrganization();
  const {
    clerkUser,
    user: dbUser,
    isLoaded,
    isSignedIn,
    imageUrl,
    displayName,
    initials,
  } = useUserHook();
  const { signOut } = useClerk();
  const isAdmin = membership?.role === ORG_ROLES.ADMIN;
  const { data: project, isLoading: isProjectLoading, error: projectError } = useProject(projectId);
  const { data: sessions = [] } = useChatSessions(projectId);

  const mainSession = useMemo(() => sessions.find(session => session.isDefault), [sessions]);
  const activeChatSessionId = useMemo(() => {
    if (!sessions.length) return null;
    // If URL has session param and it exists, use it
    if (sessionFromUrl) {
      const urlSession = sessions.find(session => session.id === sessionFromUrl);
      if (urlSession) return urlSession.id;
    }
    // Fall back to default session or first session
    return mainSession?.id || sessions[0]?.id || null;
  }, [sessions, sessionFromUrl, mainSession?.id]);

  // Build status for submit and chat input
  const { data: latestBuildData } = useLatestBuild(projectId, activeChatSessionId);
  const canSubmit = latestBuildData?.status === 'completed';

  // Submit build functionality (review → commit → PR)
  const submitBuildMutation = useSubmitBuild(projectId, activeChatSessionId);
  const isBuildInProgress =
    latestBuildData?.status === 'pending' ||
    latestBuildData?.status === 'running' ||
    latestBuildData?.status === 'validating';
  const isBuildFailed =
    latestBuildData?.status === 'failed' || latestBuildData?.status === 'cancelled';

  // UI state management
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const toggleChatCollapsed = () => setIsChatCollapsed(prev => !prev);
  const [showSidebar, setShowSidebar] = useState(!sessionFromUrl);

  // When URL changes to include a session, hide sidebar to show chat interface
  useEffect(() => {
    if (sessionFromUrl && showSidebar) {
      setShowSidebar(false);
    }
  }, [sessionFromUrl, showSidebar]);

  // Handle session selection - URL is the source of truth
  const handleSessionSelect = (sessionId: string) => {
    setShowSidebar(false); // Switch to chat interface
    // Update URL - this will trigger re-derivation of activeChatSessionId
    router.push(`/projects/${projectId}?session=${sessionId}`, { scroll: false });
  };

  // Get current session information (derived from activeChatSessionId)
  const currentSession = sessions.find(session => session.id === activeChatSessionId);
  const currentBranch = currentSession?.branchName;
  const sessionId = currentSession?.id;

  // Preview session: use main session (sidebar view) or current session (chat view)
  // No race condition because activeChatSessionId is derived, not synced via useEffect
  const previewSessionId = showSidebar ? mainSession?.id : sessionId;
  const previewBranch = showSidebar ? mainSession?.branchName : currentBranch;

  // Show template preview for new projects
  const isNewProject = (() => {
    if (!project) return false;
    if (sessionFromUrl) return false;
    if (project.isImported) return false;

    const oneMinutesAgo = Date.now() - 60_000;
    // Handle both Date object and string (from persisted cache)
    const createdAtTime = new Date(project.createdAt).getTime();
    return createdAtTime > oneMinutesAgo;
  })();

  // Reference to the ChatInterface component to maintain its state
  const chatInterfaceRef = useRef<HTMLDivElement>(null);

  // Loading state
  if (isProjectLoading || !user) {
    return <ProjectLoadingSkeleton />;
  }

  // Error handling
  if (projectError || !project) {
    notFound();
  }

  const toggleSidebar = () => {
    if (!showSidebar) {
      // Going back to sidebar - update URL to main project page
      router.push(`/projects/${projectId}`, { scroll: false });
    }
    setShowSidebar(!showSidebar);
  };

  // Handle project settings modal via URL query params
  const handleSettingsClick = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('show-settings', 'true');
    router.push(`/projects/${projectId}?${params.toString()}`, { scroll: false });
  };

  const handleSettingsModalChange = (open: boolean) => {
    if (!open) {
      // Remove show-settings from URL when closing
      const params = new URLSearchParams(searchParams.toString());
      params.delete('show-settings');
      const newUrl = params.toString()
        ? `/projects/${projectId}?${params.toString()}`
        : `/projects/${projectId}`;
      router.push(newUrl, { scroll: false });
    }
  };

  const handleProjectDeleted = () => {
    router.push('/projects');
  };

  // Handle submitting build for review, commit, and PR creation
  const handleSubmitBuild = () => {
    if (!latestBuildData?.buildJobId) {
      console.error('No build job available for submission');
      return;
    }

    submitBuildMutation.mutate({
      buildJobId: latestBuildData.buildJobId,
      userEmail: dbUser?.email,
    });
  };

  const handleLogout = async () => {
    try {
      await signOut({ redirectUrl: '/sign-in' });
    } catch (error) {
      console.error('Error signing out:', error);
      router.push('/sign-in');
      router.refresh();
    }
  };

  // Render user menu
  const renderUserSection = () => {
    if (!isLoaded) {
      return <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />;
    }

    if (isSignedIn && clerkUser) {
      return (
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-md p-0">
              <Avatar className="h-8 w-8 cursor-pointer transition-all">
                {imageUrl && <AvatarImage src={imageUrl} alt={displayName || 'User'} />}
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 mt-1">
            <div className="flex items-center justify-start gap-2 p-2">
              <div className="flex flex-col space-y-0.5">
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{dbUser?.email}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <OrganizationSwitcherComponent onClose={() => setDropdownOpen(false)} />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/projects')} className="cursor-pointer">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Projects</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings')} className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col h-screen w-full">
      <ProjectHeader
        project={project}
        showBackButton={!showSidebar}
        onBackClick={toggleSidebar}
        onSettingsClick={handleSettingsClick}
      >
        {renderUserSection()}
      </ProjectHeader>

      <ProjectSettingsModal
        project={project}
        open={showSettings}
        onOpenChange={handleSettingsModalChange}
        onProjectDeleted={handleProjectDeleted}
        isAdmin={isAdmin}
      />

      <ResizablePanelGroup direction="horizontal" className="flex-1 w-full">
        {/* Chat Panel */}
        <ResizablePanel
          defaultSize={40}
          minSize={25}
          maxSize={60}
          className={cn(isChatCollapsed && 'hidden')}
          style={{
            display: isChatCollapsed ? 'none' : undefined,
          }}
        >
          <div className="flex flex-col h-full">
            {/* Chat Content */}
            <div ref={chatInterfaceRef} className="flex-1 overflow-hidden flex">
              <div className="relative flex h-full w-full rounded-md">
                {showSidebar ? (
                  <div className="w-full h-full">
                    <ChatSidebar
                      projectId={projectId}
                      activeChatSessionId={activeChatSessionId}
                      onChatSessionChange={handleSessionSelect}
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col">
                    <ChatInterface
                      projectId={projectId}
                      activeChatSessionId={activeChatSessionId}
                      sessionId={sessionId}
                      model={project?.model}
                      isBuildInProgress={isBuildInProgress}
                      isBuildFailed={isBuildFailed}
                      hasPullRequest={Boolean(latestBuildData?.pullRequestUrl)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </ResizablePanel>

        {/* Resize Handle - completely invisible but draggable via padding */}
        {!isChatCollapsed && (
          <ResizableHandle className="hidden md:flex w-px! bg-transparent! border-none! after:bg-transparent! before:bg-transparent! px-1" />
        )}

        {/* Preview Panel */}
        <ResizablePanel
          defaultSize={isChatCollapsed ? 100 : 60}
          minSize={40}
          className={cn('h-full flex-col overflow-hidden', !isChatCollapsed && 'hidden md:flex')}
        >
          <div className="flex flex-col h-full">
            {/* Preview Content - with rounded border */}
            <div className="flex-1 overflow-hidden border rounded-md border-border">
              <PreviewPanel
                projectId={projectId}
                projectName={project.name}
                sessionId={previewSessionId ?? ''}
                branch={previewBranch}
                isNewProject={isNewProject}
                isSidebarCollapsed={isChatCollapsed}
                onToggleSidebar={toggleChatCollapsed}
                showSubmit={!showSidebar && Boolean(activeChatSessionId)}
                onSubmit={handleSubmitBuild}
                canSubmit={canSubmit}
                submitStatus={latestBuildData?.submitStatus}
                pullRequestUrl={latestBuildData?.pullRequestUrl}
                isSubmitting={submitBuildMutation.isPending}
                hasSubmitted={submitBuildMutation.isSuccess}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
