'use client';

import { useOrganization, useOrganizationList } from '@clerk/nextjs';
import { Loader2, Plus, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CreateOrganizationDialog } from '@/components/create-organization-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganizationInvitations } from '@/hooks/use-organization-invitations';
import { useOrganizationSettings } from '@/hooks/use-organization-settings';

interface OrganizationSwitcherComponentProps {
  onClose?: () => void;
}

export function OrganizationSwitcherComponent({ onClose }: OrganizationSwitcherComponentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { organization } = useOrganization();

  // Get the current org settings tab to preserve when switching orgs
  const getOrgSettingsPath = (orgSlug: string | null) => {
    const orgSettingsMatch = pathname.match(/^\/organizations\/[^/]+(?:\/(.+))?$/);
    if (orgSettingsMatch) {
      const tab = orgSettingsMatch[1]; // 'members', 'usage', or undefined (general)
      return `/organizations/${orgSlug}${tab ? `/${tab}` : ''}`;
    }
    return `/organizations/${orgSlug}`;
  };
  const { createOrganization, isCreating } = useOrganizationSettings();
  const { invitations, acceptInvitation, acceptingInvitationId } = useOrganizationInvitations();
  const {
    userMemberships,
    isLoaded: isListLoaded,
    setActive,
  } = useOrganizationList({
    userMemberships: {
      infinite: true,
    },
  });
  const [isSwitching, setIsSwitching] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const isOrgLoaded = organization !== undefined;

  // Auto-select first available organization if none is active
  useEffect(() => {
    if (
      !isOrgLoaded ||
      !isListLoaded ||
      !setActive ||
      organization ||
      isSwitching ||
      userMemberships.isLoading
    )
      return;

    const firstOrg = userMemberships.data?.[0];
    if (firstOrg) {
      console.debug('Auto-selecting first org:', firstOrg.organization.name);
      setIsSwitching(true);
      setActive({ organization: firstOrg.organization.id })
        .then(() => {
          router.refresh();
        })
        .catch(error => {
          console.error('Failed to auto-select organization:', error);
        })
        .finally(() => {
          setIsSwitching(false);
        });
    }
  }, [isOrgLoaded, isListLoaded, organization, userMemberships, setActive, router, isSwitching]);

  const handleSwitch = async (orgId: string, redirectTo?: string) => {
    if (!setActive || isSwitching) return;

    setIsSwitching(true);
    onClose?.();
    try {
      await setActive({ organization: orgId });
      router.replace(redirectTo ?? '/projects');
    } catch (error) {
      console.error('Failed to switch organization:', error);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleCreateOrganization = async (data: { name: string }) => {
    await createOrganization(data);
    setCreateDialogOpen(false);
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    onClose?.(); // Close the dropdown immediately for better UX
    await acceptInvitation(invitationId);
  };

  if (!isOrgLoaded || !isListLoaded || userMemberships.isLoading) {
    return (
      <div className="px-2 py-1.5">
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const currentOrgName = organization
    ? organization.publicMetadata?.isPersonal
      ? 'Personal Workspace'
      : organization.name
    : 'No organization';
  const currentOrgImage = organization?.imageUrl;
  const hasOrganizations = userMemberships.data && userMemberships.data.length > 0;

  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
        Organization
      </DropdownMenuLabel>

      {hasOrganizations ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer">
            <Avatar className="h-5 w-5 mr-2">
              <AvatarImage src={currentOrgImage} alt={currentOrgName} />
              <AvatarFallback className="text-xs">
                {currentOrgName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm">{currentOrgName}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56 p-1" sideOffset={8} alignOffset={-4}>
            {/* Current Organization */}
            {organization && (
              <>
                <div className="relative">
                  <div className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm bg-accent/50">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={organization.imageUrl} alt={currentOrgName} />
                      <AvatarFallback className="text-xs">
                        {currentOrgName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{currentOrgName}</p>
                    </div>
                    <Link
                      href={`/organizations/${organization.slug}`}
                      className="p-1 rounded-sm hover:bg-accent transition-colors"
                      onClick={() => onClose?.()}
                    >
                      <Settings className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </Link>
                  </div>
                </div>
                {userMemberships.data?.some(m => m.organization.id !== organization.id) && (
                  <DropdownMenuSeparator className="my-1" />
                )}
              </>
            )}

            {/* Other Organizations */}
            {userMemberships.data
              ?.filter(membership => membership.organization.id !== organization?.id)
              .map(membership => {
                const displayName = membership.organization.publicMetadata?.isPersonal
                  ? 'Personal Workspace'
                  : membership.organization.name;
                return (
                  <div
                    key={membership.organization.id}
                    className="relative flex items-center px-2 py-1.5 rounded-sm hover:bg-accent transition-colors"
                  >
                    <button
                      onClick={() => handleSwitch(membership.organization.id)}
                      disabled={isSwitching}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={membership.organization.imageUrl} alt={displayName} />
                        <AvatarFallback className="text-xs">
                          {displayName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{displayName}</p>
                      </div>
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleSwitch(
                          membership.organization.id,
                          getOrgSettingsPath(membership.organization.slug)
                        );
                      }}
                      disabled={isSwitching}
                      className="p-1.5 -mr-1 rounded-sm hover:bg-accent-foreground/10 transition-colors"
                    >
                      <Settings className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                );
              })}
            {userMemberships.data?.some(m => m.organization.id !== organization?.id) && (
              <DropdownMenuSeparator className="my-1" />
            )}

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <>
                {invitations.map(invitation => {
                  const invitationDisplayName = invitation.organizationIsPersonal
                    ? 'Personal Workspace'
                    : invitation.organizationName || 'Organization';
                  return (
                    <div key={invitation.id} className="relative">
                      <button
                        onClick={() => handleAcceptInvitation(invitation.id)}
                        disabled={acceptingInvitationId === invitation.id}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent transition-colors text-left"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage
                            src={invitation.organizationImageUrl}
                            alt={invitationDisplayName}
                          />
                          <AvatarFallback className="text-xs">
                            {invitationDisplayName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{invitationDisplayName}</p>
                        </div>
                        {acceptingInvitationId === invitation.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <span className="text-xs text-primary">Join</span>
                        )}
                      </button>
                    </div>
                  );
                })}
                <DropdownMenuSeparator className="my-1" />
              </>
            )}

            <Button
              variant="ghost"
              onClick={() => setCreateDialogOpen(true)}
              className="w-full justify-start px-2 py-1.5 h-auto font-normal text-sm text-muted-foreground hover:text-foreground"
            >
              <div className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center mr-2">
                <Plus className="h-3 w-3" />
              </div>
              <span>Create organization</span>
            </Button>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : (
        <div className="px-2 py-2">
          <p className="text-xs text-muted-foreground mb-3">
            No workspace found. Try signing out and back in, or create one manually.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            <span>Create Workspace</span>
          </Button>
        </div>
      )}

      <CreateOrganizationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreateOrganization={handleCreateOrganization}
        isCreating={isCreating}
      />
    </>
  );
}
