'use client';

import { useOrganization } from '@clerk/nextjs';
import { AlertCircle, Check, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

interface ApiKeyStatus {
  hasCustomKey: boolean;
  maskedKey: string | null;
  updatedAt?: string;
}

export default function OrganizationUsagePage() {
  const { organization, isLoaded, membership } = useOrganization();
  const { toast } = useToast();

  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = membership?.role === 'org:admin';

  const fetchApiKeyStatus = useCallback(async () => {
    if (!organization?.id) return;

    try {
      setIsLoadingStatus(true);
      const response = await fetch(`/api/organizations/${organization.id}/api-keys`);
      if (response.ok) {
        const data = await response.json();
        setApiKeyStatus(data);
      }
    } catch {
      console.error('Failed to fetch API key status');
    } finally {
      setIsLoadingStatus(false);
    }
  }, [organization?.id]);

  useEffect(() => {
    if (organization?.id) {
      fetchApiKeyStatus();
    }
  }, [organization?.id, fetchApiKeyStatus]);

  const handleSaveApiKey = async () => {
    if (!organization?.id || !apiKeyInput.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/organizations/${organization.id}/api-keys`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anthropicApiKey: apiKeyInput }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to save API key');
        return;
      }

      setApiKeyStatus({
        hasCustomKey: true,
        maskedKey: data.maskedKey,
      });
      setApiKeyInput('');
      toast({
        title: 'API key saved',
        description: 'Your Anthropic API key has been saved and validated.',
      });
    } catch {
      setError('Network error - please try again');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteApiKey = async () => {
    if (!organization?.id) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/organizations/${organization.id}/api-keys`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to delete API key');
        return;
      }

      setApiKeyStatus({
        hasCustomKey: false,
        maskedKey: null,
      });
      toast({
        title: 'API key removed',
        description: 'Your organization will now use the system default API key.',
      });
    } catch {
      setError('Network error - please try again');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isLoaded) {
    return <UsagePageSkeleton />;
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <CardTitle>Anthropic API Key</CardTitle>
              <CardDescription>
                Use your own Anthropic API key for code generation in sandboxes.
              </CardDescription>
            </div>
            {!isLoadingStatus && (
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  {apiKeyStatus?.hasCustomKey && isAdmin && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDeleteApiKey}
                          disabled={isDeleting}
                          className="text-destructive hover:text-destructive"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>This will switch back to using the system default API key.</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant={apiKeyStatus?.hasCustomKey ? 'default' : 'secondary'}>
                        {apiKeyStatus?.hasCustomKey ? 'Custom Key' : 'System Default'}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {apiKeyStatus?.hasCustomKey
                          ? `Using: ${apiKeyStatus.maskedKey}`
                          : 'All code generation will use the platform API key.'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Status */}
          {isLoadingStatus ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Admin-only API Key Management */}
              {isAdmin ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="apiKey">
                        {apiKeyStatus?.hasCustomKey ? 'Update API Key' : 'Set API Key'}
                      </Label>
                      {apiKeyStatus?.hasCustomKey && apiKeyStatus.maskedKey && (
                        <span className="text-xs text-muted-foreground">
                          Current: {apiKeyStatus.maskedKey}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          id="apiKey"
                          type={showApiKey ? 'text' : 'password'}
                          placeholder="sk-ant-api03-..."
                          value={apiKeyInput}
                          onChange={e => setApiKeyInput(e.target.value)}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                      <Button onClick={handleSaveApiKey} disabled={isSaving || !apiKeyInput.trim()}>
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Validating...
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Save
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your API key will be encrypted and validated before saving.
                    </p>
                  </div>
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Only organization admins can manage API keys.</AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UsagePageSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-96" />
            </div>
            <Skeleton className="h-6 w-24" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
