'use client';

import { useCallback, useState } from 'react';

/**
 * Hook for managing table row selection state
 * @returns Row selection state and handlers
 */
export function useTableRowSelection() {
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  const clearSelection = useCallback(() => {
    setSelectedRowIds([]);
  }, []);

  const selectRow = useCallback((id: string) => {
    setSelectedRowIds(prev => [...prev, id]);
  }, []);

  const deselectRow = useCallback((id: string) => {
    setSelectedRowIds(prev => prev.filter(rowId => rowId !== id));
  }, []);

  const toggleRow = useCallback((id: string) => {
    setSelectedRowIds(prev =>
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  }, []);

  return {
    selectedRowIds,
    setSelectedRowIds,
    clearSelection,
    selectRow,
    deselectRow,
    toggleRow,
    hasSelection: selectedRowIds.length > 0,
    selectionCount: selectedRowIds.length,
  };
}
