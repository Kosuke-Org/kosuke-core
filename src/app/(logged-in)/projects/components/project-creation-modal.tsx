'use client';

import { useUser } from '@clerk/nextjs';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FolderPlus,
  Github,
  Info,
  Loader2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGitHubOAuth } from '@/hooks/use-github-oauth';
import { useProjectCreation } from '@/hooks/use-project-creation';
import type { GitHubRepository } from '@/lib/types/github';
import type { CreateProjectData } from '@/lib/types/project';
import { RepositorySelector } from './repository-selector';

interface ProjectCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProjectName?: string;
  initialTab?: 'create' | 'import';
  showGitHubConnected?: boolean;
}

export default function ProjectCreationModal({
  open,
  onOpenChange,
  initialProjectName = '',
  initialTab = 'create',
  showGitHubConnected = false,
}: ProjectCreationModalProps) {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<'create' | 'import'>(initialTab);
  const [projectName, setProjectName] = useState(initialProjectName);
  const [showConnectedMessage, setShowConnectedMessage] = useState(false);

  // Import mode state
  const [selectedRepository, setSelectedRepository] = useState<GitHubRepository>();

  const { currentStep, createProject, isCreating, resetCreation } = useProjectCreation();
  const {
    isConnected: isGitHubConnected,
    isConnecting: isConnectingGitHub,
    connectGitHub,
    clearConnectingState,
  } = useGitHubOAuth();

  // Auto-set project name from repository name (import mode)
  useEffect(() => {
    if (activeTab === 'import' && selectedRepository) {
      setProjectName(selectedRepository.name);
    }
  }, [selectedRepository, activeTab]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      resetCreation();
      setProjectName(initialProjectName);
      setSelectedRepository(undefined);
      setActiveTab(initialTab);

      // Show success message only when coming from OAuth redirect
      if (showGitHubConnected && initialTab === 'import') {
        // Clear the connecting state now that we're back from OAuth
        clearConnectingState();

        setShowConnectedMessage(true);
        // Auto-hide message after 5 seconds
        const timer = setTimeout(() => {
          setShowConnectedMessage(false);
        }, 5000);
        return () => clearTimeout(timer);
      }
    } else {
      setShowConnectedMessage(false);
    }
  }, [
    open,
    initialProjectName,
    initialTab,
    showGitHubConnected,
    resetCreation,
    clearConnectingState,
  ]);

  // Close modal on successful creation
  useEffect(() => {
    if (currentStep.step === 'complete') {
      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    }
  }, [currentStep.step, onOpenChange]);

  const handleCreateProject = () => {
    if (!projectName.trim()) return;

    const createData: CreateProjectData = {
      name: projectName.trim(),
      github: {
        type: activeTab,
        ...(activeTab === 'create'
          ? {}
          : {
              repositoryUrl: selectedRepository?.html_url,
            }),
      },
    };

    createProject(createData);
  };

  const canSubmit = () => {
    if (!projectName.trim()) return false;

    if (activeTab === 'create') {
      return true; // Project name is all we need
    } else {
      return !!selectedRepository;
    }
  };

  const getSubmitText = () => {
    if (isCreating) {
      if (currentStep.step === 'creating') {
        return activeTab === 'create' ? 'Creating Project...' : 'Importing Project...';
      }
    }
    return activeTab === 'create' ? 'Create Project' : 'Import Project';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Only trigger on Enter key
    if (e.key !== 'Enter') return;

    // Don't trigger if focus is on textarea (description field)
    if (e.target instanceof HTMLTextAreaElement) return;

    // Don't trigger if form cannot be submitted
    if (!canSubmit() || isCreating) return;

    // Prevent default form submission behavior
    e.preventDefault();

    // Trigger project creation
    handleCreateProject();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 overflow-hidden border border-border bg-card shadow-lg rounded-md"
        style={{ maxWidth: '600px' }}
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">
          {activeTab === 'create' ? 'Create New Project' : 'Import from GitHub'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {activeTab === 'create'
            ? 'Create a new project with a GitHub repository'
            : 'Import an existing GitHub repository as a project'}
        </DialogDescription>

        <div className="p-6">
          <div className="flex items-center space-x-3 mb-6">
            <FolderPlus className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">New Project</h3>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={value => setActiveTab(value as 'create' | 'import')}
            className="w-full"
          >
            <TabsList className="w-full mb-6">
              <TabsTrigger value="create" className="flex items-center gap-2 flex-1">
                <FolderPlus className="h-4 w-4" />
                <span>Create New</span>
              </TabsTrigger>
              <TabsTrigger value="import" className="flex items-center gap-2 flex-1">
                <Github className="h-4 w-4" />
                <span>Import from GitHub</span>
              </TabsTrigger>
            </TabsList>

            <div className="space-y-6">
              {/* Project Name - Only for create tab */}
              {activeTab === 'create' && (
                <div className="space-y-2">
                  <Label htmlFor="projectName" className="text-sm font-medium">
                    Project Name
                  </Label>
                  <Input
                    id="projectName"
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    className="h-11"
                    placeholder="My awesome project"
                    disabled={isCreating}
                  />
                </div>
              )}

              <TabsContent value="import" className="space-y-4 mt-0">
                {(!isGitHubConnected || isConnectingGitHub) && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>GitHub Connection Required</AlertTitle>
                    <AlertDescription className="justify-items-center">
                      <p className="mb-3 justify-self-start">
                        Connect your GitHub account to import your existing repositories.
                      </p>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() =>
                          connectGitHub('/projects?openImport=true&githubConnected=true')
                        }
                        disabled={isConnectingGitHub}
                        className={isConnectingGitHub ? 'animate-pulse' : ''}
                      >
                        {isConnectingGitHub ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Github className="h-4 w-4 mr-2" />
                            Connect GitHub
                          </>
                        )}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {isGitHubConnected && !isConnectingGitHub && showConnectedMessage && (
                  <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <AlertTitle className="text-green-900 dark:text-green-100">
                      GitHub Connected Successfully
                    </AlertTitle>
                    <AlertDescription className="text-green-700 dark:text-green-300">
                      You can now select a repository to import.
                    </AlertDescription>
                  </Alert>
                )}

                {isGitHubConnected && !isConnectingGitHub && (
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Github className="h-4 w-4" />
                        Select Repository
                      </CardTitle>
                      <CardDescription>
                        Choose an existing GitHub repository to import into your project.
                      </CardDescription>
                      <Alert className="mt-3 py-2">
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          Can&apos;t find your repository?{' '}
                          <a
                            href="https://github.com/settings/applications"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline underline-offset-4 hover:text-primary"
                          >
                            Grant Kosuke access to your organization
                          </a>
                        </AlertDescription>
                      </Alert>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">GitHub Repository</Label>
                        <RepositorySelector
                          userId={user?.id || ''}
                          selectedRepository={selectedRepository}
                          onRepositorySelect={setSelectedRepository}
                          placeholder="Select a repository..."
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Actions */}
              <div className="flex justify-end items-center gap-3 pt-6">
                <Button
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={isCreating}
                  className="h-10"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateProject}
                  disabled={!canSubmit() || isCreating}
                  className="h-10 space-x-2 min-w-[140px]"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{getSubmitText()}</span>
                    </>
                  ) : (
                    <>
                      <span>{getSubmitText()}</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
