'use client';

import { Check, Copy, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Service plan options for Render.com (updated Jan 2025)
const SERVICE_PLANS = [
  { value: 'starter', label: 'Starter - 512MB / 0.5 CPU ($7/month)' },
  { value: 'standard', label: 'Standard - 2GB / 1 CPU ($25/month)' },
  { value: 'pro', label: 'Pro - 4GB / 2 CPU ($85/month)' },
  { value: 'pro_plus', label: 'Pro Plus - 8GB / 4 CPU ($175/month)' },
  { value: 'pro_max', label: 'Pro Max - 16GB / 4 CPU ($225/month)' },
  { value: 'pro_ultra', label: 'Pro Ultra - 32GB / 8 CPU ($450/month)' },
];

// Postgres plan options (updated Jan 2025)
const POSTGRES_PLANS = [
  { value: 'basic_256mb', label: 'Basic 256MB ($6/month)' },
  { value: 'basic_1gb', label: 'Basic 1GB ($19/month)' },
  { value: 'basic_4gb', label: 'Basic 4GB ($75/month)' },
  { value: 'pro_4gb', label: 'Pro 4GB ($55/month)' },
  { value: 'pro_8gb', label: 'Pro 8GB ($100/month)' },
  { value: 'pro_16gb', label: 'Pro 16GB ($200/month)' },
  { value: 'pro_32gb', label: 'Pro 32GB ($400/month)' },
];

// Redis (Key Value) plan options (updated Jan 2025)
const REDIS_PLANS = [
  { value: 'starter', label: 'Starter - 256MB ($10/month)' },
  { value: 'standard', label: 'Standard - 1GB ($32/month)' },
  { value: 'pro', label: 'Pro - 5GB ($135/month)' },
  { value: 'pro_plus', label: 'Pro Plus - 10GB ($250/month)' },
  { value: 'pro_max', label: 'Pro Max - 20GB ($550/month)' },
  { value: 'pro_ultra', label: 'Pro Ultra - 40GB ($1,100/month)' },
];

// Full service config that includes type, runtime, build_command, etc.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceConfig = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StorageConfig = Record<string, any>;

interface ProductionConfig {
  services: ServiceConfig;
  storages: StorageConfig;
  resources: Record<string, { plan: string }>;
  environment: Record<string, string>;
}

interface PreviewConfig {
  services?: Record<string, { type?: string; name?: string }>;
  storages?: Record<string, { type?: string }>;
  environment?: Record<string, string>;
}

interface ProductionServiceConfig {
  type?: 'web' | 'worker';
  runtime?: string;
  directory?: string;
  build_command?: string;
  start_command?: string;
  is_entrypoint?: boolean;
  external_connection_variable?: string;
}

interface ProductionStorageConfig {
  type?: 'postgres' | 'keyvalue' | 's3';
  connection_variable?: string;
  maxmemory_policy?: string;
  access_key_id_variable?: string;
  secret_access_key_variable?: string;
  bucket_variable?: string;
  region_variable?: string;
  endpoint_variable?: string;
}

interface FullProductionConfig {
  services?: Record<string, ProductionServiceConfig>;
  storages?: Record<string, ProductionStorageConfig>;
  resources?: Record<string, { plan: string }>;
  environment?: Record<string, string>;
}

interface DeployConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingConfig: Record<string, unknown> | null;
  onSave: (config: ProductionConfig) => void;
  isSaving: boolean;
}

