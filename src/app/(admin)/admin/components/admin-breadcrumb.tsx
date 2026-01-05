'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Define human-readable names for routes
const routeNames: Record<string, string> = {
  organizations: 'Organizations',
  projects: 'Projects',
  'chat-sessions': 'Chat Sessions',
  updates: 'Updates',
  jobs: 'Jobs',
  cron: 'Cron',
};

interface AdminProject {
  id: string;
  name: string;
}

interface AdminChatSession {
  id: string;
  title: string;
}

interface AdminOrganization {
  id: string;
  name: string;
}

export function AdminBreadcrumb() {
  const pathname = usePathname();

  // Split the pathname and filter out empty strings and 'admin'
  const pathSegments = pathname.split('/').filter(segment => segment && segment !== 'admin');

  // Get the main section (projects, chat-sessions, logs)
  const mainSection = pathSegments[0];
  const itemId = pathSegments[1]; // ID of the specific item if viewing detail page

  // Fetch project name if we're on a project detail page
  const { data: projectData } = useQuery<{ projects: AdminProject[] }>({
    queryKey: ['admin-project-breadcrumb', itemId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/projects?search=${itemId}`);
      if (!response.ok) throw new Error('Failed to fetch project');
      const result = await response.json();
      return result.data;
    },
    enabled: mainSection === 'projects' && !!itemId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch chat session title if we're on a chat session detail page
  const { data: chatSessionData } = useQuery<{ chatSessions: AdminChatSession[] }>({
    queryKey: ['admin-chat-session-breadcrumb', itemId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/chat-sessions`);
      if (!response.ok) throw new Error('Failed to fetch chat session');
      const result = await response.json();
      return result.data;
    },
    enabled: mainSection === 'chat-sessions' && !!itemId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch organization name if we're on an organization detail page
  const { data: organizationData } = useQuery<{ organization: AdminOrganization }>({
    queryKey: ['admin-organization-breadcrumb', itemId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/organizations/${itemId}`);
      if (!response.ok) throw new Error('Failed to fetch organization');
      const result = await response.json();
      return result.data;
    },
    enabled: mainSection === 'organizations' && !!itemId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Don't show breadcrumbs for root admin page
  if (pathSegments.length === 0) {
    return null;
  }

  const breadcrumbItems: Array<{ href: string | null; name: string; isLast: boolean }> = [];

  // Add main section (Projects, Chat Sessions, Logs)
  const mainSectionName = routeNames[mainSection] || mainSection;
  breadcrumbItems.push({
    href: itemId ? `/admin/${mainSection}` : null,
    name: mainSectionName,
    isLast: !itemId,
  });

  // Add detail item if on a detail page
  if (itemId) {
    let itemName = itemId;

    if (mainSection === 'projects' && projectData?.projects) {
      const project = projectData.projects.find((p: AdminProject) => p.id === itemId);
      itemName = project?.name || itemId;
    } else if (mainSection === 'chat-sessions' && chatSessionData?.chatSessions) {
      const chatSession = chatSessionData.chatSessions.find(
        (s: AdminChatSession) => s.id === itemId
      );
      itemName = chatSession?.title || itemId;
    } else if (mainSection === 'organizations' && organizationData?.organization) {
      itemName = organizationData.organization.name || itemId;
    }

    breadcrumbItems.push({
      href: null,
      name: itemName,
      isLast: true,
    });
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbItems.map((item, index) => (
          <div key={`breadcrumb-${item.href}-${index}`} className="contents">
            <BreadcrumbItem>
              {item.isLast || item.href === null ? (
                <BreadcrumbPage>{item.name}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={item.href}>{item.name}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {!item.isLast && <BreadcrumbSeparator />}
          </div>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
