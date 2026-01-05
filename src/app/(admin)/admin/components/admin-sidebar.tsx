'use client';

import { ArrowLeft, Building2, Database, Megaphone, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { NavUser } from './nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  isActive?: boolean;
}

export function AdminSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();

  const navItems: NavItem[] = React.useMemo(
    () => [
      {
        title: 'Organizations',
        url: '/admin/organizations',
        icon: Building2,
        isActive: pathname?.startsWith('/admin/organizations'),
      },
      {
        title: 'Projects',
        url: '/admin/projects',
        icon: Database,
        isActive: pathname?.startsWith('/admin/projects'),
      },
      {
        title: 'Chat Sessions',
        url: '/admin/chat-sessions',
        icon: MessageSquare,
        isActive: pathname?.startsWith('/admin/chat-sessions'),
      },
      {
        title: 'Updates',
        url: '/admin/updates',
        icon: Megaphone,
        isActive: pathname?.startsWith('/admin/updates'),
      },
    ],
    [pathname]
  );

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <span className="text-sm font-semibold text-primary-foreground">K</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Admin Panel</span>
            <span className="text-xs text-muted-foreground">System Management</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Back to Kosuke">
                <Link href="/">
                  <ArrowLeft />
                  <span>Back to Kosuke</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map(item => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title} isActive={item.isActive}>
                  <Link href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
