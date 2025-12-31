'use client';

import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useRef, useState } from 'react';

import { ArrowLeft, LayoutDashboard, LogOut, Settings } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { OrganizationSwitcherComponent } from '@/components/organization-switcher';
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
import { cn } from '@/lib/utils';
import { useClerk, useUser } from '@clerk/nextjs';

// Import components
import ChatInterface from './components/chat/chat-interface';
import ChatSidebar from './components/chat/chat-sidebar';
import PreviewPanel from './components/preview/preview-panel';

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

  const { user } = useUser();
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
  const { data: project, isLoading: isProjectLoading, error: projectError } = useProject(projectId);
  const { data: sessions = [] } = useChatSessions(projectId);

  // Chat session state management - declare activeChatSessionId first
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);

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

  // Auto-select session based on URL or default session when sessions are loaded
  useEffect(() => {
    if (sessions.length > 0 && activeChatSessionId === null) {
      let sessionToSelect = null;

      if (sessionFromUrl) {
        // Try to find session from URL
        sessionToSelect = sessions.find(session => session.id === sessionFromUrl);
        if (sessionToSelect) {
          setShowSidebar(false); // Show chat interface when coming from URL
        }
      }

      if (!sessionToSelect) {
        // Fall back to default session or first session
        sessionToSelect = sessions.find(session => session.isDefault) || sessions[0];
      }

      if (sessionToSelect) {
        setActiveChatSessionId(sessionToSelect.id);
      }
    }
  }, [sessions, activeChatSessionId, sessionFromUrl]);

  // Handle session selection and URL updates
  const handleSessionSelect = (sessionId: string) => {
    setActiveChatSessionId(sessionId);
    setShowSidebar(false); // Switch to chat interface
    // Update URL to reflect selected session using query params
    router.push(`/projects/${projectId}?session=${sessionId}`, { scroll: false });
  };

  // Get current session information
  const currentSession = sessions.find(session => session.id === activeChatSessionId);
  const mainSession = sessions.find(session => session.isDefault);
  const currentBranch = currentSession?.branchName;
  const sessionId = currentSession?.id;

  // Preview uses current session when in chat view, or main session when in sidebar view
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

  // Handle submitting build for review, commit, and PR creation
  const handleSubmitBuild = () => {
    if (!latestBuildData?.buildJobId) {
      console.error('No build job available for submission');
      return;
    }

    submitBuildMutation.mutate(latestBuildData.buildJobId);
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
    <div className="flex h-screen w-full">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        {/* Chat Panel - Header + Content */}
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
            {/* Chat Header */}
            <header className="h-14 flex items-center bg-background">
              <div className="flex items-center h-full w-full relative">
                <div className="px-4 flex items-center">
                  <Link href="/" className="flex items-center">
                    <Image
                      src="/logo-dark.svg"
                      alt="Kosuke"
                      width={24}
                      height={24}
                      className="block dark:hidden"
                      priority
                    />
                    <Image
                      src="/logo.svg"
                      alt="Kosuke"
                      width={24}
                      height={24}
                      className="hidden dark:block"
                      priority
                    />
                  </Link>
                </div>

                {/* Back to Sessions button - only show when in chat interface */}
                {!showSidebar && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleSidebar}
                    aria-label="Back to Sessions"
                    title="Back to Sessions"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </header>

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
                      hasPullRequest={Boolean(latestBuildData?.prUrl)}
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

        {/* Preview Panel - Header + Content */}
        <ResizablePanel
          defaultSize={isChatCollapsed ? 100 : 60}
          minSize={40}
          className={cn('h-full flex-col overflow-hidden', !isChatCollapsed && 'hidden md:flex')}
        >
          <div className="flex flex-col h-full">
            {/* Preview Header */}
            <header className="h-14 flex items-center justify-between bg-background px-4">
              <div className="flex items-center gap-4">
                {/* Logo - show when sidebar is collapsed */}
                {isChatCollapsed && (
                  <Link href="/" className="flex items-center">
                    <Image
                      src="/logo-dark.svg"
                      alt="Kosuke"
                      width={24}
                      height={24}
                      className="block dark:hidden"
                      priority
                    />
                    <Image
                      src="/logo.svg"
                      alt="Kosuke"
                      width={24}
                      height={24}
                      className="hidden dark:block"
                      priority
                    />
                  </Link>
                )}
                <h2 className="text-sm font-medium truncate max-w-[200px]">
                  {project?.name || 'Loading Project...'}
                </h2>
              </div>

              <div className="flex items-center gap-2">{renderUserSection()}</div>
            </header>

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
                prUrl={latestBuildData?.prUrl}
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
