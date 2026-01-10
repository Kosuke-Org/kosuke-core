// Requirements gathering types

// Requirements message type for chat
export interface RequirementsMessage {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  blocks?: Array<{ type: string; content: string }>;
  timestamp: Date;
}

// API response for requirements messages
export interface RequirementsMessagesResponse {
  messages: RequirementsMessage[];
}

// API response for requirements document
export interface RequirementsDocsResponse {
  docs: string;
}

// View mode for in_development status
export type RequirementsViewMode = 'game' | 'docs';

// Props for requirements-specific preview components
export interface RequirementsPreviewProps {
  projectId: string;
  content?: string;
  className?: string;
  // Sidebar toggle props
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
  // Confirm requirements props
  onConfirmRequirements?: () => void;
  canConfirm?: boolean;
  isConfirming?: boolean;
}

export interface InDevelopmentPreviewProps {
  content?: string;
  viewMode: RequirementsViewMode;
  onViewModeChange: (mode: RequirementsViewMode) => void;
  className?: string;
  /** Project status for dynamic badge display */
  projectStatus?: 'requirements_ready' | 'environments_ready' | 'paid' | 'in_development';
  // Sidebar toggle props
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
  // Switch to environment view (only for requirements_ready status)
  onSwitchToEnvironment?: () => void;
}

// View mode for requirements_ready status
export type EnvironmentViewMode = 'environment' | 'docs';

export interface EnvironmentsPreviewProps {
  projectId: string;
  className?: string;
  // Sidebar toggle props
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
  // Confirm environment props
  onConfirmEnvironment?: () => void;
  isConfirming?: boolean;
  // Requirements content for docs view
  requirementsContent?: string;
}

export interface WaitingForPaymentPreviewProps {
  stripeInvoiceUrl?: string | null;
  className?: string;
  // Sidebar toggle props
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
}
