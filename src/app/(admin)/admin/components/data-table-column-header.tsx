'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DataTableColumnHeaderProps {
  title: string;
  icon?: React.ReactNode;
  sortable?: boolean;
  sortDirection?: 'asc' | 'desc' | false;
  onSort?: () => void;
  className?: string;
}

export function DataTableColumnHeader({
  title,
  icon,
  sortable = false,
  sortDirection = false,
  onSort,
  className,
}: DataTableColumnHeaderProps) {
  if (!sortable) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {icon}
        <span>{title}</span>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-3 h-8 data-[state=open]:bg-accent', className)}
      onClick={onSort}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span>{title}</span>
        {sortDirection === 'asc' ? (
          <ArrowUp className="ml-2 h-4 w-4" />
        ) : sortDirection === 'desc' ? (
          <ArrowDown className="ml-2 h-4 w-4" />
        ) : (
          <ChevronsUpDown className="ml-2 h-4 w-4" />
        )}
      </div>
    </Button>
  );
}
