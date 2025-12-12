'use client';

import { useCallback, useEffect, useState } from 'react';

interface UseTableSearchOptions {
  initialValue?: string;
  debounceMs?: number;
  onSearchChange?: (query: string) => void;
}

/**
 * Hook for debounced search functionality in tables
 * @param options - Configuration options
 * @returns Search state and handlers
 */
export function useTableSearch({
  initialValue = '',
  debounceMs = 300,
  onSearchChange,
}: UseTableSearchOptions = {}) {
  const [searchValue, setSearchValue] = useState(initialValue);
  const [debouncedValue, setDebouncedValue] = useState(initialValue);

  // Sync debounced value after delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(searchValue);
      onSearchChange?.(searchValue);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchValue, debounceMs, onSearchChange]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchValue('');
    setDebouncedValue('');
  }, []);

  return {
    searchValue,
    debouncedValue,
    setSearchValue,
    clearSearch,
  };
}
