'use client';

import { AdminSidebar } from './components/admin-sidebar';
import { AdminBreadcrumb } from './components/admin-breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <SidebarProvider>
        <AdminSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <AdminBreadcrumb />
            </div>
          </header>
          <div className="flex-1 space-y-8 p-8 pt-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
