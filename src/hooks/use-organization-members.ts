import { useOrganizationList } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useToast } from '@/hooks/use-toast';

interface InviteMemberParams {
  email: string;
  organizationId: string;
  role?: 'org:admin' | 'org:member';
}

interface RemoveMemberParams {
  userId: string;
  organizationId: string;
}

interface RevokeInvitationParams {
  invitationId: string;
  organizationId: string;
}

interface TransferOwnershipParams {
  newOwnerId: string;
  organizationId: string;
}

interface UpdateMemberRoleParams {
  userId: string;
  organizationId: string;
  role: 'org:admin' | 'org:member';
}

interface UseOrganizationMembersReturn {
  inviteMember: (params: InviteMemberParams) => Promise<void>;
  isInvitingMember: boolean;
  removeMember: (params: RemoveMemberParams) => Promise<void>;
  removingMemberId: string | null;
  revokeInvitation: (params: RevokeInvitationParams) => Promise<void>;
  revokingInvitationId: string | null;
  transferOwnership: (params: TransferOwnershipParams) => Promise<void>;
  isTransferringOwnership: boolean;
  updateMemberRole: (params: UpdateMemberRoleParams) => Promise<void>;
  updatingRoleUserId: string | null;
}

/**
 * Admin-side member management
 * Handles inviting, removing members, revoking invitations, and transferring ownership
 *
 * Note: This hook only needs minimal pagination since it only uses the revalidate() function
 * to refresh data after mutations. The actual member/invitation data is fetched separately
 * by consuming components (e.g., members page uses useOrganization with proper pagination).
 */
export function useOrganizationMembers(): UseOrganizationMembersReturn {
  const router = useRouter();
  const { toast } = useToast();
  const { userMemberships, userInvitations } = useOrganizationList({
    userMemberships: { pageSize: 1 }, // Minimal pagination - only need revalidate() function
    userInvitations: { pageSize: 1, status: 'pending' }, // Minimal pagination - only need revalidate() function
  });

  const [isInvitingMember, setIsInvitingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [revokingInvitationId, setRevokingInvitationId] = useState<string | null>(null);
  const [isTransferringOwnership, setIsTransferringOwnership] = useState(false);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);

  const inviteMember = async ({
    email,
    organizationId,
    role = 'org:member',
  }: InviteMemberParams) => {
    if (!email.trim()) {
      toast({
        title: 'Error',
        description: 'Email address is required',
        variant: 'destructive',
      });
      return;
    }

    setIsInvitingMember(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to invite member');
      }

      toast({
        title: 'Success',
        description: 'Invitation sent successfully',
      });

      // Revalidate to show new invitation
      await userInvitations.revalidate?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to invite member',
        variant: 'destructive',
      });
    } finally {
      setIsInvitingMember(false);
    }
  };

  const removeMember = async ({ userId, organizationId }: RemoveMemberParams) => {
    if (!userId) {
      toast({
        title: 'Error',
        description: 'User ID is required',
        variant: 'destructive',
      });
      return;
    }

    setRemovingMemberId(userId);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/members/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove member');
      }

      toast({
        title: 'Success',
        description: 'Member removed from organization',
      });

      // Revalidate memberships
      await userMemberships.revalidate?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove member',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setRemovingMemberId(null);
    }
  };

  const revokeInvitation = async ({ invitationId, organizationId }: RevokeInvitationParams) => {
    setRevokingInvitationId(invitationId);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/invitations/${invitationId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to revoke invitation');
      }

      toast({
        title: 'Success',
        description: 'Invitation revoked',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to revoke invitation',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setRevokingInvitationId(null);
    }
  };

  const transferOwnership = async ({ newOwnerId, organizationId }: TransferOwnershipParams) => {
    if (!newOwnerId) {
      toast({
        title: 'Error',
        description: 'New owner ID is required',
        variant: 'destructive',
      });
      return;
    }

    setIsTransferringOwnership(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/transfer-ownership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to transfer ownership');
      }

      toast({
        title: 'Success',
        description: 'Organization ownership transferred successfully',
      });

      // Revalidate memberships to reflect role changes
      await userMemberships.revalidate?.();

      // Refresh the page to update UI with new permissions
      router.refresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to transfer ownership',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsTransferringOwnership(false);
    }
  };

  const updateMemberRole = async ({ userId, organizationId, role }: UpdateMemberRoleParams) => {
    if (!userId) {
      toast({
        title: 'Error',
        description: 'User ID is required',
        variant: 'destructive',
      });
      return;
    }

    setUpdatingRoleUserId(userId);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update member role');
      }

      toast({
        title: 'Success',
        description: `Member role updated to ${role === 'org:admin' ? 'Admin' : 'Member'}`,
      });

      // Revalidate memberships to reflect role changes
      await userMemberships.revalidate?.();

      // Refresh the page to update UI
      router.refresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update member role',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setUpdatingRoleUserId(null);
    }
  };

  return {
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
  };
}
