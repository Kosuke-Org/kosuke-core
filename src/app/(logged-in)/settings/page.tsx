'use client';

import { ExternalLink, Github, Info, Loader2, Unlink, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useGitHubOAuth } from '@/hooks/use-github-oauth';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUser as useClerkUser } from '@clerk/nextjs';

const GITHUB_APP_SLUG = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'kosuke-github-app';
const GITHUB_APP_INSTALL_URL = `https://github.com/apps/${GITHUB_APP_SLUG}`;

export default function SettingsPage() {
  const {
    clerkUser,
    isLoading,
    imageUrl,
    displayName,
    initials,
    updateProfile,
    updateProfileImage,
  } = useUser();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const clerk = (clerkUser || null) as {
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
    emailAddresses?: Array<{ emailAddress: string }>;
  } | null;

  // Form state
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  const {
    isConnected: isGitHubConnected,
    isConnecting: isConnectingGitHub,
    isDisconnecting,
    connectGitHub,
    disconnectGitHub,
    clearConnectingState,
    githubAccount,
    refetch: refetchGitHubStatus,
  } = useGitHubOAuth();

  // Show success toast when redirected back from GitHub OAuth
  const hasShownToastRef = useRef(false);
  const hasRefetchedRef = useRef(false);

  // Force refetch when redirected back from GitHub OAuth to get fresh data
  useEffect(() => {
    if (searchParams.get('githubConnected') === 'true' && !hasRefetchedRef.current) {
      hasRefetchedRef.current = true;
      // Clear the connecting state and force a refetch to get fresh data
      clearConnectingState();
      refetchGitHubStatus();
    }
  }, [searchParams, clearConnectingState, refetchGitHubStatus]);

  // Show toast and clean up URL after confirming GitHub is connected
  useEffect(() => {
    if (
      searchParams.get('githubConnected') === 'true' &&
      isGitHubConnected &&
      !hasShownToastRef.current
    ) {
      hasShownToastRef.current = true;

      toast({
        title: 'GitHub Connected',
        description: 'Your GitHub account has been successfully connected.',
      });

      // Clean up URL without reloading the page
      const url = new URL(window.location.href);
      url.searchParams.delete('githubConnected');
      router.replace(url.pathname, { scroll: false });
    }
  }, [searchParams, isGitHubConnected, router, toast]);

  // Track name changes
  const [hasNameChanged, setHasNameChanged] = useState(false);
  const initialFirstName = clerk?.firstName || '';
  const initialLastName = clerk?.lastName || '';

  // Get Clerk user for external accounts
  const { user: clerkUserFull } = useClerkUser();

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Show preview immediately
      const reader = new window.FileReader();
      reader.onload = e => {
        setPreviewImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Auto-submit the image
      setIsImageUploading(true);

      try {
        await updateProfileImage(file);
      } catch (error) {
        console.error('Failed to update profile image:', error);
      } finally {
        setIsImageUploading(false);
      }
    }
  };

  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      await updateProfile(formData);
      setHasNameChanged(false); // Reset change tracking after successful save
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const currentFirstName = name === 'firstName' ? value : formRef.current?.firstName?.value || '';
    const currentLastName = name === 'lastName' ? value : formRef.current?.lastName?.value || '';

    const hasChanged = currentFirstName !== initialFirstName || currentLastName !== initialLastName;

    setHasNameChanged(hasChanged);
  };

  const openDisconnectDialog = () => {
    if (!isGitHubConnected) return;
    setDisconnectDialogOpen(true);
  };

  const handleDisconnect = async () => {
    try {
      await disconnectGitHub();
      toast({
        title: 'Disconnected',
        description: 'GitHub has been disconnected from your account.',
      });
    } catch {
      toast({
        title: 'Disconnection Failed',
        description: 'Failed to disconnect GitHub. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDisconnectDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl">
        <div className="space-y-6">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>

          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-80" />
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile Picture Section */}
              <div className="flex items-center gap-4">
                <Skeleton className="h-20 w-20 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!clerkUser) {
    return (
      <div className="max-w-3xl">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Profile Settings</h1>
            <p className="text-muted-foreground">
              Manage your account settings and set email preferences.
            </p>
          </div>
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Unable to load user information.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="space-y-6">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Update your personal details and profile picture.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile Picture Section */}
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  {(previewImage || imageUrl) && (
                    <AvatarImage
                      src={(previewImage || imageUrl) as string}
                      alt={displayName || 'Profile picture'}
                    />
                  )}
                  <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                </Avatar>

                <div className="flex-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClickUpload}
                    disabled={isImageUploading}
                    className="relative"
                  >
                    {isImageUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Change Picture
                      </>
                    )}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    JPG, PNG or GIF. 1:1 ratio recommended. Max size 2MB.
                  </p>
                </div>
              </div>

              {/* Name and Email Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    defaultValue={clerk?.firstName || ''}
                    placeholder="Enter your first name"
                    onChange={handleNameChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    defaultValue={clerk?.lastName || ''}
                    placeholder="Enter your last name"
                    onChange={handleNameChange}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={
                    clerkUserFull?.primaryEmailAddress?.emailAddress ||
                    clerk?.emailAddresses?.[0]?.emailAddress ||
                    ''
                  }
                  placeholder="Enter your email address"
                  readOnly
                />
              </div>

              {/* GitHub Account */}
              <div className="space-y-2">
                <Label>GitHub</Label>
                <div className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-transparent dark:bg-input/30 shadow-xs transition-colors hover:bg-accent/50">
                  <div className="flex items-center gap-3">
                    <Github
                      className={`h-4 w-4 ${isGitHubConnected ? 'text-foreground' : 'text-muted-foreground'}`}
                    />
                    <div>
                      {isGitHubConnected ? (
                        <span className="text-sm font-medium text-foreground">
                          @{githubAccount?.username || 'Connected'}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Connect your GitHub account
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isGitHubConnected ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={openDisconnectDialog}
                              disabled={isDisconnecting}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                              <Unlink className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Disconnect GitHub</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => connectGitHub('/settings?githubConnected=true')}
                        disabled={isConnectingGitHub}
                        className={isConnectingGitHub ? 'animate-pulse' : ''}
                      >
                        {isConnectingGitHub ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          'Connect'
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* GitHub App Installation Banner */}
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>GitHub App Installation</AlertTitle>
                  <AlertDescription>
                    To import repositories, make sure you have installed the Kosuke GitHub App in
                    your organization or personal account.
                    <Link
                      href={GITHUB_APP_INSTALL_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center font-medium underline underline-offset-4 hover:text-primary"
                    >
                      Install GitHub App
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Link>
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isSubmitting || !hasNameChanged}
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </form>

        {/* Disconnect Confirmation Dialog */}
        <Dialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disconnect GitHub?</DialogTitle>
              <DialogDescription>
                You will no longer be able to import repositories from your GitHub account.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDisconnectDialogOpen(false)}
                disabled={isDisconnecting}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDisconnect} disabled={isDisconnecting}>
                {isDisconnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  'Disconnect'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
