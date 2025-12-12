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
