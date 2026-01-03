// Re-export ProjectStatus from schema for type inference
export type { ProjectStatus } from '@/lib/db/schema';

// Project Creation and Update Types
export interface CreateProjectData {
  name: string;
  github: {
    type: 'create' | 'import';
    repositoryUrl?: string;
  };
}

// Project Creation Flow Types
export interface ProjectCreationStep {
  step: 'project-details' | 'github-setup' | 'creating' | 'complete';
  data?: Partial<CreateProjectData>;
  error?: string;
}

// Extended project type with owner GitHub status
// Used for checking if invited members can access imported projects
export interface ProjectWithOwnerStatus {
  ownerHasGithub?: boolean;
}
