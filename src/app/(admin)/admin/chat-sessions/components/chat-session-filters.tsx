'use client';

import { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { CalendarIcon, ListFilter, X } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

const statusOptions: { value: string; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'completed', label: 'Completed' },
];

interface ChatSessionFiltersProps {
  selectedStatuses: string[];
  dateFrom?: Date;
  dateTo?: Date;
  activeFiltersCount: number;
  onStatusesChange: (statuses: string[]) => void;
  onDateFromChange: (date?: Date) => void;
  onDateToChange: (date?: Date) => void;
}

export function ChatSessionFilters({
  selectedStatuses,
  dateFrom,
  dateTo,
  activeFiltersCount,
  onStatusesChange,
  onDateFromChange,
  onDateToChange,
}: ChatSessionFiltersProps) {
  const [open, setOpen] = useState(false);
  const [pendingStatuses, setPendingStatuses] = useState<string[]>(selectedStatuses);
  const [pendingDateRange, setPendingDateRange] = useState<DateRange | undefined>({
    from: dateFrom,
    to: dateTo,
  });

  useEffect(() => {
    setPendingStatuses(selectedStatuses);
  }, [selectedStatuses]);

  useEffect(() => {
    setPendingDateRange({ from: dateFrom, to: dateTo });
  }, [dateFrom, dateTo]);

  const handleStatusToggle = (status: string) => {
    if (pendingStatuses.includes(status)) {
      setPendingStatuses(pendingStatuses.filter(s => s !== status));
    } else {
      setPendingStatuses([...pendingStatuses, status]);
    }
  };

  const handleApply = () => {
    onStatusesChange(pendingStatuses);
    onDateFromChange(pendingDateRange?.from);
    onDateToChange(pendingDateRange?.to);
    setOpen(false);
  };

  const handleCancel = () => {
    setPendingStatuses(selectedStatuses);
    setPendingDateRange({ from: dateFrom, to: dateTo });
    setOpen(false);
  };

  const hasPendingChanges =
    JSON.stringify(pendingStatuses.sort()) !== JSON.stringify([...selectedStatuses].sort()) ||
    pendingDateRange?.from?.getTime() !== dateFrom?.getTime() ||
    pendingDateRange?.to?.getTime() !== dateTo?.getTime();

  const getDateRangeText = () => {
    if (pendingDateRange?.from && pendingDateRange?.to) {
      return `${format(pendingDateRange.from, 'MMM d')} - ${format(pendingDateRange.to, 'MMM d, yyyy')}`;
    }
    if (pendingDateRange?.from) {
      return `From ${format(pendingDateRange.from, 'MMM d, yyyy')}`;
    }
    if (pendingDateRange?.to) {
      return `Until ${format(pendingDateRange.to, 'MMM d, yyyy')}`;
    }
    return 'Any date';
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <ListFilter />
          Filters
          {activeFiltersCount > 0 && (
            <Badge className="h-5 w-5 p-0 text-xs">{activeFiltersCount}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start" side="bottom" sideOffset={4}>
        <div className="space-y-4 p-4">
          {/* Status Filter */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Status</Label>
            <div className="space-y-2">
              {statusOptions.map(option => (
                <div key={option.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`status-${option.value}`}
                    checked={pendingStatuses.includes(option.value)}
                    onCheckedChange={() => handleStatusToggle(option.value)}
                  />
                  <label
                    htmlFor={`status-${option.value}`}
                    className="flex-1 cursor-pointer text-sm leading-none"
                  >
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Date Range Filter */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Last Activity Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'h-9 w-full justify-start text-left font-normal',
                    !pendingDateRange?.from && !pendingDateRange?.to && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  <span className="text-sm">{getDateRangeText()}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={pendingDateRange}
                  onSelect={setPendingDateRange}
                  numberOfMonths={2}
                  disabled={date => date > new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-muted/30 flex items-center justify-between border-t px-3 py-2">
          <Button variant="ghost" size="sm" onClick={handleCancel} className="h-8">
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleApply} disabled={!hasPendingChanges} className="h-8">
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Active Filter Badges Component
interface ActiveFilterBadgesProps {
  selectedStatuses: string[];
  dateFrom?: Date;
  dateTo?: Date;
  onStatusesChange: (statuses: string[]) => void;
  onDateFromChange: (date?: Date) => void;
  onDateToChange: (date?: Date) => void;
}

export function ActiveFilterBadges({
  selectedStatuses,
  dateFrom,
  dateTo,
  onStatusesChange,
  onDateFromChange,
  onDateToChange,
}: ActiveFilterBadgesProps) {
  const hasActiveFilters =
    selectedStatuses.length > 0 || dateFrom !== undefined || dateTo !== undefined;

  if (!hasActiveFilters) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selectedStatuses.map(status => (
        <Badge key={status} variant="outline" className="gap-1 pr-1 pl-2">
          {status}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStatusesChange(selectedStatuses.filter(s => s !== status))}
            className="h-4 w-4 p-0 hover:bg-transparent hover:text-current"
          >
            <X />
          </Button>
        </Badge>
      ))}
      {(dateFrom || dateTo) && (
        <Badge variant="secondary" className="gap-2 pr-1 pl-2">
          <CalendarIcon />
          {dateFrom && dateTo
            ? `${format(dateFrom, 'MMM d')} - ${format(dateTo, 'MMM d')}`
            : dateFrom
              ? `From ${format(dateFrom, 'MMM d')}`
              : `Until ${format(dateTo!, 'MMM d')}`}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onDateFromChange(undefined);
              onDateToChange(undefined);
            }}
            className="h-4 w-4 p-0 hover:bg-transparent"
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      )}
    </div>
  );
}
