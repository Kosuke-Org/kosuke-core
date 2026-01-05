'use client';

import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, CloudDownload, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ProjectDropdownMenu } from '@/app/(project-workspace)/projects/[id]/components/project-dropdown-menu';
import ProjectSettingsModal from '@/app/(project-workspace)/projects/[id]/components/project-settings-modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Project } from '@/lib/db/schema';
import { useUser } from '@clerk/nextjs';

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const { user } = useUser();

  // Check if project is imported and GitHub is disconnected
  const githubAccount = user?.externalAccounts?.find(
    account => account.verification?.strategy === 'oauth_github'
  );
  const isImportedProject = project.isImported;
  const needsReconnection = isImportedProject && !githubAccount;

  return (
    <>
      <Link
        href={needsReconnection ? '#' : `/projects/${project.id}`}
        className={`block group ${needsReconnection ? 'pointer-events-none' : ''}`}
      >
        <Card
          className={`overflow-hidden h-full transition-all duration-300 border border-border relative bg-card pb-0 min-h-[140px] ${
            needsReconnection ? '' : 'hover:border-muted group-hover:translate-y-[-2px]'
          }`}
        >
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <div className="flex-1 gap-2 flex flex-col">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg font-semibold group-hover:text-primary transition-colors line-clamp-2">
                    {project.name}
                  </CardTitle>
                  {isImportedProject && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="shrink-0">
                            <CloudDownload className="h-4 w-4 text-primary cursor-help" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Imported from your Organisation</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {needsReconnection && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center pointer-events-auto">
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Reconnect Github</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <ProjectDropdownMenu
                  projectId={project.id}
                  projectName={project.name}
                  githubRepoUrl={project.githubRepoUrl}
                  onSettingsClick={() => setShowSettingsModal(true)}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={e => e.preventDefault()}
                    >
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  }
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
            </span>
          </CardContent>
          <div className="absolute inset-0 bg-linear-to-b from-transparent to-muted/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
        </Card>
      </Link>

      <ProjectSettingsModal
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
        project={{
          id: project.id,
          name: project.name,
          isImported: project.isImported,
          githubOwner: project.githubOwner,
          githubRepoName: project.githubRepoName,
        }}
      />
    </>
  );
}
