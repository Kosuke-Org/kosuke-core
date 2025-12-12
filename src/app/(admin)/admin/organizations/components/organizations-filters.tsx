'use client';

import { RefreshCw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface OrganizationsFiltersProps {
  selectedType?: 'personal' | 'team';
  onTypeChange: (type: 'personal' | 'team' | undefined) => void;
  onRefresh: () => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export function OrganizationsFilters({
  selectedType,
  onTypeChange,
  onRefresh,
  onClearFilters,
  hasActiveFilters,
}: OrganizationsFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Type Filter */}
      <Select
        value={selectedType || 'all'}
        onValueChange={value =>
          onTypeChange(value === 'all' ? undefined : (value as 'personal' | 'team'))
        }
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="personal">Personal</SelectItem>
          <SelectItem value="team">Team</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters}>
          <X className="h-4 w-4 mr-2" />
          Clear Filters
        </Button>
      )}

      {/* Refresh Button */}
      <Button variant="outline" size="sm" onClick={onRefresh} className="ml-auto">
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh
      </Button>
    </div>
  );
}
