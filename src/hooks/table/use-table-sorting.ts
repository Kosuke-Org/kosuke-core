'use client';

import { useCallback, useState } from 'react';

interface UseTableSortingOptions<T extends string> {
  initialSortBy: T;
  initialSortOrder?: 'asc' | 'desc';
}

/**
 * Hook for managing table sorting state
 * @param options - Configuration options
 * @returns Sorting state and handlers
 */
export function useTableSorting<T extends string>({
  initialSortBy,
  initialSortOrder = 'desc',
}: UseTableSortingOptions<T>) {
  const [sortBy, setSortBy] = useState<T>(initialSortBy);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialSortOrder);

  const handleSort = useCallback(
    (column: T) => {
      if (sortBy === column) {
        // Toggle direction if same column
        setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        // New column, default to desc
        setSortBy(column);
        setSortOrder('desc');
      }
    },
    [sortBy]
  );

  const resetSort = useCallback(() => {
    setSortBy(initialSortBy);
    setSortOrder(initialSortOrder);
  }, [initialSortBy, initialSortOrder]);

  return {
    sortBy,
    sortOrder,
    handleSort,
    resetSort,
  };
}
