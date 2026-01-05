'use client';

import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode } from 'react';

import { ProjectActionsDropdown } from '@/components/project-actions-dropdown';
import { Button } from '@/components/ui/button';
import type { Project } from '@/lib/db/schema';

interface ProjectHeaderProps {
  project: Project;
  showBackButton?: boolean;
  onBackClick?: () => void;
  onSettingsClick: () => void;
  children?: ReactNode;
}

export function ProjectHeader({
  project,
  showBackButton = false,
  onBackClick,
  onSettingsClick,
  children,
}: ProjectHeaderProps) {
  return (
    <header className="h-14 flex items-center bg-background px-4">
      {/* Left section - Logo and Back button */}
      <div className="flex items-center gap-2 w-1/4">
        <Link href="/" className="flex items-center shrink-0">
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
        {showBackButton && onBackClick && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBackClick}
            aria-label="Back to Sessions"
            title="Back to Sessions"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Center section - Project name and dropdown */}
      <div className="flex items-center justify-center gap-1 w-1/2">
        <h2 className="text-sm font-medium truncate max-w-[200px]">
          {project.name || 'Loading Project...'}
        </h2>
        <ProjectActionsDropdown project={project} onSettingsClick={onSettingsClick} />
      </div>

      {/* Right section - User menu */}
      <div className="flex items-center gap-2 w-1/4 justify-end">{children}</div>
    </header>
  );
}
