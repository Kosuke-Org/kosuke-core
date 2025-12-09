import { promises as fs } from 'fs';
import path from 'path';

/**
 * Get the absolute path to a project directory
 */
export function getProjectPath(projectId: string): string {
  const projectsDir = process.env.PROJECTS_DIR;
  if (!projectsDir) {
    throw new Error('PROJECTS_DIR environment variable is required');
  }
  return path.join(process.cwd(), projectsDir, projectId);
}

/**
 * Delete a directory and all its contents
 */
export async function deleteDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    console.error(`Failed to delete directory ${dirPath}:`, error);
    throw error;
  }
}
