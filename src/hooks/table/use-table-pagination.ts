'use client';

import { useCallback, useState } from 'react';

interface UseTablePaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
}

/**
 * Hook for managing table pagination state
 * @param options - Configuration options
 * @returns Pagination state and handlers
 */
export function useTablePagination({
  initialPage = 1,
  initialPageSize = 10,
}: UseTablePaginationOptions = {}) {
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1); // Reset to first page when changing page size
  }, []);

  const resetPagination = useCallback(() => {
    setPage(initialPage);
    setPageSize(initialPageSize);
  }, [initialPage, initialPageSize]);

  const goToFirstPage = useCallback(() => {
    setPage(1);
  }, []);

  return {
    page,
    pageSize,
    setPage: handlePageChange,
    setPageSize: handlePageSizeChange,
    resetPagination,
    goToFirstPage,
  };
}
