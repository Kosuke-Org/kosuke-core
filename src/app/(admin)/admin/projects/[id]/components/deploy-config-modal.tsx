'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
import { Separator } from '@/components/ui/separator';

// Service plan options for Render.com
const SERVICE_PLANS = [
  { value: 'starter', label: 'Starter ($7/month)' },
  { value: 'starter_plus', label: 'Starter Plus ($14/month)' },
  { value: 'standard', label: 'Standard ($25/month)' },
  { value: 'standard_plus', label: 'Standard Plus ($50/month)' },
  { value: 'pro', label: 'Pro ($85/month)' },
  { value: 'pro_plus', label: 'Pro Plus ($175/month)' },
  { value: 'pro_max', label: 'Pro Max ($225/month)' },
  { value: 'pro_ultra', label: 'Pro Ultra ($450/month)' },
];

// Postgres plan options
const POSTGRES_PLANS = [
  { value: 'basic_256mb', label: 'Basic 256MB ($7/month)' },
  { value: 'basic_1gb', label: 'Basic 1GB ($15/month)' },
  { value: 'basic_4gb', label: 'Basic 4GB ($45/month)' },
  { value: 'pro_4gb', label: 'Pro 4GB ($45/month)' },
  { value: 'pro_8gb', label: 'Pro 8GB ($95/month)' },
  { value: 'pro_16gb', label: 'Pro 16GB ($195/month)' },
  { value: 'pro_32gb', label: 'Pro 32GB ($395/month)' },
];

// Redis plan options
const REDIS_PLANS = [
  { value: 'starter', label: 'Starter ($7/month)' },
  { value: 'standard', label: 'Standard ($15/month)' },
  { value: 'pro', label: 'Pro ($30/month)' },
];

interface ServiceConfig {
  plan: string;
  envVars: Record<string, string>;
}

interface StorageConfig {
  plan: string;
}

interface ProductionConfig {
  services: Record<string, ServiceConfig>;
  storages: Record<string, StorageConfig>;
}

interface PreviewConfig {
  services?: Record<string, { name?: string }>;
  storages?: Record<string, { type?: string }>;
  envVars?: Array<{ key: string; required?: boolean; description?: string }>;
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
  // Parse existing config - memoized to avoid recreating objects on each render
  const previewConfig = useMemo(
    () => (existingConfig?.preview || {}) as PreviewConfig,
    [existingConfig?.preview]
  );
  const existingProduction = useMemo(
    () => existingConfig?.production as ProductionConfig | undefined,
    [existingConfig?.production]
  );

  // State for services
  const [services, setServices] = useState<Record<string, ServiceConfig>>({});

  // State for storages
  const [storages, setStorages] = useState<Record<string, StorageConfig>>({});

  // State for environment variables
  const [envVars, setEnvVars] = useState<Record<string, string>>({});

  // Initialize state from existing config
  useEffect(() => {
    if (existingProduction) {
      setServices(existingProduction.services || {});
      setStorages(existingProduction.storages || {});

      // Extract env vars from services
      const allEnvVars: Record<string, string> = {};
      Object.values(existingProduction.services || {}).forEach(service => {
        Object.assign(allEnvVars, service.envVars || {});
      });
      setEnvVars(allEnvVars);
    } else {
      // Initialize from preview config with default plans
      const initialServices: Record<string, ServiceConfig> = {};
      Object.keys(previewConfig.services || {}).forEach(key => {
        initialServices[key] = { plan: 'starter', envVars: {} };
      });
      setServices(initialServices);

      const initialStorages: Record<string, StorageConfig> = {};
      Object.keys(previewConfig.storages || {}).forEach(key => {
        const storageType = previewConfig.storages?.[key]?.type;
        initialStorages[key] = {
          plan:
            storageType === 'postgres'
              ? 'basic_256mb'
              : storageType === 'keyvalue'
                ? 'starter'
                : 'starter',
        };
      });
      setStorages(initialStorages);

      // Initialize empty env vars from preview config
      const initialEnvVars: Record<string, string> = {};
      (previewConfig.envVars || []).forEach(env => {
        initialEnvVars[env.key] = '';
      });
      setEnvVars(initialEnvVars);
    }
  }, [previewConfig, existingProduction]);

  const handleSave = () => {
    // Merge env vars into the first service (typically 'nextjs')
    const servicesWithEnvVars = { ...services };
    const firstServiceKey = Object.keys(servicesWithEnvVars)[0];
    if (firstServiceKey) {
      servicesWithEnvVars[firstServiceKey] = {
        ...servicesWithEnvVars[firstServiceKey],
        envVars,
      };
    }

    onSave({
      services: servicesWithEnvVars,
      storages,
    });
  };

  const updateServicePlan = (key: string, plan: string) => {
    setServices(prev => ({
      ...prev,
      [key]: { ...prev[key], plan },
    }));
  };

  const updateStoragePlan = (key: string, plan: string) => {
    setStorages(prev => ({
      ...prev,
      [key]: { ...prev[key], plan },
    }));
  };

  const updateEnvVar = (key: string, value: string) => {
    setEnvVars(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Production Deployment</DialogTitle>
          <DialogDescription>
            Set up the production configuration for deploying to Render.com. Environment variables
            should be set for production - preview values are not copied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Service Plans */}
          {Object.keys(services).length > 0 && (
            <div className="space-y-4">
              <h3 className="font-medium">Service Plans</h3>
              <div className="grid gap-4">
                {Object.keys(services).map(key => (
                  <div key={key} className="flex items-center gap-4">
                    <Label className="w-32 capitalize">{key}</Label>
                    <Select
                      value={services[key]?.plan || 'starter'}
                      onValueChange={value => updateServicePlan(key, value)}
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
              </div>
            </div>
          )}

          {/* Storage Plans */}
          {Object.keys(storages).length > 0 && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="font-medium">Storage Plans</h3>
                <div className="grid gap-4">
                  {Object.entries(previewConfig.storages || {}).map(([key, storage]) => {
                    const storageType = storage.type;
                    const plans =
                      storageType === 'postgres'
                        ? POSTGRES_PLANS
                        : storageType === 'keyvalue'
                          ? REDIS_PLANS
                          : SERVICE_PLANS;

                    return (
                      <div key={key} className="flex items-center gap-4">
                        <Label className="w-32 capitalize">
                          {key} ({storageType})
                        </Label>
                        <Select
                          value={storages[key]?.plan || plans[0]?.value}
                          onValueChange={value => updateStoragePlan(key, value)}
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
            </>
          )}

          {/* Environment Variables */}
          {(previewConfig.envVars?.length ?? 0) > 0 && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="font-medium">Environment Variables</h3>
                <p className="text-sm text-muted-foreground">
                  Enter production values for each environment variable. These will be set on the
                  production deployment.
                </p>
                <div className="grid gap-4">
                  {(previewConfig.envVars || []).map(env => (
                    <div key={env.key} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label className="font-mono text-sm">
                          {env.key}
                          {env.required && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                      </div>
                      {env.description && (
                        <p className="text-xs text-muted-foreground">{env.description}</p>
                      )}
                      <Input
                        type={
                          env.key.toLowerCase().includes('secret') ||
                          env.key.toLowerCase().includes('key') ||
                          env.key.toLowerCase().includes('password')
                            ? 'password'
                            : 'text'
                        }
                        placeholder={`Enter ${env.key}`}
                        value={envVars[env.key] || ''}
                        onChange={e => updateEnvVar(env.key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Configuration'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
