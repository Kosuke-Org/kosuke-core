'use client';

import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useRef, useState } from 'react';

import { LayoutDashboard, LogOut, Settings } from 'lucide-react';

import { NavbarInbox } from '@/components/navbar-inbox';
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
import { useConfirmEnvironment } from '@/hooks/use-confirm-environment';
import { useConfirmRequirements } from '@/hooks/use-confirm-requirements';
import { useLatestBuild } from '@/hooks/use-latest-build';
import { useProject } from '@/hooks/use-projects';
import { useRequirementsDocs } from '@/hooks/use-requirements-docs';
import { useSubmitBuild } from '@/hooks/use-submit-build';
import { useUser as useUserHook } from '@/hooks/use-user';
import type { RequirementsViewMode } from '@/lib/types';
import { ORG_ROLES } from '@/lib/types/clerk';
import { cn } from '@/lib/utils';
import { useClerk, useOrganization, useUser } from '@clerk/nextjs';

// Import components
import ChatInterface, { ChatInterfaceSkeleton } from './components/chat/chat-interface';
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
          </div>
        </header>

        {/* Chat Content Skeleton - uses ChatInterfaceSkeleton */}
        <div className="flex-1 overflow-hidden">
          <ChatInterfaceSkeleton />
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

  // Requirements-specific hooks - must be called before early returns
  // Poll every 5s while in 'requirements' status to sync preview with sandbox updates
  const { data: requirementsContent } = useRequirementsDocs(projectId, {
    projectStatus: project?.status as
      | 'requirements'
      | 'requirements_ready'
      | 'environments_ready'
      | 'waiting_for_payment'
      | 'paid'
      | 'in_development'
      | 'active'
      | undefined,
  });
  const confirmRequirementsMutation = useConfirmRequirements(projectId);
  const confirmEnvironmentMutation = useConfirmEnvironment(projectId);
  const [viewMode, setViewMode] = useState<RequirementsViewMode>('game');

  // Loading state
  if (isProjectLoading || !user) {
    return <ProjectLoadingSkeleton />;
  }

  // Error handling
  if (projectError || !project) {
    notFound();
  }

  // Requirements gathering mode - determine if in requirements flow (B2C statuses)
  const isRequirementsMode =
    project.status === 'requirements' ||
    project.status === 'requirements_ready' ||
    project.status === 'environments_ready' ||
    project.status === 'waiting_for_payment' ||
    project.status === 'paid' ||
    project.status === 'in_development';

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
        <>
          <NavbarInbox />
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
        </>
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
                {isRequirementsMode ? (
                  /* Requirements mode: just show chat, no sidebar */
                  <div className="w-full h-full flex flex-col">
                    <ChatInterface
                      projectId={projectId}
                      mode="requirements"
                      model={project?.model}
                      projectStatus={
                        project.status as
                          | 'requirements'
                          | 'requirements_ready'
                          | 'in_development'
                          | 'active'
                      }
                    />
                  </div>
                ) : showSidebar ? (
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
                      mode="development"
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
                showSubmit={!showSidebar && Boolean(activeChatSessionId) && !isRequirementsMode}
                onSubmit={handleSubmitBuild}
                canSubmit={canSubmit}
                submitStatus={latestBuildData?.submitStatus}
                prUrl={latestBuildData?.prUrl}
                isSubmitting={submitBuildMutation.isPending}
                hasSubmitted={submitBuildMutation.isSuccess}
                // Requirements mode props
                projectStatus={
                  project.status as
                    | 'requirements'
                    | 'requirements_ready'
                    | 'environments_ready'
                    | 'waiting_for_payment'
                    | 'paid'
                    | 'in_development'
                    | 'active'
                }
                stripeInvoiceUrl={project.stripeInvoiceUrl}
                requirementsContent={requirementsContent}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                // Confirm requirements props (for RequirementsPreview)
                onConfirmRequirements={() => confirmRequirementsMutation.mutate()}
                canConfirmRequirements={
                  project.status === 'requirements' && !confirmRequirementsMutation.isPending
                }
                isConfirmingRequirements={confirmRequirementsMutation.isPending}
                // Confirm environment props (for EnvironmentsPreview)
                onConfirmEnvironment={() => confirmEnvironmentMutation.mutate()}
                isConfirmingEnvironment={confirmEnvironmentMutation.isPending}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
