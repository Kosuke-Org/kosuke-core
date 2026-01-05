'use client';

import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ProjectDropdownMenu } from './project-dropdown-menu';

interface ProjectHeaderProps {
  projectId: string;
  projectName?: string;
  githubRepoUrl?: string | null;
  showBackButton?: boolean;
  onBackClick?: () => void;
  children?: ReactNode;
}

export function ProjectHeader({
  projectId,
  projectName,
  githubRepoUrl,
  showBackButton = false,
  onBackClick,
  children,
}: ProjectHeaderProps) {
  const router = useRouter();

  const handleSettingsClick = () => {
    // Navigate to URL with query param so it can be shared
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'project-settings');
    router.push(url.pathname + url.search, { scroll: false });
  };

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

      {/* Center section - Project name dropdown */}
      <div className="flex items-center justify-center w-1/2">
        <ProjectDropdownMenu
          projectId={projectId}
          projectName={projectName}
          githubRepoUrl={githubRepoUrl}
          onSettingsClick={handleSettingsClick}
        />
      </div>

      {/* Right section - User menu */}
      <div className="flex items-center gap-2 w-1/4 justify-end">{children}</div>
    </header>
  );
}
