import {
  ORG_ROLES,
  type ClerkOrganization,
  type ClerkUser,
  type OrganizationInvitationStatus,
  type OrganizationMembershipRole,
  type UpdateUserData,
} from '@/lib/types/clerk';
import { createClerkClient } from '@clerk/nextjs/server';

// Internal metadata types (not exported - hidden from consumers)
interface UserPrivateMetadata {
  marketingEmails?: boolean;
  onboardingCompleted?: boolean;
}

interface OrgPublicMetadata {
  isPersonal?: boolean;
}

export class ClerkService {
  private client: ReturnType<typeof createClerkClient>;

  constructor() {
    this.client = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
  }

  // ============================================
  // USER OPERATIONS
  // ============================================

  /**
   * Get user - returns clean domain object (metadata hidden)
   */
  async getUser(userId: string): Promise<ClerkUser> {
    const user = await this.client.users.getUser(userId);
    const privateMetadata = (user.privateMetadata || {}) as UserPrivateMetadata;

    // Get primary email
    const primaryEmail = user.emailAddresses.find(
      email => email.id === user.primaryEmailAddressId
    )?.emailAddress;

    if (!primaryEmail) {
      throw new Error(`No primary email found for user: ${userId}`);
    }

    // Construct full name
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();

    return {
      id: user.id,
      email: primaryEmail,
      name: fullName || null,
      imageUrl: user.imageUrl,
      marketingEmails: privateMetadata.marketingEmails || false,
      onboardingCompleted: privateMetadata.onboardingCompleted || false,
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    };
  }

  /**
   * Update user image - uses Clerk's native image hosting
   */
  async updateUserImage(userId: string, file: File): Promise<void> {
    await this.client.users.updateUserProfileImage(userId, { file });
  }

  /**
   * Update user - handles name and metadata internally
   */
  async updateUser(userId: string, data: UpdateUserData): Promise<ClerkUser> {
    const updates: {
      firstName?: string;
      lastName?: string;
      privateMetadata?: Record<string, unknown>;
    } = {};

    // Handle name updates directly
    if (data.firstName !== undefined) {
      updates.firstName = data.firstName;
    }

    if (data.lastName !== undefined) {
      updates.lastName = data.lastName;
    }

    // Handle metadata updates
    const currentUser = await this.client.users.getUser(userId);
    const metadataUpdates: UserPrivateMetadata = {};

    if (data.marketingEmails !== undefined) {
      metadataUpdates.marketingEmails = data.marketingEmails;
    }

    if (data.onboardingCompleted !== undefined) {
      metadataUpdates.onboardingCompleted = data.onboardingCompleted;
    }

    if (Object.keys(metadataUpdates).length > 0) {
      updates.privateMetadata = {
        ...(currentUser.privateMetadata || {}),
        ...metadataUpdates,
      };
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      await this.client.users.updateUser(userId, updates);
    }

    // Return updated user
    return this.getUser(userId);
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<void> {
    await this.client.users.deleteUser(userId);
  }

  /**
   * Get user organization memberships
   */
  async getUserMemberships(userId: string) {
    return await this.client.users.getOrganizationMembershipList({ userId });
  }

  /**
   * Check if user has any organizations
   */
  async userHasOrganizations(userId: string): Promise<boolean> {
    const memberships = await this.client.users.getOrganizationMembershipList({ userId });
    return memberships.data.length > 0;
  }

  /**
   * Check if user is admin of organization
   */
  async isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
    const memberships = await this.client.users.getOrganizationMembershipList({ userId });
    const membership = memberships.data.find(m => m.organization.id === orgId);
    return membership?.role === ORG_ROLES.ADMIN;
  }

  /**
   * Check if user is member of organization (any role)
   */
  async isOrgMember(userId: string, orgId: string): Promise<boolean> {
    const memberships = await this.client.users.getOrganizationMembershipList({ userId });
    return memberships.data.some(m => m.organization.id === orgId);
  }

  /**
   * Mark user onboarding as complete
   */
  async markOnboardingComplete(userId: string): Promise<void> {
    await this.updateUser(userId, { onboardingCompleted: true });
  }

  /**
   * Check if user has completed onboarding
   */
  async hasCompletedOnboarding(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    return user.onboardingCompleted;
  }

  // ============================================
  // ORGANIZATION OPERATIONS
  // ============================================

