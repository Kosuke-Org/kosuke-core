'use client';

import { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import {
  Calendar,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  MessageSquare,
  MoreHorizontal,
  Trash,
  User,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '../../components/data-table-column-header';

export interface AdminChatSession {
  id: string;
  projectId: string;
  projectName: string | null;
  userId: string | null;
  title: string;
  description: string | null;
  branchName: string;
  remoteId: string | null;
  status: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
  messageCount: number | null;
  isDefault: boolean | null;
  branchMergedAt: Date | null;
  pullRequestNumber: number | null;
}

interface ColumnActionsProps {
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}

interface ColumnSortingProps {
  sortBy: 'title' | 'lastActivityAt' | 'messageCount' | 'createdAt';
  sortOrder: 'asc' | 'desc';
  onSort: (column: 'title' | 'lastActivityAt' | 'messageCount' | 'createdAt') => void;
}

export function getChatSessionColumns(
  actions: ColumnActionsProps,
  sorting: ColumnSortingProps
): ColumnDef<AdminChatSession>[] {
  const { onView, onDelete } = actions;
  const { sortBy, sortOrder, onSort } = sorting;

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'active':
        return <Badge variant="default">Active</Badge>;
      case 'archived':
        return <Badge variant="secondary">Archived</Badge>;
      case 'completed':
        return <Badge variant="outline">Completed</Badge>;
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>;
    }
  };

  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsSomeRowsSelected() ? 'indeterminate' : table.getIsAllRowsSelected()}
          onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={row.getToggleSelectedHandler()}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'title',
      header: () => (
        <DataTableColumnHeader
          title="Title"
          icon={<FileText size={16} />}
          sortable
          sortDirection={sortBy === 'title' ? sortOrder : false}
          onSort={() => onSort('title')}
        />
      ),
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.title}</div>
          {row.original.description && (
            <div className="text-sm text-muted-foreground line-clamp-1">
              {row.original.description}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'projectName',
      header: () => <DataTableColumnHeader title="Project" icon={<FolderOpen size={16} />} />,
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.projectName || <span className="text-muted-foreground">Unknown</span>}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: () => <DataTableColumnHeader title="Status" />,
      cell: ({ row }) => getStatusBadge(row.original.status),
    },
    {
      accessorKey: 'messageCount',
      header: () => (
        <DataTableColumnHeader
          title="Messages"
          icon={<MessageSquare size={16} />}
          sortable
          sortDirection={sortBy === 'messageCount' ? sortOrder : false}
          onSort={() => onSort('messageCount')}
        />
      ),
      cell: ({ row }) => (
        <div className="text-sm text-center">{row.original.messageCount || 0}</div>
      ),
    },
    {
      accessorKey: 'userId',
      header: () => <DataTableColumnHeader title="User" icon={<User size={16} />} />,
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground font-mono">
          {row.original.userId ? (
            <span className="truncate max-w-[120px] inline-block" title={row.original.userId}>
              {row.original.userId.substring(0, 12)}...
            </span>
          ) : (
            'N/A'
          )}
        </div>
      ),
    },
    {
      accessorKey: 'lastActivityAt',
      header: () => (
        <DataTableColumnHeader
          title="Last Activity"
          icon={<Calendar size={16} />}
          sortable
          sortDirection={sortBy === 'lastActivityAt' ? sortOrder : false}
          onSort={() => onSort('lastActivityAt')}
        />
      ),
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.lastActivityAt), { addSuffix: true })}
        </div>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        const session = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={e => e.stopPropagation()}>
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={e => {
                  e.stopPropagation();
                  onView(session.id);
                }}
              >
                <Eye className="mr-2 h-4 w-4" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`https://cloud.langfuse.com/project/${process.env.NEXT_PUBLIC_LANGFUSE_PROJECT_ID}/traces?filter=metadata%3BstringObject%3BkosukeSessionId%3B%3D%3B${session.id}&dateRange=90d`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Explore costs
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={e => {
                  e.stopPropagation();
                  onDelete(session.id);
                }}
                className="text-red-600"
              >
                <Trash className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
