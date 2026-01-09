'use client';

import { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import {
  Calendar,
  Database,
  ExternalLink,
  Eye,
  FileText,
  Github,
  MoreHorizontal,
  Trash,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '../../components/data-table-column-header';

export interface AdminProject {
  id: string;
  name: string;
  description: string | null;
  orgId: string | null;
  createdBy: string | null;
  createdAt: string;
  requirementsCompletedAt: string | null;
  requirementsCompletedBy: string | null;
  githubRepoUrl: string | null;
}

interface ColumnActionsProps {
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}

interface ColumnSortingProps {
  sortBy: 'name' | 'createdAt';
  sortOrder: 'asc' | 'desc';
  onSort: (column: 'name' | 'createdAt') => void;
}

export function getProjectColumns(
  actions: ColumnActionsProps,
  sorting: ColumnSortingProps
): ColumnDef<AdminProject>[] {
  const { onView, onDelete } = actions;
  const { sortBy, sortOrder, onSort } = sorting;

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
      accessorKey: 'name',
      header: () => (
        <DataTableColumnHeader
          title="Project Name"
          icon={<FileText size={16} />}
          sortable
          sortDirection={sortBy === 'name' ? sortOrder : false}
          onSort={() => onSort('name')}
        />
      ),
      cell: ({ row }) => <div className="font-medium text-sm">{row.original.name}</div>,
    },
    {
      accessorKey: 'orgId',
      header: () => <DataTableColumnHeader title="Organization" icon={<Database size={16} />} />,
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">{row.original.orgId || 'N/A'}</div>
      ),
    },
    {
      accessorKey: 'githubRepoUrl',
      header: () => <DataTableColumnHeader title="Repository" icon={<Github size={16} />} />,
      cell: ({ row }) => {
        const repoUrl = row.original.githubRepoUrl;
        if (!repoUrl) {
          return <span className="text-sm text-muted-foreground">N/A</span>;
        }

        // Extract owner/repo from GitHub URL
        const repoPath = repoUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');

        return (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-sm" asChild>
            <Link
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
            >
              {repoPath}
            </Link>
          </Button>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: () => (
        <DataTableColumnHeader
          title="Created"
          icon={<Calendar size={16} />}
          sortable
          sortDirection={sortBy === 'createdAt' ? sortOrder : false}
          onSort={() => onSort('createdAt')}
        />
      ),
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}
        </div>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        const project = row.original;

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
                  onView(project.id);
                }}
              >
                <Eye className="mr-2 h-4 w-4" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`https://cloud.langfuse.com/project/${process.env.NEXT_PUBLIC_LANGFUSE_PROJECT_ID}/sessions/${project.id}`}
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
                  onDelete(project.id);
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
