'use client';

import { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Building2, Eye, MoreHorizontal, Shield } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AdminOrganization } from '@/lib/types';

interface OrganizationsColumnsProps {
  onView: (id: string) => void;
  onBlock: (id: string) => void;
}

export function createOrganizationsColumns({
  onBlock,
}: OrganizationsColumnsProps): ColumnDef<AdminOrganization>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={value => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-8 px-2"
        >
          Organization
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.imageUrl ? (
            <Image
              src={row.original.imageUrl}
              alt={row.original.name}
              width={32}
              height={32}
              className="rounded-md"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div>
            <div className="font-medium">{row.original.name}</div>
            {row.original.slug && (
              <div className="text-xs text-muted-foreground">@{row.original.slug}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'isPersonal',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant={row.original.isPersonal ? 'secondary' : 'default'}>
          {row.original.isPersonal ? 'Personal' : 'Team'}
        </Badge>
      ),
    },
    {
      accessorKey: 'membersCount',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-8 px-2"
        >
          Members
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-center">{row.original.membersCount.toLocaleString()}</div>
      ),
    },
    {
      accessorKey: 'projectsCount',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-8 px-2"
        >
          Projects
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-center">{row.original.projectsCount.toLocaleString()}</div>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-8 px-2"
        >
          Created
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(row.original.id)}>
              Copy organization ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-full justify-start px-2 text-sm"
                asChild
              >
                <Link href={`/admin/organizations/${row.original.id}`}>
                  <Eye className="mr-2 h-3 w-3" />
                  View Details
                </Link>
              </Button>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onBlock(row.original.id)}>
              <Shield className="mr-2 h-3 w-3" />
              Block Organization
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}
