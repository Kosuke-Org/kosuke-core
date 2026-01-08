'use client';

import { RefreshCw, Search, Shield } from 'lucide-react';
import { useState } from 'react';

import { DeleteProjectSection } from '@/app/(logged-in)/projects/components/delete-project-section';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import type { Project } from '@/lib/db/schema';

interface ProjectSettingsModalProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectDeleted?: () => void;
  isAdmin?: boolean;
}

export function ProjectSettingsModal({
  project,
  open,
  onOpenChange,
  onProjectDeleted,
  isAdmin = false,
}: ProjectSettingsModalProps) {
  // Maintenance toggles (UI only for now)
  const [syncRulesEnabled, setSyncRulesEnabled] = useState(false);
  const [analyzeEnabled, setAnalyzeEnabled] = useState(false);
  const [securityCheckEnabled, setSecurityCheckEnabled] = useState(false);

  // Track if deletion is in progress to prevent modal close
  const [isDeleting, setIsDeleting] = useState(false);

  // Handle modal close - prevent during deletion
  const handleOpenChange = (value: boolean) => {
    if (isDeleting) return;
    onOpenChange(value);
  };

  const handleProjectDeleted = () => {
    onOpenChange(false);
    onProjectDeleted?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] border border-border bg-card">
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Maintenance Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-foreground">Maintenance</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <Label htmlFor="sync-rules" className="text-sm font-medium">
                      Sync Rules
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically sync project rules
                    </p>
                  </div>
                </div>
                <Switch
                  id="sync-rules"
                  checked={syncRulesEnabled}
                  onCheckedChange={setSyncRulesEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <Label htmlFor="analyze" className="text-sm font-medium">
                      Analyze
                    </Label>
                    <p className="text-xs text-muted-foreground">Run code analysis on changes</p>
                  </div>
                </div>
                <Switch id="analyze" checked={analyzeEnabled} onCheckedChange={setAnalyzeEnabled} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <Label htmlFor="security-check" className="text-sm font-medium">
                      Security Check
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Scan for security vulnerabilities
                    </p>
                  </div>
                </div>
                <Switch
                  id="security-check"
                  checked={securityCheckEnabled}
                  onCheckedChange={setSecurityCheckEnabled}
                />
              </div>
            </div>
          </div>

          {isAdmin && (
            <>
              <Separator />

              {/* Danger Zone */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
                <DeleteProjectSection
                  project={project}
                  onProjectDeleted={handleProjectDeleted}
                  onDeletingChange={setIsDeleting}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
