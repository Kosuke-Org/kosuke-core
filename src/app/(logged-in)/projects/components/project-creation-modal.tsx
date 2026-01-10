'use client';

import {
  ArrowRight,
  ExternalLink,
  FlaskConical,
  FolderPlus,
  Github,
  Info,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrganizationBeta } from '@/hooks/use-organization-beta';
import { useProjectCreation } from '@/hooks/use-project-creation';
import type { GitHubRepository } from '@/lib/types/github';
import type { CreateProjectData } from '@/lib/types/project';
import { RepositorySelector } from './repository-selector';

const GITHUB_APP_SLUG = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'kosuke-github-app';
const GITHUB_APP_INSTALL_URL = `https://github.com/apps/${GITHUB_APP_SLUG}`;

interface ProjectCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProjectName?: string;
  initialTab?: 'create' | 'import';
}

export default function ProjectCreationModal({
  open,
  onOpenChange,
  initialProjectName = '',
  initialTab = 'import',
}: ProjectCreationModalProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'import'>(initialTab);
  const [projectName, setProjectName] = useState(initialProjectName);

  // Import mode state
  const [selectedRepository, setSelectedRepository] = useState<GitHubRepository>();

  const { isBeta } = useOrganizationBeta();
  const { currentStep, createProject, isCreating, resetCreation } = useProjectCreation();

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
    }
  }, [open, initialProjectName, initialTab, resetCreation]);

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
    if (activeTab === 'create') {
      // Need beta access and project name for create
      return isBeta && !!projectName.trim();
    } else {
      // Need project name and repository for import
      return !!projectName.trim() && !!selectedRepository;
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
              <TabsTrigger value="import" className="flex items-center gap-2 flex-1">
                <Github className="h-4 w-4" />
                <span>Import from GitHub</span>
              </TabsTrigger>
              <TabsTrigger value="create" className="flex items-center gap-2 flex-1">
                <FolderPlus className="h-4 w-4" />
                <span>Create New</span>
              </TabsTrigger>
            </TabsList>

            <div className="space-y-6">
              {/* Project Name - Only for create tab with beta access */}
              {activeTab === 'create' && isBeta && (
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

              {/* Beta access message for non-beta users */}
              {activeTab === 'create' && !isBeta && (
                <Card className="border-amber-500/50 bg-amber-500/5 px-4">
                  <div className="flex items-center gap-2 text-base font-semibold text-amber-600 dark:text-amber-400">
                    <FlaskConical className="h-5 w-5" />
                    Beta Feature
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Creating projects from scratch is currently in beta and available to selected
                    organizations. In the meantime, you can import an existing GitHub repository.
                  </p>
                </Card>
              )}

              <TabsContent value="import" className="space-y-4 mt-0">
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
                        <Link
                          href={GITHUB_APP_INSTALL_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium underline underline-offset-4 hover:text-primary"
                        >
                          Configure the Kosuke GitHub App
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </AlertDescription>
                    </Alert>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">GitHub Repository</Label>
                      <RepositorySelector
                        selectedRepository={selectedRepository}
                        onRepositorySelect={setSelectedRepository}
                        placeholder="Select a repository..."
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Actions - Hide for non-beta users on create tab */}
              {(activeTab !== 'create' || isBeta) && (
                <div className="flex justify-end items-center pt-6">
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
              )}
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
