'use client';

import { useCallback, useState } from 'react';

/**
 * Hook for managing table filter state
 * @param initialFilters - Initial filter values
 * @returns Filter state and handlers
 */
export function useTableFilters<T extends Record<string, unknown>>(initialFilters: T) {
  const [filters, setFilters] = useState<T>(initialFilters);

  const updateFilter = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateFilters = useCallback((updates: Partial<T>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  const clearFilter = useCallback(
    <K extends keyof T>(key: K) => {
      setFilters(prev => ({ ...prev, [key]: initialFilters[key] }));
    },
    [initialFilters]
  );

  return {
    filters,
    updateFilter,
    updateFilters,
    resetFilters,
    clearFilter,
  };
}
