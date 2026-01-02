'use client';

import { Check, ChevronsUpDown, Github, Lock, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useGitHubOAuth } from '@/hooks/use-github-oauth';
import { useGitHubRepositories } from '@/hooks/use-github-repositories';
import type { GitHubRepository } from '@/lib/types/github';
import { cn } from '@/lib/utils';

interface RepositorySelectorProps {
  selectedRepository?: GitHubRepository;
  onRepositorySelect: (repository: GitHubRepository) => void;
  placeholder?: string;
}

export function RepositorySelector({
  selectedRepository,
  onRepositorySelect,
  placeholder = 'Search a repository...',
}: RepositorySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Always enable fetch to check GitHub connection status
  const {
    repositories,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    needsGitHubConnection,
    installUrl,
  } = useGitHubRepositories(true, search);

  const { connectGitHub, isConnecting } = useGitHubOAuth();

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollBottom = target.scrollHeight - target.scrollTop;
    const isNearBottom = scrollBottom <= target.clientHeight + 100;

    if (isNearBottom && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  const handleConnectGitHub = () => {
    connectGitHub('/projects?openImport=true');
  };

  // Show GitHub connection prompt if user hasn't connected GitHub
  if (needsGitHubConnection && !isLoading) {
    return (
      <div className="border rounded-md p-4 bg-muted/30">
        <div className="flex flex-col items-center text-center gap-3">
          <Github className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Connect GitHub to continue</p>
            <p className="text-xs text-muted-foreground mt-1">
              Connect your GitHub account to see repositories you can import.
            </p>
          </div>
          <Button onClick={handleConnectGitHub} disabled={isConnecting} size="sm" className="mt-1">
            {isConnecting ? (
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
        </div>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedRepository ? (
            <span className="flex items-center gap-2">
              <span className="truncate">{selectedRepository.full_name}</span>
              {selectedRepository.private && (
                <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        <Command shouldFilter={false} className="h-auto">
          <CommandInput
            placeholder="Search repositories..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList
            className="max-h-[280px] overflow-y-auto"
            onScroll={handleScroll}
            onWheel={handleWheel}
          >
            <CommandEmpty>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted-foreground mb-2">No repositories found.</p>
                  <p className="text-xs text-muted-foreground">
                    Make sure you have access to the repository and have connected your GitHub
                    account.
                  </p>
                </div>
              )}
            </CommandEmpty>
            <CommandGroup>
              {repositories.map(repo => (
                <TooltipProvider key={repo.id} delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <CommandItem
                          value={repo.full_name}
                          disabled={!repo.appInstalled}
                          onSelect={() => {
                            if (repo.appInstalled) {
                              onRepositorySelect(repo);
                              setOpen(false);
                            }
                          }}
                          className={cn(!repo.appInstalled && 'opacity-60 cursor-not-allowed')}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedRepository?.id === repo.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <span className="flex-1 truncate">{repo.full_name}</span>
                          {repo.private && (
                            <Lock className="h-3 w-3 text-muted-foreground ml-2 shrink-0" />
                          )}
                          {!repo.appInstalled && (
                            <Link
                              href={installUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="ml-2 shrink-0 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500 hover:underline"
                            >
                              <AlertCircle className="h-3 w-3" />
                              <span>Install App</span>
                            </Link>
                          )}
                        </CommandItem>
                      </div>
                    </TooltipTrigger>
                    {!repo.appInstalled && (
                      <TooltipContent side="left" className="max-w-[200px]">
                        <p className="text-xs">
                          Kosuke app is not installed on this repository. Click &quot;Install
                          App&quot; to enable importing.
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              ))}
              {isFetchingNextPage && (
                <div className="p-2 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                </div>
              )}
              {!isLoading && !hasNextPage && repositories.length > 0 && (
                <div className="p-2 text-center text-xs text-muted-foreground">
                  All {repositories.length} repositories loaded
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
