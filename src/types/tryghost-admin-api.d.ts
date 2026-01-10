declare module '@tryghost/admin-api' {
  interface GhostAdminAPIOptions {
    url: string;
    key: string;
    version: string;
  }

  interface GhostMember {
    id: string;
    uuid: string;
    email: string;
    name: string | null;
    note: string | null;
    subscribed: boolean;
    created_at: string;
    updated_at: string;
    labels: Array<{ id: string; name: string; slug: string }>;
    newsletters: Array<{ id: string; name: string }>;
  }

  interface GhostMemberInput {
    email: string;
    name?: string;
    note?: string;
    subscribed?: boolean;
    labels?: Array<{ name: string }>;
    newsletters?: Array<{ id: string }>;
  }

  interface MembersAPI {
    add(member: GhostMemberInput): Promise<GhostMember>;
    edit(id: string, member: Partial<GhostMemberInput>): Promise<GhostMember>;
    delete(id: string): Promise<void>;
    browse(options?: { limit?: number; page?: number }): Promise<GhostMember[]>;
    read(data: { id: string } | { email: string }): Promise<GhostMember>;
  }

  class GhostAdminAPI {
    constructor(options: GhostAdminAPIOptions);
    members: MembersAPI;
  }

  export default GhostAdminAPI;
}
