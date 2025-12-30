'use client';

import { Check, ChevronsUpDown, Lock } from 'lucide-react';
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
import { useGitHubOrganizations } from '@/hooks/use-github-organizations';
import { useGitHubRepositories } from '@/hooks/use-github-repositories';
import type { GitHubRepository } from '@/lib/types/github';
import { cn } from '@/lib/utils';

interface RepositorySelectorProps {
  userId: string;
  selectedRepository?: GitHubRepository;
  onRepositorySelect: (repository: GitHubRepository) => void;
  placeholder?: string;
}

export function RepositorySelector({
  userId,
  selectedRepository,
  onRepositorySelect,
  placeholder = 'Search a repository...',
}: RepositorySelectorProps) {
  const [openOrg, setOpenOrg] = useState(false);
  const [openRepo, setOpenRepo] = useState(false);
  const [selectedContext, setSelectedContext] = useState<string>('personal');
  const [search, setSearch] = useState('');

  const {
    organizations,
    isLoading: isOrgsLoading,
    fetchNextPage: fetchNextOrgPage,
    hasNextPage: hasNextOrgPage,
    isFetchingNextPage: isFetchingNextOrgPage,
  } = useGitHubOrganizations(userId, openOrg);
  const { repositories, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useGitHubRepositories(userId, openRepo, selectedContext, search);

  const handleOrgScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollBottom = target.scrollHeight - target.scrollTop;
    const isNearBottom = scrollBottom <= target.clientHeight + 100;

    if (isNearBottom && hasNextOrgPage && !isFetchingNextOrgPage) {
      fetchNextOrgPage();
    }
  };

  const handleRepoScroll = (e: React.UIEvent<HTMLDivElement>) => {
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

  const handleOrgSelect = (org: string) => {
    setSelectedContext(org);
    setSearch('');
    setOpenOrg(false);
  };

  return (
    <div className="flex gap-2">
      {/* Organization Selector - 30% */}
      <Popover open={openOrg} onOpenChange={setOpenOrg}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={openOrg}
            className="w-[35%] justify-between"
          >
            <span className="text-sm truncate">
              {selectedContext === 'personal' ? 'Personal' : selectedContext}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0"
          align="start"
          style={{ width: 'var(--radix-popover-trigger-width)' }}
        >
          <Command shouldFilter={false} className="h-auto">
            <CommandList
              className="max-h-[200px] overflow-y-auto"
              onScroll={handleOrgScroll}
              onWheel={handleWheel}
            >
              <CommandEmpty>
                {isOrgsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                  </div>
                ) : (
                  'No organizations found.'
                )}
              </CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="personal"
                  onSelect={() => handleOrgSelect('personal')}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedContext === 'personal' ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span>Personal</span>
                </CommandItem>
                {organizations.map(org => (
                  <CommandItem
                    key={org.id}
                    value={org.login}
                    onSelect={() => handleOrgSelect(org.login)}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedContext === org.login ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="truncate">{org.login}</span>
                  </CommandItem>
                ))}
                {isFetchingNextOrgPage && (
                  <div className="p-2 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                  </div>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Repository Selector - 70% */}
      <Popover open={openRepo} onOpenChange={setOpenRepo} modal={false}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={openRepo}
            className="w-[65%] justify-between"
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
              onScroll={handleRepoScroll}
              onWheel={handleWheel}
            >
              <CommandEmpty>
                {isLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                  </div>
                ) : (
                  'No repositories found.'
                )}
              </CommandEmpty>
              <CommandGroup>
                {repositories.map(repo => (
                  <CommandItem
                    key={repo.id}
                    value={repo.name}
                    onSelect={() => {
                      onRepositorySelect(repo);
                      setOpenRepo(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedRepository?.id === repo.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="flex-1 truncate">{repo.name}</span>
                    {repo.private && (
                      <Lock className="h-3 w-3 text-muted-foreground ml-2 shrink-0" />
                    )}
                  </CommandItem>
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
    </div>
  );
}
