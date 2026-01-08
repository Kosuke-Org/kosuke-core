'use client';

import { ORG_ROLES } from '@/lib/types/clerk';
import { useOrganization } from '@clerk/nextjs';
import { Copy, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganizationSettings } from '@/hooks/use-organization-settings';

export default function OrganizationGeneralPage() {
  const { organization, membership } = useOrganization();
  const {
    uploadLogo,
    isUploadingLogo,
    deleteLogo,
    isDeletingLogo,
    deleteOrganization,
    isDeleting,
    leaveOrganization,
    isLeaving,
  } = useOrganizationSettings();

  const [copiedField, setCopiedField] = useState<'name' | 'id' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoaded = organization !== undefined;

  if (!isLoaded) {
    return <OrganizationGeneralSkeleton />;
  }

  if (!organization) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Organization not found</p>
        </CardContent>
      </Card>
    );
  }

  const isPersonal = organization.publicMetadata?.isPersonal === true;
  const isAdmin = membership?.role === ORG_ROLES.ADMIN;
  const displayName = isPersonal ? 'Personal Workspace' : organization.name;

  const copyToClipboard = async (text: string, field: 'name' | 'id') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (_error) {
      // Silent fail
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadLogo({ file });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleLeave = async () => {
    if (!organization) return;
    await leaveOrganization(organization.id);
  };

  const handleDelete = async () => {
    if (!organization) return;
    await deleteOrganization(organization.id);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization Profile</CardTitle>
          <CardDescription>Update your organization information and settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20 shrink-0">
              <AvatarImage src={organization.imageUrl} alt={displayName} />
              <AvatarFallback className="text-2xl">
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isUploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  {isUploadingLogo ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload image
                    </>
                  )}
                </Button>
                {organization.imageUrl && organization.imageUrl.trim() && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isDeletingLogo}
                    onClick={deleteLogo}
                    type="button"
                  >
                    {isDeletingLogo ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Removing...
                      </>
                    ) : (
                      'Remove'
                    )}
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Recommend size 1:1, up to 2mb</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Organization Name</Label>
              <div className="relative">
                <Input value={displayName} disabled className="pr-10" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => copyToClipboard(displayName, 'name')}
                >
                  <Copy
                    className={`h-4 w-4 transition-colors ${
                      copiedField === 'name'
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Organization ID</Label>
              <div className="relative">
                <Input value={organization.id} disabled className="font-mono text-xs pr-10" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => copyToClipboard(organization.id, 'id')}
                >
                  <Copy
                    className={`h-4 w-4 transition-colors ${
                      copiedField === 'id'
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Input value={isPersonal ? 'Personal Workspace' : 'Team Organization'} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      {!isPersonal && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible actions for this organization.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isAdmin && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Leave organization</p>
                  <p className="text-sm text-muted-foreground">
                    Remove yourself from this organization
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">Leave organization</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Leave Organization?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You will lose access to this organization and all its projects.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleLeave} disabled={isLeaving}>
                        {isLeaving ? 'Leaving...' : 'Leave organization'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {isAdmin && (
              <>
                {!isAdmin && <Separator />}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Delete organization</p>
                    <p className="text-sm text-muted-foreground">
                      Permanently delete this organization and all its data
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={isDeleting}>
                        {isDeleting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          'Delete organization'
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Organization?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete {displayName} and all its data. This action
                          cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>
                          Delete organization
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OrganizationGeneralSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar and upload section */}
          <div className="flex items-center gap-6">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="flex gap-3">
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-9 w-24" />
              </div>
              <Skeleton className="h-3 w-48" />
            </div>
          </div>

          {/* Separator */}
          <Skeleton className="h-px w-full" />

          {/* Form fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger zone skeleton */}
      <Card className="border-destructive/50">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-10 w-40" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
