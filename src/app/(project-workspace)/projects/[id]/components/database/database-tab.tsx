'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDatabaseInfo } from '@/hooks/use-database-info';
import { useDefaultBranchSettings } from '@/hooks/use-project-settings';
import { Database, Play, Search, Table } from 'lucide-react';
import { QueryRunner } from './query-runner';
import { SchemaViewer } from './schema-viewer';
import { TableBrowser } from './table-browser';

interface DatabaseTabProps {
  projectId: string;
  sessionId: string;
}

export function DatabaseTab({ projectId, sessionId }: DatabaseTabProps) {
  // Resolve effective session to use: provided session if available, else default branch
  const { data: defaultBranchSettings } = useDefaultBranchSettings(projectId);
  const effectiveSessionId = sessionId || defaultBranchSettings?.default_branch || '';
  const { data: dbInfo, isLoading } = useDatabaseInfo(projectId, effectiveSessionId);
  const isDatabaseEnabled = Boolean(effectiveSessionId);

  if (isLoading) {
    return <DatabaseTabSkeleton />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 p-6 pb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold">Database Management</h1>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-6 pb-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Project Database
                </CardTitle>
                <CardDescription className="pt-2">
                  Manage your project&apos;s PostgreSQL database
                  {effectiveSessionId ? ` (Session: ${effectiveSessionId})` : ' (Waiting for default branch settings...)'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!isDatabaseEnabled ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                Waiting for default branch settings...
              </div>
            ) : dbInfo ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Table className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">
                    {dbInfo.tables_count} table{dbInfo.tables_count !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Size: {dbInfo.database_size}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={dbInfo.connected ? 'default' : 'destructive'} className="text-xs">
                    {dbInfo.connected ? 'Connected' : 'Disconnected'}
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                Error loading database information
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 overflow-hidden px-6">
        {!isDatabaseEnabled ? (
          <div className="flex h-full items-center justify-center p-6 text-muted-foreground">
            Waiting for default branch settings...
          </div>
        ) : (
          <Tabs defaultValue="schema" className="w-full h-full flex flex-col">
            <TabsList className="shrink-0">
              <TabsTrigger value="schema" className="flex items-center gap-2">
                <Table className="w-4 h-4" />
                Schema
              </TabsTrigger>
              <TabsTrigger value="browse" className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                Browse Data
              </TabsTrigger>
              <TabsTrigger value="query" className="flex items-center gap-2">
                <Play className="w-4 h-4" />
                Query
              </TabsTrigger>
            </TabsList>

            <TabsContent value="schema" className="flex-1 overflow-y-auto pt-6 pb-12">
              <div className="space-y-6">
                <SchemaViewer projectId={projectId} sessionId={effectiveSessionId} />
              </div>
            </TabsContent>

            <TabsContent value="browse" className="flex-1 overflow-hidden pt-6 pb-6">
              <TableBrowser projectId={projectId} sessionId={effectiveSessionId} />
            </TabsContent>

            <TabsContent value="query" className="flex-1 overflow-y-auto pt-6 pb-12">
              <div className="space-y-6">
                <QueryRunner projectId={projectId} sessionId={effectiveSessionId} />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

const DatabaseTabSkeleton = () => {
  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">Database Management</h1>
        </div>
        <Skeleton className="h-6 w-24" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                <Skeleton className="h-6 w-32" />
              </CardTitle>
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Table className="w-4 h-4 text-muted-foreground" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-muted-foreground" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="schema" className="w-full">
        <TabsList>
          <TabsTrigger value="schema" className="flex items:center gap-2">
            <Table className="w-4 h-4" />
            Schema
          </TabsTrigger>
          <TabsTrigger value="browse" className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            Browse Data
          </TabsTrigger>
          <TabsTrigger value="query" className="flex items-center gap-2">
            <Play className="w-4 h-4" />
            Query
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schema" className="space-y-6 pt-6 pb-12">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Table className="w-4 h-4" />
                      <Skeleton className="h-5 w-24" />
                    </CardTitle>
                    <Skeleton className="h-5 w-12" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, colIndex) => (
                      <div key={colIndex} className="flex items-center justify-between p-2 rounded border">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <Skeleton className="w-3 h-3" />
                            <Skeleton className="w-3 h-3" />
                          </div>
                          <div>
                            <Skeleton className="h-4 w-20 mb-1" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-5 w-16" />
                          <Skeleton className="h-5 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="browse" className="space-y-6 pt-6 pb-12">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Skeleton className="h-5 w-32" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    <Skeleton className="h-5 w-24" />
                  </CardTitle>
                  <Skeleton className="h-5 w-20" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <div className="border-b bg-muted/50 p-4">
                    <div className="flex gap-4">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Skeleton key={index} className="h-4 w-20" />
                      ))}
                    </div>
                  </div>

                  {Array.from({ length: 6 }).map((_, rowIndex) => (
                    <div key={rowIndex} className="border-b p-4">
                      <div className="flex gap-4">
                        {Array.from({ length: 5 }).map((_, colIndex) => (
                          <Skeleton key={colIndex} className="h-4 w-20" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="query" className="space-y-6 pt-6 pb-12">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Skeleton className="h-5 w-32" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <div className="flex justify-end">
                  <Skeleton className="h-10 w-24" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    <Skeleton className="h-5 w-24" />
                  </CardTitle>
                  <Skeleton className="h-5 w-20" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <div className="border-b bg-muted/50 p-4">
                    <div className="flex gap-4">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-4 w-24" />
                      ))}
                    </div>
                  </div>

                  {Array.from({ length: 4 }).map((_, rowIndex) => (
                    <div key={rowIndex} className="border-b p-4">
                      <div className="flex gap-4">
                        {Array.from({ length: 4 }).map((_, colIndex) => (
                          <Skeleton key={colIndex} className="h-4 w-24" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

