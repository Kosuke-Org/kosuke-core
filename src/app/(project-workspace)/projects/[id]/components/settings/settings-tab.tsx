'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings } from 'lucide-react';
import DefaultBranchSettings from './default-branch-settings';
import { ProductionSettings } from './production-settings';
import { SubdomainDisplay } from './subdomain-display';

interface SettingsTabProps {
  projectId: string;
}

export function SettingsTab({ projectId }: SettingsTabProps) {
  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">Project Settings</h1>
        </div>
      </div>

      <Tabs defaultValue="branch" className="w-full">
        <TabsList>
          <TabsTrigger value="branch">Default Branch</TabsTrigger>
          <TabsTrigger value="subdomains">Preview URLs</TabsTrigger>
          <TabsTrigger value="production">Production</TabsTrigger>
        </TabsList>

        <TabsContent value="branch" className="space-y-6 pt-6 pb-12">
          <DefaultBranchSettings projectId={projectId} />
        </TabsContent>

        <TabsContent value="subdomains" className="space-y-6 pt-6 pb-12">
          <SubdomainDisplay projectId={projectId} />
        </TabsContent>

        <TabsContent value="production" className="space-y-6 pt-6 pb-12">
          <ProductionSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
