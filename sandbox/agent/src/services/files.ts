/**
 * Files Service
 * Handles file system operations within the sandbox
 */

import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';

interface FileInfo {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  lastModified?: string;
  children?: FileInfo[];
}

// Directories to exclude from file listing
const EXCLUDE_DIRS = new Set([
  '.next',
  'node_modules',
  '.git',
  'dist',
  'build',
  '__pycache__',
  'venv',
  '.venv',
  'coverage',
  '.kosuke-installed',
  '.turbo',
  '.cache',
]);

// Files to exclude
const EXCLUDE_FILES = new Set(['.DS_Store', 'Thumbs.db', '.kosuke-installed']);

export class FilesService {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * List all files in the project as a tree structure
   */
  async listFiles(): Promise<FileInfo[]> {
    return this.readDirectoryRecursive(this.projectDir, '');
  }

  /**
   * Read a file's content
   */
  async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    return readFile(fullPath, 'utf-8');
  }

  /**
   * Write content to a file
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);

    // Ensure directory exists
    const dir = dirname(fullPath);
    await mkdir(dir, { recursive: true });

    await writeFile(fullPath, content, 'utf-8');
  }

  /**
   * Resolve and validate file path
   */
  private resolvePath(filePath: string): string {
    // Remove leading slashes
    const cleanPath = filePath.replace(/^\/+/, '');
    const fullPath = resolve(join(this.projectDir, cleanPath));

    // Security check: ensure path is within project directory
    if (!fullPath.startsWith(this.projectDir)) {
      throw new Error('Invalid file path: path traversal detected');
    }

    return fullPath;
  }

  /**
   * Read directory recursively
   */
  private async readDirectoryRecursive(
    basePath: string,
    relativePath: string
  ): Promise<FileInfo[]> {
    const currentPath = join(basePath, relativePath);
    const files: FileInfo[] = [];

    try {
      const items = await readdir(currentPath, { withFileTypes: true });

      for (const item of items) {
        // Skip excluded directories and hidden files/directories
        if (EXCLUDE_DIRS.has(item.name) || EXCLUDE_FILES.has(item.name)) {
          continue;
        }

        // Skip hidden files (starting with .) except specific ones
        if (item.name.startsWith('.') && !this.isAllowedHiddenFile(item.name)) {
          continue;
        }

        const itemPath = relativePath ? join(relativePath, item.name) : item.name;
        const fullPath = join(currentPath, item.name);

        if (item.isDirectory()) {
          try {
            const stats = await stat(fullPath);
            const children = await this.readDirectoryRecursive(basePath, itemPath);

            files.push({
              name: item.name,
              type: 'directory',
              path: itemPath,
              lastModified: stats.mtime.toISOString(),
              children,
            });
          } catch (err) {
            console.warn(`Skipping directory ${itemPath}:`, err);
          }
        } else if (item.isFile()) {
          try {
            const stats = await stat(fullPath);

            files.push({
              name: item.name,
              type: 'file',
              path: itemPath,
              size: stats.size,
              lastModified: stats.mtime.toISOString(),
            });
          } catch (err) {
            console.warn(`Skipping file ${itemPath}:`, err);
          }
        }
      }

      // Sort: directories first, then files, alphabetically
      return files.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    } catch (err) {
      console.error(`Failed to read directory ${currentPath}:`, err);
      return [];
    }
  }

  /**
   * Check if a hidden file should be included
   */
  private isAllowedHiddenFile(name: string): boolean {
    const allowedHidden = new Set([
      '.env',
      '.env.local',
      '.env.development',
      '.env.production',
      '.prettierrc',
      '.eslintrc',
      '.eslintrc.js',
      '.eslintrc.json',
    ]);

    return allowedHidden.has(name);
  }
}
