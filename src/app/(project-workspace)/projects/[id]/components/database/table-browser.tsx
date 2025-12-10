'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDatabaseSchema } from '@/hooks/use-database-schema';
import { useTableData } from '@/hooks/use-table-data';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Database, Table as TableIcon } from 'lucide-react';
import { useState } from 'react';

interface TableBrowserProps {
  projectId: string;
  sessionId: string;
}

export function TableBrowser({ projectId, sessionId }: TableBrowserProps) {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 10;

  const { data: schema, isLoading: schemaLoading } = useDatabaseSchema(projectId, sessionId);
  const { data: tableData, isLoading: dataLoading, error } = useTableData(
    projectId,
    selectedTable,
    sessionId,
    pageSize,
    currentPage * pageSize
  );

  if (schemaLoading) {
    return <TableBrowserSkeleton />;
  }

  const tables = schema?.tables || [];

  return (
    <div className="flex h-full gap-6">
      {/* Left Sidebar - Tables List */}
      <Card className="w-96 flex flex-col overflow-hidden">
        <CardHeader className="pb-0 shrink-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="w-5 h-5" />
            Database Tables
          </CardTitle>
          <CardDescription>
            {tables.length} {tables.length === 1 ? 'table' : 'tables'} available
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 p-0 min-h-0">
          <ScrollArea className="h-full w-full">
            {tables.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                No tables found
              </div>
            ) : (
              <div className="p-3 space-y-1">
                {tables.map(table => (
                  <button
                    key={table.name}
                    onClick={() => {
                      setSelectedTable(table.name);
                      setCurrentPage(0);
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-lg hover:bg-muted/70 transition-all duration-200 group border",
                      selectedTable === table.name
                        ? "bg-muted border-border shadow-sm"
                        : "border-transparent hover:border-border/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <TableIcon className={cn(
                        "w-4 h-4 transition-colors",
                        selectedTable === table.name
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-foreground"
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                          "font-medium text-sm truncate transition-colors",
                          selectedTable === table.name ? "text-foreground" : "text-foreground/90"
                        )}>
                          {table.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {table.row_count.toLocaleString()} rows
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedTable ? (
          <Card className="flex-1 flex flex-col">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">{selectedTable}</CardTitle>
                  {tableData && (
                    <CardDescription>
                      {tableData.total_rows.toLocaleString()} total rows
                    </CardDescription>
                  )}
                </div>
                {tableData && (
                  <Badge variant="secondary" className="font-mono">
                    {tableData.returned_rows} / {tableData.total_rows}
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col space-y-3 pb-4">
              {dataLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-muted-foreground">Loading table data...</div>
                </div>
              ) : error ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-destructive space-y-2">
                    <p className="font-medium">Error loading table data</p>
                    <p className="text-sm">{error.message}</p>
                  </div>
                </div>
              ) : tableData && tableData.data.length > 0 ? (
                <>
                  {/* Table with horizontal scroll */}
                  <div className="flex-1 border rounded-lg">
                    <ScrollArea className="h-[440px] w-full">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(tableData.data[0]).map(column => (
                              <TableHead key={column} className="min-w-32 bg-muted/30 font-semibold">
                                {column}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableData.data.map((row, index) => (
                            <TableRow key={index}>
                              {Object.values(row).map((value, colIndex) => (
                                <TableCell key={colIndex} className="min-w-32 font-mono text-xs">
                                  {value === null ? (
                                    <Badge variant="outline" className="text-xs font-mono text-muted-foreground border-muted-foreground/30">
                                      NULL
                                    </Badge>
                                  ) : (
                                    <div className="truncate max-w-48" title={String(value)}>
                                      {String(value)}
                                    </div>
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-sm text-muted-foreground">
                      Showing <span className="font-medium">{tableData.offset + 1}–{Math.min(tableData.offset + tableData.returned_rows, tableData.total_rows)}</span> of <span className="font-medium">{tableData.total_rows.toLocaleString()}</span> rows
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={tableData.offset + tableData.returned_rows >= tableData.total_rows}
                      >
                        Next
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-muted-foreground space-y-2">
                    <TableIcon className="w-12 h-12 mx-auto opacity-40" />
                    <p className="font-medium">No data found</p>
                    <p className="text-sm">This table appears to be empty</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="flex-1 flex items-center justify-center">
            <CardContent className="text-center space-y-4 py-12">
              <Database className="w-16 h-16 mx-auto text-muted-foreground/40" />
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Select a table to browse</h3>
                <p className="text-muted-foreground max-w-sm">
                  Choose a table from the sidebar to view its data, structure, and browse through records.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

const TableBrowserSkeleton = () => {
  return (
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

            {Array.from({ length: 8 }).map((_, rowIndex) => (
              <div key={rowIndex} className="border-b p-4">
                <div className="flex gap-4">
                  {Array.from({ length: 5 }).map((_, colIndex) => (
                    <Skeleton key={colIndex} className="h-4 w-20" />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-4">
            <Skeleton className="h-4 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
