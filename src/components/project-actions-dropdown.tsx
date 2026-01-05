'use client';

import { Check, Copy, ExternalLink, MoreHorizontal, Settings } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Project } from '@/lib/db/schema';

interface ProjectActionsDropdownProps {
  project: Project;
  onSettingsClick: () => void;
}

export function ProjectActionsDropdown({ project, onSettingsClick }: ProjectActionsDropdownProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isIdCopied, setIsIdCopied] = useState(false);

  const handleCopyId = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(project.id);
      setIsIdCopied(true);
      setTimeout(() => setIsIdCopied(false), 2000);
    } catch (_error) {
      // Silent fail
    }
  };

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropdownOpen(false);
    onSettingsClick();
  };

  const handleGitHubClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Construct GitHub URL
  const githubUrl =
    project.githubRepoUrl ||
    (project.githubOwner && project.githubRepoName
      ? `https://github.com/${project.githubOwner}/${project.githubRepoName}`
      : null);

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild onClick={e => e.preventDefault()}>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => e.preventDefault()}>
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card border-border">
        <DropdownMenuItem onClick={handleCopyId} className="focus:bg-muted">
          {isIdCopied ? (
            <Check className="mr-2 h-4 w-4 text-primary" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          <span>Copy project ID</span>
        </DropdownMenuItem>

        {githubUrl && (
          <DropdownMenuItem asChild className="focus:bg-muted">
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleGitHubClick}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              <span>View on GitHub</span>
            </a>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleSettingsClick} className="focus:bg-muted">
          <Settings className="mr-2 h-4 w-4" />
          <span>Project Settings</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