  /**
   * Get organization - returns clean domain object (metadata hidden)
   */
  async getOrganization(orgId: string): Promise<ClerkOrganization> {
    const org = await this.client.organizations.getOrganization({
      organizationId: orgId,
    });
    const publicMetadata = (org.publicMetadata || {}) as OrgPublicMetadata;

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      imageUrl: org.imageUrl || '',
      createdBy: org.createdBy || '',
      isPersonal: publicMetadata.isPersonal || false,
      createdAt: new Date(org.createdAt),
      updatedAt: new Date(org.updatedAt),
    };
  }

  /**
   * Update organization metadata for ownership transfers
   */
  async updateOrganizationTransfer(
    orgId: string,
    transferData: { from: string; to: string }
  ): Promise<void> {
    const org = await this.client.organizations.getOrganization({
      organizationId: orgId,
    });

    await this.client.organizations.updateOrganization(orgId, {
      publicMetadata: {
        ...(org.publicMetadata || {}),
        transferredFrom: transferData.from,
        transferredTo: transferData.to,
        transferredAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Delete organization
   */
  async deleteOrganization(orgId: string): Promise<void> {
    await this.client.organizations.deleteOrganization(orgId);
  }

  /**
   * Get organization members
   */
  async getOrganizationMembers(orgId: string) {
    return await this.client.organizations.getOrganizationMembershipList({
      organizationId: orgId,
    });
  }

  /**
   * Update organization member role
   */
  async updateMemberRole(
    orgId: string,
    userId: string,
    role: OrganizationMembershipRole
  ): Promise<void> {
    await this.client.organizations.updateOrganizationMembership({
      organizationId: orgId,
      userId,
      role,
    });
  }

  /**
   * Create organization
   */
  async createOrganization(params: {
    name: string;
    createdBy: string;
    isPersonal?: boolean;
    maxAllowedMemberships?: number;
  }) {
    return await this.client.organizations.createOrganization({
      name: params.name,
      createdBy: params.createdBy,
      maxAllowedMemberships: params.maxAllowedMemberships,
      publicMetadata: {
        isPersonal: params.isPersonal || false,
      },
    });
  }

  /**
   * Update organization logo
   */
  async updateOrganizationLogo(orgId: string, file: File): Promise<void> {
    await this.client.organizations.updateOrganizationLogo(orgId, { file });
  }

  /**
   * Delete organization membership
   */
  async deleteOrganizationMembership(orgId: string, userId: string): Promise<void> {
    await this.client.organizations.deleteOrganizationMembership({
      organizationId: orgId,
      userId,
    });
  }

  /**
   * Create organization invitation
   */
  async createOrganizationInvitation(params: {
    orgId: string;
    emailAddress: string;
    role: OrganizationMembershipRole;
    inviterUserId: string;
  }) {
    return await this.client.organizations.createOrganizationInvitation({
      organizationId: params.orgId,
      emailAddress: params.emailAddress,
      role: params.role,
      inviterUserId: params.inviterUserId,
    });
  }

  /**
   * Revoke organization invitation
   */
  async revokeOrganizationInvitation(orgId: string, invitationId: string): Promise<void> {
    await this.client.organizations.revokeOrganizationInvitation({
      organizationId: orgId,
      invitationId,
    });
  }

  /**
   * Get organization invitations
   */
  async getOrganizationInvitations(orgId: string, status?: OrganizationInvitationStatus[]) {
    return await this.client.organizations.getOrganizationInvitationList({
      organizationId: orgId,
      status,
    });
  }

  /**
   * List all organizations (paginated)
   */
  async listOrganizations(params?: {
    limit?: number;
    offset?: number;
    query?: string;
  }): Promise<{ data: ClerkOrganization[]; totalCount: number }> {
    const response = await this.client.organizations.getOrganizationList({
      limit: params?.limit,
      offset: params?.offset,
      query: params?.query,
    });

    const organizations = response.data.map(org => {
      const publicMetadata = (org.publicMetadata || {}) as OrgPublicMetadata;

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        imageUrl: org.imageUrl || '',
        createdBy: org.createdBy || '',
        isPersonal: publicMetadata.isPersonal || false,
        createdAt: new Date(org.createdAt),
        updatedAt: new Date(org.updatedAt),
      };
    });

    return {
      data: organizations,
      totalCount: response.totalCount,
    };
  }
}