export function DeployConfigModal({
  open,
  onOpenChange,
  existingConfig,
  onSave,
  isSaving,
}: DeployConfigModalProps) {
  const { toast } = useToast();

  // Parse existing config - memoized to avoid recreating objects on each render
  const previewConfig = useMemo(
    () => (existingConfig?.preview || {}) as PreviewConfig,
    [existingConfig?.preview]
  );
  const existingProduction = useMemo(
    () => existingConfig?.production as FullProductionConfig | undefined,
    [existingConfig?.production]
  );

  // Merge services from preview and production configs
  // Production config defines the actual services (web, worker), preview may only have nextjs
  const allServices = useMemo(() => {
    const services: Record<string, { type: string; fromProduction: boolean }> = {};

    // Add services from production config (authoritative for service types)
    if (existingProduction?.services) {
      Object.entries(existingProduction.services).forEach(([key, config]) => {
        services[key] = { type: config.type || 'web', fromProduction: true };
      });
    }

    // Add services from preview config if not already present
    if (previewConfig.services) {
      Object.entries(previewConfig.services).forEach(([key, config]) => {
        if (!services[key]) {
          services[key] = { type: config.type || 'service', fromProduction: false };
        }
      });
    }

    return services;
  }, [previewConfig.services, existingProduction?.services]);

  // Helper to infer storage type from key name
  const inferStorageType = (key: string): string => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('redis') || lowerKey === 'keyvalue') return 'keyvalue';
    if (lowerKey.includes('s3') || lowerKey === 'storage' || lowerKey === 'spaces') return 's3';
    return 'postgres';
  };

  // Merge storages from preview and production configs
  // Priority: preview config type > production config type > infer from key name
  const allStorages = useMemo(() => {
    const storages: Record<string, { type: string }> = {};

    // First, get all storage keys from both configs
    const allKeys = new Set([
      ...Object.keys(previewConfig.storages || {}),
      ...Object.keys(existingProduction?.storages || {}),
    ]);

    allKeys.forEach(key => {
      // Preview config is most reliable for type
      const previewType = previewConfig.storages?.[key]?.type;
      const productionType = existingProduction?.storages?.[key]?.type;

      storages[key] = {
        type: previewType || productionType || inferStorageType(key),
      };
    });

    return storages;
  }, [previewConfig.storages, existingProduction?.storages]);

  // State for resource plans (services and storages)
  const [resources, setResources] = useState<Record<string, { plan: string }>>({});

  // State for environment variables
  const [envVars, setEnvVars] = useState<Record<string, string>>({});

  // State for tracking copied preview values
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Copy preview value to clipboard
  const handleCopyValue = useCallback(
    async (value: string, key: string) => {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      toast({ title: 'Copied', description: `${key} copied to clipboard` });
      setTimeout(() => setCopiedKey(null), 2000);
    },
    [toast]
  );

  // Validate ALL production environment variables must be filled
  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    Object.keys(previewConfig.environment || {}).forEach(key => {
      if (!envVars[key]?.trim()) {
        errors[key] = 'Required for production';
      }
    });
    return errors;
  }, [previewConfig.environment, envVars]);

  const isValid = Object.keys(validationErrors).length === 0;

  // Initialize state from existing config
  useEffect(() => {
    if (existingProduction) {
      // Load existing resource plans
      setResources(existingProduction.resources || {});
      // Load existing environment values
      setEnvVars(existingProduction.environment || {});
    } else {
      // Initialize resources from merged services and storages
      const initialResources: Record<string, { plan: string }> = {};

      // Initialize service plans
      Object.keys(allServices).forEach(key => {
        initialResources[key] = { plan: 'starter' };
      });

      // Initialize storage plans
      Object.entries(allStorages).forEach(([key, storage]) => {
        const storageType = storage.type;
        initialResources[key] = {
          plan:
            storageType === 'postgres'
              ? 'basic_256mb'
              : storageType === 'redis' || storageType === 'keyvalue'
                ? 'starter'
                : 'starter',
        };
      });
      setResources(initialResources);

      // Initialize env vars from preview.environment (use empty strings for production)
      const initialEnvVars: Record<string, string> = {};
      Object.keys(previewConfig.environment || {}).forEach(key => {
        initialEnvVars[key] = '';
      });
      setEnvVars(initialEnvVars);
    }
  }, [previewConfig, existingProduction, allServices, allStorages]);

  const handleSave = () => {
    // Preserve full service configs from existing production, only update resources (plans)
    // The services/storages objects keep their full structure (type, runtime, build_command, etc.)
    // Only the resources object holds the plan selections
    const servicesConfig = existingProduction?.services || {};
    const storagesConfig = existingProduction?.storages || {};

    // Build services config - ensure type and runtime are ALWAYS set (fix for corrupted configs)
    let finalServices: ServiceConfig;
    if (Object.keys(servicesConfig).length > 0) {
      // Use existing config but ensure each service has valid type and runtime
      finalServices = Object.fromEntries(
        Object.entries(servicesConfig).map(([key, config]) => [
          key,
          { ...config, type: config.type || 'web', runtime: config.runtime || 'node' },
        ])
      );
    } else {
      // Build from preview config
      finalServices = Object.fromEntries(
        Object.entries(previewConfig.services || {}).map(([key, config]) => [
          key,
          { ...config, type: (config.type as 'web' | 'worker') || 'web', runtime: 'node' },
        ])
      );
    }

    // Build storages config - ensure type is ALWAYS set
    let finalStorages: StorageConfig;
    if (Object.keys(storagesConfig).length > 0) {
      // Use existing config but ensure each storage has a valid type
      finalStorages = Object.fromEntries(
        Object.entries(storagesConfig).map(([key, config]) => [
          key,
          { ...config, type: config.type || inferStorageType(key) },
        ])
      );
    } else {
      // Build from preview config
      finalStorages = Object.fromEntries(
        Object.entries(previewConfig.storages || {}).map(([key, config]) => [
          key,
          { ...config, type: config.type || inferStorageType(key) },
        ])
      );
    }

    onSave({
      services: finalServices,
      storages: finalStorages,
      resources,
      environment: envVars,
    });
  };

  const updateResourcePlan = (key: string, plan: string) => {
    setResources(prev => ({
      ...prev,
      [key]: { plan },
    }));
  };

  const updateEnvVar = (key: string, value: string) => {
    setEnvVars(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const hasServices = Object.keys(allServices).length > 0;
  const hasStorages = Object.keys(allStorages).length > 0;
  const hasEnvVars = Object.keys(previewConfig.environment || {}).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[60vw] max-w-[60vw] sm:max-w-[60vw] md:max-w-[60vw] lg:max-w-[60vw] xl:max-w-[40vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Production Deployment</DialogTitle>
          <DialogDescription>
            Review and configure production settings before deploying to Render.com.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-8 py-4">
          {/* Section 1: Service Plans */}
          {(hasServices || hasStorages) && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Service Plans</h3>
              <div className="grid gap-3">
                {/* Services */}
                {Object.entries(allServices).map(([key, service]) => (
                  <div key={key} className="flex items-center gap-4">
                    <Label className="w-40 capitalize font-mono text-sm">
                      {key} <span className="text-muted-foreground">({service.type})</span>
                    </Label>
                    <Select
                      value={resources[key]?.plan || 'starter'}
                      onValueChange={value => updateResourcePlan(key, value)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SERVICE_PLANS.map(plan => (
                          <SelectItem key={plan.value} value={plan.value}>
                            {plan.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}

                {/* Storages */}
                {Object.entries(allStorages).map(([key, storage]) => {
                  const storageType = storage.type;

                  // S3 doesn't have plans - it's a DigitalOcean Space
                  if (storageType === 's3') {
                    return (
                      <div key={key} className="flex items-center gap-4">
                        <Label className="w-40 capitalize font-mono text-sm">
                          {key} <span className="text-muted-foreground">(s3)</span>
                        </Label>
                        <span className="flex-1 text-sm text-muted-foreground">
                          DigitalOcean Space (no plan selection)
                        </span>
                      </div>
                    );
                  }

                  const plans =
                    storageType === 'postgres'
                      ? POSTGRES_PLANS
                      : storageType === 'keyvalue'
                        ? REDIS_PLANS
                        : REDIS_PLANS; // Default to Redis plans for unknown types

                  const defaultPlan = storageType === 'postgres' ? 'basic_256mb' : 'starter';

                  return (
                    <div key={key} className="flex items-center gap-4">
                      <Label className="w-40 capitalize font-mono text-sm">
                        {key} <span className="text-muted-foreground">({storageType})</span>
                      </Label>
                      <Select
                        value={resources[key]?.plan || defaultPlan}
                        onValueChange={value => updateResourcePlan(key, value)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {plans.map(plan => (
                            <SelectItem key={plan.value} value={plan.value}>
                              {plan.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 2: Environment Preview */}
          {hasEnvVars && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Environment Preview</h3>
              <p className="text-sm text-muted-foreground">
                Preview environment variables. Click copy to use in production.
              </p>
              <div className="grid gap-2 rounded-lg border p-4 bg-muted/20">
                {Object.entries(previewConfig.environment || {}).map(([key, previewValue]) => (
                  <div key={key} className="flex items-center gap-3 font-mono text-sm">
                    <span className="w-48 truncate text-muted-foreground">{key}</span>
                    <span className="flex-1 truncate">{previewValue || '(empty)'}</span>
                    {previewValue && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 shrink-0"
                        onClick={() => handleCopyValue(previewValue, key)}
                      >
                        {copiedKey === key ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Environment Production */}
          {hasEnvVars && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Environment Production</h3>
              <p className="text-sm text-muted-foreground">
                All environment variables must be set for production deployment.
              </p>
              <div className="grid gap-3">
                {Object.entries(previewConfig.environment || {}).map(([key]) => {
                  const hasError = !!validationErrors[key];

                  return (
                    <div key={key} className="flex items-center gap-3">
                      <Label className="w-48 font-mono text-sm truncate">
                        {key}
                        <span className="text-destructive ml-1">*</span>
                      </Label>
                      <Input
                        type="text"
                        placeholder="Required"
                        value={envVars[key] || ''}
                        onChange={e => updateEnvVar(key, e.target.value)}
                        className={`flex-1 font-mono text-sm ${hasError ? 'border-destructive' : ''}`}
                      />
                    </div>
                  );
                })}
              </div>
              {Object.keys(validationErrors).length > 0 && (
                <p className="text-sm text-destructive">
                  All environment variables must be filled before deployment.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !isValid}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              'Deploy'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
