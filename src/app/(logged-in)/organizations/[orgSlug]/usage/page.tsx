'use client';

import { useOrganization } from '@clerk/nextjs';
import { AlertCircle, Check, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { UsageCard } from '@/components/usage-card';
import { useOrganizationApiKeys } from '@/hooks/use-organization-api-keys';

export default function OrganizationUsagePage() {
  const { organization, isLoaded, membership } = useOrganization();
  const {
    status: apiKeyStatus,
    isLoading: isLoadingStatus,
    saveApiKey,
    isSaving,
    deleteApiKey,
    isDeleting,
  } = useOrganizationApiKeys(organization?.id);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  const isAdmin = membership?.role === 'org:admin';

  const handleSaveApiKey = () => {
    if (!apiKeyInput.trim()) return;
    saveApiKey(apiKeyInput, {
      onSuccess: () => setApiKeyInput(''),
    });
  };

  const handleDeleteApiKey = () => {
    deleteApiKey();
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
      {/* API Key Management Card */}
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

      {/* Usage Card */}
      <UsageCard orgId={organization.id} />
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

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border rounded-md overflow-hidden">
              <div className="bg-muted/50 px-4 py-3 border-b">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-24" />
                </div>
              </div>
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <div className="flex gap-8">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Skeleton className="h-4 w-48 mb-3" />
              <div className="border rounded-md divide-y">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 py-3 px-4">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 flex-1 max-w-[200px]" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
