'use client';

import { useAuth, useOrganization } from '@clerk/nextjs';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Mail,
  MoreVertical,
  Repeat,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganizationMembers } from '@/hooks/use-organization-members';

const ITEMS_PER_PAGE = 10;

export default function OrganizationMembersPage() {
  const { userId } = useAuth();
  const { organization, isLoaded, membership, memberships, invitations } = useOrganization({
    memberships: {
      pageSize: ITEMS_PER_PAGE,
    },
    invitations: {
      pageSize: ITEMS_PER_PAGE,
    },
  });
  const {
    inviteMember,
    isInvitingMember,
    removeMember,
    removingMemberId,
    revokeInvitation,
    revokingInvitationId,
    transferOwnership,
    isTransferringOwnership,
    updateMemberRole,
    updatingRoleUserId,
  } = useOrganizationMembers();

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'org:admin' | 'org:member'>('org:member');
  const [transferringUserId, setTransferringUserId] = useState<string | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  if (!isLoaded) {
    return <OrganizationMembersSkeleton />;
  }

  if (!organization) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Organization not found</p>
        </CardContent>
      </Card>
    );
  }

  const isPersonal = organization.publicMetadata?.isPersonal === true;
  const isAdmin = membership?.role === 'org:admin';
  const displayName = isPersonal ? 'Personal Workspace' : organization.name;

  // Get creator ID from organization metadata, fallback to checking if user is admin
  // (since we only have single admin model, admin = owner)
  const creatorId = organization.publicMetadata?.creatorId as string | undefined;
  const isCreator = creatorId ? userId === creatorId : isAdmin;

  const handleInviteMember = async () => {
    await inviteMember({
      email: inviteEmail,
      organizationId: organization.id,
      role: inviteRole,
    });
    setInviteEmail('');
    setInviteRole('org:member');
    setInviteDialogOpen(false);
    invitations?.revalidate?.();
  };

  const handleRevokeInvite = async (inviteId: string) => {
    await revokeInvitation({
      invitationId: inviteId,
      organizationId: organization.id,
    });
    invitations?.revalidate?.();
  };

  const handleRemoveMember = async (userId: string | undefined) => {
    if (!userId) return;
    await removeMember({
      userId,
      organizationId: organization.id,
    });
    memberships?.revalidate?.();
  };

  const openTransferDialog = (userId: string, memberName: string) => {
    setTransferTarget({ userId, name: memberName });
    setTransferDialogOpen(true);
  };

  const handleTransferOwnership = async () => {
    if (!transferTarget) return;

    setTransferringUserId(transferTarget.userId);
    setTransferDialogOpen(false);

    try {
      await transferOwnership({
        newOwnerId: transferTarget.userId,
        organizationId: organization.id,
      });
      memberships?.revalidate?.();
    } finally {
      setTransferringUserId(null);
      setTransferTarget(null);
    }
  };

  const handleUpdateRole = async (targetUserId: string, newRole: 'org:admin' | 'org:member') => {
    await updateMemberRole({
      userId: targetUserId,
      organizationId: organization.id,
      role: newRole,
    });
    memberships?.revalidate?.();
  };

  // Calculate total pages
  const totalMembersPages = Math.ceil((memberships?.count ?? 0) / ITEMS_PER_PAGE);
  const totalInvitationsPages = Math.ceil((invitations?.count ?? 0) / ITEMS_PER_PAGE);

  // Check if a member has any pending operation
  const isMemberBusy = (memberId: string | undefined) =>
    memberId &&
    (removingMemberId === memberId ||
      transferringUserId === memberId ||
      updatingRoleUserId === memberId);

  return (
    <div className="space-y-6">
      {/* Transfer Ownership Confirmation Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Ownership</DialogTitle>
            <DialogDescription>
              Transfer organization ownership to <strong>{transferTarget?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
            <p className="text-sm text-muted-foreground">
              You will lose admin privileges and become a regular member. This action cannot be
              undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleTransferOwnership}
              disabled={isTransferringOwnership}
            >
              {isTransferringOwnership ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Transferring...
                </>
              ) : (
                'Transfer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <CardTitle>Members</CardTitle>
              <CardDescription>
                {isPersonal
                  ? 'Personal workspaces are limited to one member'
                  : 'Manage who has access to this organization'}
              </CardDescription>
            </div>
            {!isPersonal && isAdmin && (
              <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Mail className="h-4 w-4 mr-2" />
                    Invite member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite Member</DialogTitle>
                    <DialogDescription>Send an invitation to join {displayName}.</DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="inviteEmail">Email Address</Label>
                        <Input
                          id="inviteEmail"
                          type="email"
                          placeholder="colleague@example.com"
                          value={inviteEmail}
                          onChange={e => setInviteEmail(e.target.value)}
                        />
                      </div>
                      <div className="w-28 space-y-2">
                        <Label htmlFor="inviteRole">Role</Label>
                        <Select
                          value={inviteRole}
                          onValueChange={value =>
                            setInviteRole(value as 'org:admin' | 'org:member')
                          }
                        >
                          <SelectTrigger id="inviteRole">
                            <SelectValue placeholder="Role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="org:member">Member</SelectItem>
                            <SelectItem value="org:admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleInviteMember}
                      disabled={isInvitingMember || !inviteEmail.trim()}
                    >
                      {isInvitingMember ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Send Invitation'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Members Section */}
          {memberships?.data && memberships.data.length > 0 ? (
            <>
              <div className="space-y-0">
                {memberships.data.map((member, index) => (
                  <div key={member.id}>
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage
                            src={member.publicUserData?.imageUrl}
                            alt={
                              member.publicUserData?.firstName ||
                              member.publicUserData?.identifier ||
                              'User'
                            }
                          />
                          <AvatarFallback>
                            {member.publicUserData?.firstName?.charAt(0) ||
                              member.publicUserData?.identifier?.charAt(0) ||
                              'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {member.publicUserData?.firstName && member.publicUserData?.lastName
                                ? `${member.publicUserData.firstName} ${member.publicUserData.lastName}`
                                : member.publicUserData?.identifier || 'Unknown User'}
                            </p>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                                member.role === 'org:admin'
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {member.role === 'org:admin' ? 'Admin' : 'Member'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {member.publicUserData?.identifier}
                          </p>
                        </div>
                      </div>
                      {isAdmin &&
                        member.publicUserData?.userId &&
                        member.publicUserData.userId !== userId &&
                        !isPersonal && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0"
                                disabled={
                                  isMemberBusy(member.publicUserData?.userId) ||
                                  isTransferringOwnership
                                }
                              >
                                {isMemberBusy(member.publicUserData?.userId) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {/* Only show transfer option if current user is creator/admin */}
                              {/* Role change option */}
                              {member.role === 'org:member' ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleUpdateRole(member.publicUserData!.userId!, 'org:admin')
                                  }
                                >
                                  <Shield className="h-4 w-4 mr-2" />
                                  Make Admin
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleUpdateRole(member.publicUserData!.userId!, 'org:member')
                                  }
                                >
                                  <Shield className="h-4 w-4 mr-2" />
                                  Make Member
                                </DropdownMenuItem>
                              )}
                              {isCreator && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    const memberName =
                                      member.publicUserData?.firstName &&
                                      member.publicUserData?.lastName
                                        ? `${member.publicUserData.firstName} ${member.publicUserData.lastName}`
                                        : member.publicUserData?.identifier || 'this member';
                                    openTransferDialog(member.publicUserData!.userId!, memberName);
                                  }}
                                >
                                  <Repeat className="h-4 w-4 mr-2" />
                                  Transfer Ownership
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleRemoveMember(member.publicUserData?.userId)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                    </div>
                    {index < memberships.data.length - 1 && <Separator />}
                  </div>
                ))}
              </div>

              {/* Members Pagination */}
              {(memberships.hasPreviousPage || memberships.hasNextPage) && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">
                    Showing {memberships.data.length} of {memberships.count ?? 0} members
                    {totalMembersPages > 1 && ` (${totalMembersPages} pages)`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => memberships.fetchPrevious?.()}
                      disabled={!memberships.hasPreviousPage || memberships.isFetching}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => memberships.fetchNext?.()}
                      disabled={!memberships.hasNextPage || memberships.isFetching}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No members found</p>
            </div>
          )}

          {/* Pending Invitations Section */}
          {!isPersonal && invitations?.data && invitations.data.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium mb-3">Pending Invitations</h3>
                <div className="space-y-0">
                  {invitations.data.map((invite, index) => (
                    <div key={invite.id}>
                      <div className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            <Mail className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{invite.emailAddress}</p>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                                  invite.role === 'org:admin'
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {invite.role === 'org:admin' ? 'Admin' : 'Member'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>Pending</span>
                            </div>
                          </div>
                        </div>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRevokeInvite(invite.id)}
                            disabled={revokingInvitationId === invite.id}
                          >
                            {revokingInvitationId === invite.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            )}
                          </Button>
                        )}
                      </div>
                      {index < invitations.data.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>

                {/* Invitations Pagination */}
                {(invitations.hasPreviousPage || invitations.hasNextPage) && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {invitations.data.length} of {invitations.count ?? 0} invitations
                      {totalInvitationsPages > 1 && ` (${totalInvitationsPages} pages)`}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => invitations.fetchPrevious?.()}
                        disabled={!invitations.hasPreviousPage || invitations.isFetching}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => invitations.fetchNext?.()}
                        disabled={!invitations.hasNextPage || invitations.isFetching}
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OrganizationMembersSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
