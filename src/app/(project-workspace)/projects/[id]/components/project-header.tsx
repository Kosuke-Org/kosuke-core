'use client';

import { ArrowLeft, Check, Copy } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode, useState } from 'react';

import { Button } from '@/components/ui/button';

interface ProjectHeaderProps {
  projectId: string;
  projectName?: string;
  showBackButton?: boolean;
  onBackClick?: () => void;
  children?: ReactNode;
}

export function ProjectHeader({
  projectId,
  projectName,
  showBackButton = false,
  onBackClick,
  children,
}: ProjectHeaderProps) {
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

      {/* Center section - Project name and ID */}
      <div className="flex items-center justify-center gap-2 w-1/2">
        <h2 className="text-sm font-medium truncate max-w-[200px]">
          {projectName || 'Loading Project...'}
        </h2>
        <button
          onClick={copyProjectId}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="Copy project ID"
        >
          <span className="font-mono">{projectId.slice(0, 8)}</span>
          {isProjectIdCopied ? (
            <Check className="h-3 w-3 text-primary" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Right section - User menu */}
      <div className="flex items-center gap-2 w-1/4 justify-end">{children}</div>
    </header>
  );
}
