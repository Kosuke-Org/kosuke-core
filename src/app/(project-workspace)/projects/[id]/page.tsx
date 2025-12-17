'use client';

import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useRef, useState } from 'react';

import Navbar from '@/components/navbar';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatSessions } from '@/hooks/use-chat-sessions';
import { useCreatePullRequest } from '@/hooks/use-project-settings';
import { useProjectUIState } from '@/hooks/use-project-ui-state';
import { useProject } from '@/hooks/use-projects';
import { cn } from '@/lib/utils';
import { useUser } from '@clerk/nextjs';

// Import components
import BrandGuidelines from './components/brand/brand-guidelines';
import ChatInterface from './components/chat/chat-interface';
import ChatSidebar from './components/chat/chat-sidebar';
import { DatabaseTab } from './components/database/database-tab';
import CodeExplorer from './components/preview/code-explorer';
import PreviewPanel from './components/preview/preview-panel';
import { SettingsTab } from './components/settings/settings-tab';

interface ProjectPageProps {
  params: Promise<{
    id: string;
  }>;
}

function ProjectLoadingSkeleton() {
  return (
    <div className="flex flex-col h-screen w-full">
      {/* Navbar Skeleton */}
      <div className="w-full">
        <header className="w-full h-14 flex items-center bg-background">
          <div className="flex w-full h-full">
            {/* Left section - matches chat width */}
            <div className="flex items-center h-full w-full md:w-2/5 lg:w-2/5 border-r border-transparent relative">
              <div className="px-4 flex items-center">
                <Skeleton className="h-6 w-6 rounded-full" />
              </div>

              {/* Sidebar/Chat toggle button skeleton */}
              <Skeleton className="h-8 w-8 rounded-md" />

              {/* Collapse toggle button skeleton */}
              <div className="absolute right-0 mr-2">
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>

            {/* Right section - project title and controls */}
            <div className="flex-1 flex items-center justify-between">
              <Skeleton className="h-5 w-32 ml-4" />

              <div className="flex items-center gap-2 mx-auto">
                <div className="flex border border-input rounded-md overflow-hidden">
                  <Skeleton className="h-8 w-20 rounded-none" />
                  <Skeleton className="h-8 w-16 rounded-none" />
                  <Skeleton className="h-8 w-20 rounded-none" />
                  <Skeleton className="h-8 w-20 rounded-none" />
                </div>
              </div>

              <div className="flex items-center gap-2 px-4">
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          </div>
        </header>
      </div>

      {/* Content Skeleton */}
      <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden">
        {/* Left Panel Skeleton - Chat Sidebar */}
        <div className="h-full overflow-hidden w-full md:w-2/5 lg:w-2/5">
          <div className="relative flex h-full w-full rounded-md">
            <div className="flex flex-col h-full w-full">
              {/* New Chat Button Skeleton */}
              <div className="p-4">
                <Skeleton className="h-9 w-full rounded-md" />
              </div>

              {/* Chat Sessions List Skeleton */}
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

        {/* Right Panel Skeleton - Preview/Code Explorer */}
        <div className="hidden md:flex md:w-3/5 lg:w-3/5 h-full flex-col overflow-hidden border border-border rounded-md">
          <div className="flex items-center justify-between p-4 border-b">
            <Skeleton className="h-6 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
          <div className="flex-1 p-8 flex items-center justify-center">
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
  const { data: project, isLoading: isProjectLoading, error: projectError } = useProject(projectId);
  const { data: sessions = [] } = useChatSessions(projectId);

  // Pull request functionality
  const createPullRequestMutation = useCreatePullRequest(projectId);

  // UI state management
  const { currentView, setCurrentView, isChatCollapsed, toggleChatCollapsed } =
    useProjectUIState(project);

  // Chat session state management
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(!sessionFromUrl); // Show sidebar unless we have a session in URL

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

  // Handlers
  const handleRefresh = () => {
    // Refresh could trigger a page reload or refetch project data
    window.location.reload();
  };

  const toggleSidebar = () => {
    if (!showSidebar) {
      // Going back to sidebar - update URL to main project page
      router.push(`/projects/${projectId}`, { scroll: false });
    }
    setShowSidebar(!showSidebar);
  };

  // Handle creating pull request from active chat session
  const handleCreatePullRequest = () => {
    if (!activeChatSessionId || !currentSession?.id) {
      console.error('No active chat session for pull request creation');
      return;
    }

    createPullRequestMutation.mutate({
      sessionId: currentSession.id,
      data: {
        title: currentSession.title,
        description: `Automated changes from Kosuke chat session: ${currentSession.title}\n\nBranch: ${currentSession.branchName}`,
      },
    });
  };

  return (
    <div className="flex flex-col h-screen w-full">
      <Navbar
        variant="project"
        projectProps={{
          projectName: project?.name || 'Loading Project...',
          currentView: currentView,
          onViewChange: setCurrentView,
          onRefresh: handleRefresh,
          isChatCollapsed: isChatCollapsed,
          onToggleChat: toggleChatCollapsed,
          showSidebar: showSidebar,
          onToggleSidebar: toggleSidebar,
          activeChatSessionId: !showSidebar ? activeChatSessionId : null,
          onCreatePullRequest: handleCreatePullRequest,
        }}
      />
      <div className={cn('flex h-[calc(100vh-3.5rem)] w-full overflow-hidden')}>
        <div
          ref={chatInterfaceRef}
          className={cn(
            'h-full overflow-hidden',
            // Balanced width for chat area - more than original but not too much
            isChatCollapsed ? 'w-0 opacity-0' : 'w-full sm:w-2/5 md:w-2/5 lg:w-2/5'
          )}
          style={{
            // Use visibility instead of conditional rendering
            visibility: isChatCollapsed ? 'hidden' : 'visible',
            // Use display to properly hide when collapsed
            display: isChatCollapsed ? 'none' : 'flex',
          }}
        >
          {/* Chat area with toggle between sidebar and interface */}
          <div className="relative flex h-full w-full rounded-md">
            {showSidebar ? (
              /* Chat Sidebar - Full Width */
              <div className="w-full">
                <ChatSidebar
                  projectId={projectId}
                  activeChatSessionId={activeChatSessionId}
                  onChatSessionChange={handleSessionSelect}
                />
              </div>
            ) : (
              /* Chat Interface - Full Width */
              <div className="w-full flex flex-col">
                <ChatInterface
                  projectId={projectId}
                  activeChatSessionId={activeChatSessionId}
                  currentBranch={currentBranch}
                  sessionId={sessionId}
                  model={project?.model}
                />
              </div>
            )}
          </div>
        </div>

        <div
          className={cn(
            'h-full flex-col overflow-hidden border rounded-md border-border',
            // Balanced width for preview panel - maintains good visibility
            isChatCollapsed ? 'w-full' : 'hidden md:flex sm:w-3/5 md:w-3/5 lg:w-3/5'
          )}
        >
          {currentView === 'preview' ? (
            <PreviewPanel
              projectId={projectId}
              projectName={project.name}
              sessionId={previewSessionId ?? ''}
              branch={previewBranch}
              isNewProject={isNewProject}
            />
          ) : currentView === 'code' ? (
            <CodeExplorer projectId={projectId} />
          ) : currentView === 'branding' ? (
            <BrandGuidelines projectId={projectId} sessionId={previewSessionId ?? ''} />
          ) : currentView === 'settings' ? (
            <SettingsTab projectId={projectId} />
          ) : currentView === 'database' ? (
            <DatabaseTab projectId={projectId} sessionId={previewSessionId ?? ''} />
          ) : (
            <BrandGuidelines projectId={projectId} sessionId={previewSessionId ?? ''} />
          )}
        </div>
      </div>
    </div>
  );
}
