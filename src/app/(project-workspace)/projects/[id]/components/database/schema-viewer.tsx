'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useDatabaseSchema } from '@/hooks/use-database-schema';
import { ChevronRight, Hash, Key, Table, Type } from 'lucide-react';
import { useState } from 'react';

interface SchemaViewerProps {
  projectId: string;
  sessionId: string;
}

export function SchemaViewer({ projectId, sessionId }: SchemaViewerProps) {
  const { data: schema, isLoading, error } = useDatabaseSchema(projectId, sessionId);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const toggleTable = (tableName: string) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName);
    } else {
      newExpanded.add(tableName);
    }
    setExpandedTables(newExpanded);
  };

  if (isLoading) {
    return <SchemaViewerSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-destructive">
            Error loading schema: {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!schema?.tables || schema.tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <h3 className="text-xl font-medium">No Tables Found</h3>
        <p className="text-muted-foreground mt-2">
          This database doesn&apos;t have any tables yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {schema.tables.map(table => (
        <Collapsible key={table.name} open={expandedTables.has(table.name)} onOpenChange={() => toggleTable(table.name)}>
          <Card className="overflow-hidden p-0">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer p-0 flex items-center">
                <div className="flex items-center justify-between px-4 w-full h-12">
                  <CardTitle className="flex items-center gap-2 text-sm m-0 leading-tight">
                    <Table className="w-4 h-4" />
                    {table.name}
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-xs">
                      {table.row_count} rows
                    </Badge>
                    <ChevronRight className={`w-4 h-4 transition-transform shrink-0 ${expandedTables.has(table.name) ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-2 border-t">
                <div className="space-y-0">
                  {table.columns.map(column => (
                    <div
                      key={column.name}
                      className="flex items-center justify-between px-2 py-0.5 rounded border text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          {column.primary_key && <Key className="w-3 h-3 text-yellow-500" />}
                          {column.foreign_key && <Hash className="w-3 h-3 text-blue-500" />}
                          <Type className="w-3 h-3 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-mono text-sm">{column.name}</div>
                          {column.foreign_key && (
                            <div className="text-xs text-muted-foreground">
                              → {column.foreign_key}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-mono">
                          {column.type}
                        </Badge>
                        {!column.nullable && (
                          <Badge variant="destructive" className="text-xs">
                            NOT NULL
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}

const SchemaViewerSkeleton = () => {
  return (
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
                <div
                  key={colIndex}
                  className="flex items-center justify-between p-2 rounded border"
                >
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
  );
}
