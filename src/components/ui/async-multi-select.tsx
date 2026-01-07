'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface AsyncMultiSelectProps<T> {
  value: T[];
  onChange: (items: T[]) => void;
  onSearch: (query: string) => Promise<T[]>;
  getOptionLabel: (item: T) => string;
  getOptionValue: (item: T) => string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}

export function AsyncMultiSelect<T>({
  value,
  onChange,
  onSearch,
  getOptionLabel,
  getOptionValue,
  placeholder = 'Select items...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  disabled = false,
  className,
}: AsyncMultiSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const listboxId = React.useId();
  const [search, setSearch] = React.useState('');
  const [options, setOptions] = React.useState<T[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDoneRef = React.useRef(false);

  // Debounced search - only runs when search changes after initial load
  React.useEffect(() => {
    // Skip if popover is closed or if this is the initial empty search
    // (the initial load effect handles the first fetch)
    if (!open || (!initialLoadDoneRef.current && search === '')) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await onSearch(search);
        setOptions(results);
      } catch (error) {
        console.error('AsyncMultiSelect search error:', error);
        setOptions([]);
      } finally {
        setIsLoading(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [open, search, onSearch]);

  // Initial load when opening
  React.useEffect(() => {
    if (open && !initialLoadDoneRef.current && !isLoading) {
      initialLoadDoneRef.current = true;
      setIsLoading(true);
      onSearch('')
        .then(setOptions)
        .catch(() => setOptions([]))
        .finally(() => setIsLoading(false));
    }
    if (!open) {
      initialLoadDoneRef.current = false;
    }
  }, [open, isLoading, onSearch]);

  const selectedValues = React.useMemo(
    () => new Set(value.map(getOptionValue)),
    [value, getOptionValue]
  );

  const handleSelect = (item: T) => {
    const itemValue = getOptionValue(item);
    if (selectedValues.has(itemValue)) {
      onChange(value.filter(v => getOptionValue(v) !== itemValue));
    } else {
      onChange([...value, item]);
    }
  };

  const handleRemove = (item: T, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter(v => getOptionValue(v) !== getOptionValue(item)));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          disabled={disabled}
          className={cn(
            'flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        >
          <div className="flex flex-1 flex-wrap gap-1.5">
            {value.length > 0 ? (
              value.map(item => (
                <Badge key={getOptionValue(item)} variant="secondary" className="gap-1 pr-1">
                  <span className="max-w-[150px] truncate">{getOptionLabel(item)}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded-sm hover:bg-muted-foreground/20 cursor-pointer"
                    onClick={e => handleRemove(item, e)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        handleRemove(item, e as unknown as React.MouseEvent);
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false} id={listboxId}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : options.length === 0 ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : (
              <CommandGroup>
                {options.map(item => {
                  const itemValue = getOptionValue(item);
                  const isSelected = selectedValues.has(itemValue);
                  return (
                    <CommandItem
                      key={itemValue}
                      value={itemValue}
                      onSelect={() => handleSelect(item)}
                    >
                      <div
                        className={cn(
                          'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'opacity-50 [&_svg]:invisible'
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </div>
                      <span className="truncate">{getOptionLabel(item)}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
