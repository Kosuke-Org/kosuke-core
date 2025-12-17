'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

import CodeEditor from './code-editor';
import FileTree from './file-tree';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface CodeExplorerProps {
  projectId: string;
  className?: string;
}

export default function CodeExplorer({ projectId, className }: CodeExplorerProps) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileLanguage, setFileLanguage] = useState<string>('');

  // Fetch project files
  useEffect(() => {
    const fetchProjectFiles = async () => {
      setIsLoading(true);

      try {
        // Fetch the file structure from the API
        const response = await fetch(`/api/projects/${projectId}/files`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message || `Failed to fetch project files: ${response.statusText}`
          );
        }

        const data = await response.json();

        if (data.files && Array.isArray(data.files)) {
          setFiles(data.files);

          // Select the first file by default if available
          const firstFile = findFirstFile(data.files);
          if (firstFile && firstFile.type === 'file') {
            setSelectedFile(firstFile.path);
          }
        }
      } catch (error) {
        console.error('Error fetching project files:', error);
        setFiles([]); // Set empty files to show error state
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjectFiles();
  }, [projectId]);

  // Function to handle file selection
  const handleSelectFile = (path: string) => {
    setSelectedFile(path);
  };

  // Fetch file content when the file is selected
  useEffect(() => {
    if (!selectedFile) return;

    const fetchFileContent = async () => {
      setIsLoading(true);

      try {
        // Fetch the file content from the API
        const response = await fetch(
          `/api/projects/${projectId}/files/${encodeURIComponent(selectedFile)}`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch file content: ${response.statusText}`);
        }

        // Get the raw text content first
        const text = await response.text();

        // Determine the language from the file name
        const fileName = selectedFile.split('/').pop() || '';
        const extension = fileName.split('.').pop()?.toLowerCase() || '';

        // For JSON files, try to parse and prettify
        if (extension === 'json') {
          try {
            const jsonObj = JSON.parse(text);
            setFileContent(JSON.stringify(jsonObj, null, 2));
          } catch (jsonError) {
            console.error('Error parsing JSON file:', jsonError);
            setFileContent(text); // Fallback to raw text if parsing fails
          }
        } else {
          setFileContent(text);
        }

        // Check if it's a special file without extension (like Dockerfile)
        if (fileName.toLowerCase() === 'dockerfile') {
          setFileLanguage('dockerfile');
        } else {
          setFileLanguage(getLanguageFromExtension(extension));
        }
      } catch (error) {
        console.error('Error fetching file content:', error);
        setFileContent('Error loading file content');
      } finally {
        setIsLoading(false);
      }
    };

    fetchFileContent();
  }, [selectedFile, projectId]);

  return (
    <div
      className={cn('flex h-full w-full overflow-hidden', className)}
      data-testid="code-explorer"
    >
      <div className="w-64 border-r border-border overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center text-sm text-muted-foreground">
            <p className="mb-2">No files available</p>
            <p className="text-xs">Start the preview to view files</p>
          </div>
        ) : (
          <FileTree
            files={files}
            selectedFile={selectedFile || undefined}
            onSelectFile={handleSelectFile}
          />
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {selectedFile ? (
          // Use the new minimal editor component with directly passed content
          <CodeEditor code={fileContent} language={fileLanguage} filePath={selectedFile} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <p>Select a file to view its contents</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function to find the first file in the file tree
function findFirstFile(nodes: FileNode[]): FileNode | null {
  for (const node of nodes) {
    if (node.type === 'file') {
      return node;
    }

    if (node.children && node.children.length > 0) {
      const file = findFirstFile(node.children);
      if (file) return file;
    }
  }

  return null;
}

// Helper function to determine language from file extension
function getLanguageFromExtension(extension: string): string {
  // Map file extensions to languages
  const extensionMap: Record<string, string> = {
    // JavaScript and TypeScript
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'mjs',
    ts: 'typescript',
    tsx: 'typescript',

    // Web technologies
    html: 'html',
    css: 'css',
    scss: 'scss',
    svg: 'svg',

    // Data formats
    json: 'json',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',

    // Backend languages
    py: 'python',
    rb: 'ruby',
    go: 'go',
    java: 'java',
    php: 'php',
    rs: 'rust',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    swift: 'swift',
    kt: 'kotlin',
    dart: 'dart',

    // Shell and config files
    sh: 'sh',
    bash: 'sh',
    zsh: 'sh',
  };

  // Handle special file names (not extensions)
  if (extension.toLowerCase() === 'dockerfile') {
    return 'dockerfile';
  }

  return extensionMap[extension.toLowerCase()] || 'plaintext';
}
