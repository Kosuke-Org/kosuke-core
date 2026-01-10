export interface AdminOrganization {
  id: string;
  name: string;
  slug: string | null;
  imageUrl: string;
  isPersonal: boolean;
  isBeta: boolean;
  createdAt: Date;

  // Aggregated metrics
  membersCount: number;
  projectsCount: number;
}

export interface OrganizationStats {
  totalOrganizations: number;
  totalActiveProjects: number;
}
