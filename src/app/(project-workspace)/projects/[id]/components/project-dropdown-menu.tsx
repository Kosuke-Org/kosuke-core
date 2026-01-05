'use client';

import { Check, ChevronDown, Copy, ExternalLink, Settings } from 'lucide-react';
import { useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ProjectDropdownMenuProps {
  projectId: string;
  projectName?: string;
  githubRepoUrl?: string | null;
  onSettingsClick: () => void;
  /**
   * Render prop for custom trigger element.
   * If not provided, uses default project name + chevron trigger.
   */
  trigger?: React.ReactNode;
}

export function ProjectDropdownMenu({
  projectId,
  projectName,
  githubRepoUrl,
  onSettingsClick,
  trigger,
}: ProjectDropdownMenuProps) {
  const [isProjectIdCopied, setIsProjectIdCopied] = useState(false);

  const copyProjectId = async () => {
    try {
      await navigator.clipboard.writeText(projectId);
      setIsProjectIdCopied(true);
      setTimeout(() => setIsProjectIdCopied(false), 2000);
    } catch (_error) {
      // Silent fail
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button className="flex items-center gap-1.5 hover:bg-accent hover:text-accent-foreground rounded-md px-2 py-1 transition-colors">
            <span className="text-sm font-medium truncate max-w-[200px]">
              {projectName || 'Loading Project...'}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-80">
        {/* Project ID with Copy */}
        <div className="px-2 py-2">
          <button
            onClick={copyProjectId}
            className="flex items-center justify-between w-full text-left gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
          >
            <span className="text-xs text-muted-foreground">Project ID:</span>
            <code className="text-xs font-mono truncate">{projectId}</code>
            {isProjectIdCopied ? (
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
          </button>
        </div>
        <DropdownMenuSeparator />
        {githubRepoUrl && (
          <DropdownMenuItem asChild>
            <a
              href={githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              See on GitHub
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onSettingsClick}>
          <Settings className="h-4 w-4 mr-2" />
          Project Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
