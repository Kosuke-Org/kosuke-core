'use client';

import { AlertTriangle, RefreshCw, Search, Shield, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import DeleteProjectDialog from '@/app/(logged-in)/projects/components/delete-project-dialog';
import { useMaintenanceSettings } from '@/hooks/use-maintenance-settings';
import type { Project } from '@/lib/db/schema';

interface ProjectSettingsModalProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectDeleted?: () => void;
}

export function ProjectSettingsModal({
  project,
  open,
  onOpenChange,
  onProjectDeleted,
}: ProjectSettingsModalProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Use maintenance settings hook
  const { settings, isLoading, updateSettings, isUpdating } = useMaintenanceSettings(project.id);

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleToggle = (
    field: 'syncRulesEnabled' | 'analyzeEnabled' | 'securityCheckEnabled',
    value: boolean
  ) => {
    updateSettings({ [field]: value });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] border border-border bg-card">
          <DialogHeader>
            <DialogTitle>Project Settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Maintenance Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground">Maintenance</h3>

              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-4 w-4" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      </div>
                      <Skeleton className="h-5 w-9 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
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
                      checked={settings?.syncRulesEnabled ?? false}
                      onCheckedChange={checked => handleToggle('syncRulesEnabled', checked)}
                      disabled={isUpdating}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <div className="space-y-0.5">
                        <Label htmlFor="analyze" className="text-sm font-medium">
                          Analyze
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Run code analysis on changes
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="analyze"
                      checked={settings?.analyzeEnabled ?? false}
                      onCheckedChange={checked => handleToggle('analyzeEnabled', checked)}
                      disabled={isUpdating}
                    />
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
                      checked={settings?.securityCheckEnabled ?? false}
                      onCheckedChange={checked => handleToggle('securityCheckEnabled', checked)}
                      disabled={isUpdating}
                    />
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Danger Zone */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Delete Project</p>
                      <p className="text-xs text-muted-foreground">
                        Permanently delete this project and all associated data. This action cannot
                        be undone.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteClick}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Project
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteProjectDialog
        project={project}
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onProjectDeleted={() => {
          setShowDeleteDialog(false);
          onOpenChange(false);
          onProjectDeleted?.();
        }}
      />
    </>
  );
}
