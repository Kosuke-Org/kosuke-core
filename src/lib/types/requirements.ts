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
  projectStatus?: 'requirements_ready' | 'paid' | 'in_development';
}

export interface WaitingForPaymentPreviewProps {
  stripeInvoiceUrl?: string | null;
  className?: string;
}
