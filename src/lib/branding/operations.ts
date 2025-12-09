/**
 * CSS Operations
 * Handles CSS parsing and manipulation for color variables
 * Uses SandboxClient for file operations in session context
 */

import { SandboxClient } from '@/lib/sandbox';
import type { CssVariable } from '@/lib/types/branding';

/**
 * Find globals.css file in sandbox session
 * Checks common locations: app/, src/, styles/, app/global.css
 */
async function findGlobalsCss(client: SandboxClient): Promise<string | null> {
  // Common locations for globals.css
  const possiblePaths = [
    'app/globals.css',
    'src/globals.css',
    'styles/globals.css',
    'app/global.css',
  ];

  for (const path of possiblePaths) {
    try {
      // Try to read the file - if it succeeds, it exists
      await client.readFile(path);
      return path;
    } catch {
      // File doesn't exist at this path, try next
    }
  }

  return null;
}

/**
 * Extract existing CSS color variables from globals.css
 */
export async function extractExistingColors(
  projectId: string,
  sessionId: string
): Promise<CssVariable[]> {
  try {
    const client = new SandboxClient(projectId, sessionId);
    const globalsPath = await findGlobalsCss(client);

    if (!globalsPath) {
      return [];
    }

    const cssContent = await client.readFile(globalsPath);
    const colors: CssVariable[] = [];

    // Extract variables from :root block
    const rootMatch = cssContent.match(/:root\s*\{([^}]*)\}/s);
    if (rootMatch) {
      const rootVars = rootMatch[1];
      const rootColors = parseCssVariables(rootVars, 'root');
      colors.push(...rootColors);
    }

    // Extract variables from .dark block
    const darkMatch = cssContent.match(/\.dark\s*\{([^}]*)\}/s);
    if (darkMatch) {
      const darkVars = darkMatch[1];
      const darkColors = parseCssVariables(darkVars, 'dark');

      // Merge with existing root colors
      for (const darkColor of darkColors) {
        const existingColor = colors.find(c => c.name === darkColor.name);
        if (existingColor) {
          existingColor.darkValue = darkColor.lightValue;
        } else {
          colors.push({
            name: darkColor.name,
            lightValue: '',
            darkValue: darkColor.lightValue,
            scope: 'dark',
          });
        }
      }
    }

    return colors;
  } catch (error) {
    console.warn('⚠️ Error extracting existing colors:', error);
    return [];
  }
}

/**
 * Parse CSS variables from a CSS block
 */
function parseCssVariables(cssBlock: string, scope: 'root' | 'dark'): CssVariable[] {
  const variables: CssVariable[] = [];

  // Variables that are not colors (should be skipped)
  const nonColorVars = new Set([
    'radius',
    'font-sans',
    'font-mono',
    'shadow',
    'animation',
    'font-family',
    'font-size',
    'line-height',
    'spacing',
    'z-index',
  ]);

  // Match CSS custom properties: --name: value;
  const pattern = /--([^:]+):\s*([^;]+);/g;
  let match;

  while ((match = pattern.exec(cssBlock)) !== null) {
    const namePart = match[1].trim();
    const valuePart = match[2].trim();
    const name = `--${namePart}`;

    // Skip non-color variables
    if (nonColorVars.has(namePart)) {
      continue;
    }

    // Only process actual color values (oklch, hsl, rgb, or color names)
    const isColorValue =
      valuePart.includes('oklch(') ||
      valuePart.includes('hsl(') ||
      valuePart.includes('rgb(') ||
      /black|white|red|blue|green|yellow|purple|orange|gray|grey/i.test(valuePart);

    if (!isColorValue) {
      continue;
    }

    variables.push({
      name,
      lightValue: valuePart,
      scope,
    });
  }

  return variables;
}

/**
 * Format color value for CSS output
 */
export function formatColorValue(value: string): string {
  if (!value) {
    return '';
  }

  // If already in CSS format, return as-is
  if (
    value.startsWith('hsl(') ||
    value.startsWith('rgb(') ||
    value.startsWith('oklch(') ||
    value.startsWith('#')
  ) {
    return value;
  }

  // If it contains alpha (has slash), handle separately
  if (value.includes(' / ')) {
    const parts = value.split(' / ');
    if (parts.length === 2) {
      const baseValues = parts[0].trim();
      const alpha = parts[1].trim();
      return `oklch(${baseValues} / ${alpha})`;
    }
  }

  // Standard OKLCH format: "L C H" -> "oklch(L C H)"
  return `oklch(${value})`;
}

/**
 * Detect color format and validate accordingly
 * Supports: OKLCH, HSL, RGB, HEX
 */
function validateColorFormat(value: string, name: string, mode: 'light' | 'dark'): void {
  const trimmedValue = value.trim();

  // Check if it's HSL format
  if (trimmedValue.includes('hsl(') || /^\d+%?\s+\d+%\s+\d+%/.test(trimmedValue)) {
    // HSL format - skip strict validation as it will be written as-is
    return;
  }

  // Check if it's RGB format
  if (trimmedValue.includes('rgb(') || /^\d+\s+\d+\s+\d+/.test(trimmedValue)) {
    // RGB format - skip strict validation
    return;
  }

  // Check if it's HEX format
  if (trimmedValue.startsWith('#')) {
    // HEX format - skip validation
    return;
  }

  // Otherwise, validate as OKLCH format
  validateOklch(trimmedValue, name, mode);
}

/**
 * Validate OKLCH color format
 * Expected format: "L C H" where L is 0-1, C is 0-0.4, H is 0-360
 */
function validateOklch(value: string, name: string, mode: 'light' | 'dark'): void {
  // Remove oklch() wrapper if present
  let cleanValue = value;
  if (value.startsWith('oklch(')) {
    cleanValue = value.replace(/oklch\((.*?)\)/g, '$1').trim();
  }

  // Check for alpha values (should not be present)
  if (cleanValue.includes('/')) {
    const parts = cleanValue.split('/');
    if (parts.length === 2) {
      cleanValue = parts[0].trim(); // Use base values for validation
    }
  }

  // Parse the three components
  const parts = cleanValue.trim().split(/\s+/);
  if (parts.length !== 3) {
    throw new Error(
      `Invalid OKLCH format for ${name} (${mode} mode): expected 3 space-separated values, got ${parts.length}. ` +
        `Format should be: "L C H" (e.g., "0.5 0.2 200")`
    );
  }

  const [lStr, cStr, hStr] = parts;
  const l = parseFloat(lStr);
  const c = parseFloat(cStr);
  const h = parseFloat(hStr);

  // Validate ranges
  if (isNaN(l) || l < 0 || l > 1) {
    throw new Error(
      `Invalid OKLCH Lightness for ${name} (${mode} mode): ${lStr}. Must be between 0 and 1.`
    );
  }

  if (isNaN(c) || c < 0 || c > 0.4) {
    throw new Error(
      `Invalid OKLCH Chroma for ${name} (${mode} mode): ${cStr}. Must be between 0 and 0.4.`
    );
  }

  if (isNaN(h) || h < 0 || h > 360) {
    throw new Error(
      `Invalid OKLCH Hue for ${name} (${mode} mode): ${hStr}. Must be between 0 and 360.`
    );
  }
}

/**
 * Update a single color variable in CSS content
 */
export async function updateSingleColor(
  projectId: string,
  sessionId: string,
  name: string,
  value: string,
  mode: 'light' | 'dark'
): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`🎨 Updating single color ${name} for project ${projectId}, session ${sessionId}`);

    const client = new SandboxClient(projectId, sessionId);

    // Find globals.css
    const globalsPath = await findGlobalsCss(client);
    if (!globalsPath) {
      return {
        success: false,
        message: 'Could not find globals.css file in session',
      };
    }

    console.log(`🔍 Found globals.css file at ${globalsPath} in session ${sessionId}`);

    // Read CSS content
    let cssContent = await client.readFile(globalsPath);

    // Validate the color value (supports OKLCH, HSL, RGB, HEX)
    validateColorFormat(value, name, mode);

    // Format the new value based on its format
    let formattedValue: string;
    const trimmedValue = value.trim();

    if (trimmedValue.startsWith('hsl(')) {
      // Already has hsl() wrapper
      formattedValue = trimmedValue;
    } else if (/^\d+%?\s+\d+%\s+\d+%/.test(trimmedValue)) {
      // HSL values without wrapper - add it
      formattedValue = `hsl(${trimmedValue})`;
    } else if (trimmedValue.startsWith('rgb(')) {
      // Already has rgb() wrapper
      formattedValue = trimmedValue;
    } else if (trimmedValue.startsWith('#')) {
      // HEX color
      formattedValue = trimmedValue;
    } else if (trimmedValue.startsWith('oklch(')) {
      // Already has oklch() wrapper
      formattedValue = trimmedValue;
    } else {
      // Assume OKLCH values without wrapper - add it
      formattedValue = `oklch(${trimmedValue})`;
    }

    // Update the CSS content
    if (mode === 'light') {
      // Update :root block
      cssContent = updateColorInBlock(cssContent, ':root', name, formattedValue);
    } else {
      // Update .dark block
      cssContent = updateColorInBlock(cssContent, '.dark', name, formattedValue);
    }

    // Write updated CSS back to file
    await client.writeFile(globalsPath, cssContent);

    console.log(`✅ Successfully updated color ${name} in session ${sessionId}`);

    return {
      success: true,
      message: `Successfully updated color ${name} with value ${value} in ${mode} mode`,
    };
  } catch (error) {
    console.error(`❌ Error updating single color:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update color',
    };
  }
}

/**
 * Apply multiple color variables to the session's globals.css file
 */
export async function applyColorPalette(
  projectId: string,
  sessionId: string,
  colors: Array<CssVariable>
): Promise<{
  success: boolean;
  message: string;
  appliedColors: number;
}> {
  try {
    console.log(
      `🎨 Applying ${colors.length} colors to project ${projectId}, session ${sessionId}`
    );

    const client = new SandboxClient(projectId, sessionId);

    // Find globals.css
    const globalsPath = await findGlobalsCss(client);
    if (!globalsPath) {
      return {
        success: false,
        message: 'Could not find globals.css file in project',
        appliedColors: 0,
      };
    }

    // Read current CSS content
    let cssContent = await client.readFile(globalsPath);

    // Apply each color
    let appliedCount = 0;
    for (const color of colors) {
      try {
        // Apply light mode color
        cssContent = updateColorInBlock(cssContent, ':root', color.name, color.lightValue);
        appliedCount++;

        // Apply dark mode color if provided
        if (color.darkValue) {
          cssContent = updateColorInBlock(cssContent, '.dark', color.name, color.darkValue);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to apply color ${color.name}:`, error);
      }
    }

    // Write updated CSS back to file
    await client.writeFile(globalsPath, cssContent);

    console.log(`✅ Successfully applied ${appliedCount} colors to globals.css`);

    return {
      success: true,
      message: `Successfully applied ${appliedCount} colors to globals.css`,
      appliedColors: appliedCount,
    };
  } catch (error) {
    console.error(`❌ Error applying color palette:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to apply color palette',
      appliedColors: 0,
    };
  }
}

/**
 * Get font information from the session's layout files
 */
export async function getSessionFonts(
  projectId: string,
  sessionId: string
): Promise<Array<{ name: string }>> {
  try {
    const client = new SandboxClient(projectId, sessionId);

    // Look for layout.tsx file
    const layoutPath = 'app/layout.tsx';

    let layoutContent: string;
    try {
      layoutContent = await client.readFile(layoutPath);
    } catch {
      console.warn(`⚠️ Layout file not found: ${layoutPath}`);
      return [];
    }

    // Parse fonts from layout content
    return parseFontsFromLayout(layoutContent);
  } catch (error) {
    console.error(`❌ Error getting session fonts:`, error);
    return [];
  }
}

/**
 * Parse font information from layout file content
 */
function parseFontsFromLayout(layoutContent: string): Array<{ name: string }> {
  const fonts: Array<{ name: string }> = [];

  // Look for Next.js font imports
  // Matches: import { FontName, AnotherFont } from 'next/font/...'
  const fontImportPattern = /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]next\/font[^'"]*['"]/g;

  let match;
  while ((match = fontImportPattern.exec(layoutContent)) !== null) {
    const importedNames = match[1];
    // Split by comma and clean up whitespace
    const fontNames = importedNames.split(',').map(name => name.trim());

    for (const fontName of fontNames) {
      if (fontName) {
        fonts.push({ name: fontName });
      }
    }
  }

  return fonts;
}

/**
 * Update a color variable within a specific CSS block
 */
function updateColorInBlock(
  cssContent: string,
  blockSelector: ':root' | '.dark',
  varName: string,
  newValue: string
): string {
  // Escape special regex characters in selector
  const escapedSelector = blockSelector.replace('.', '\\.');

  // Find the block
  const blockPattern = new RegExp(`(${escapedSelector}\\s*\\{[^}]*)`, 's');
  const blockMatch = cssContent.match(blockPattern);

  if (!blockMatch) {
    console.warn(`⚠️ CSS block ${blockSelector} not found`);
    return cssContent;
  }

  const blockContent = blockMatch[1];

  // Escape special regex characters in variable name
  const escapedVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Update the variable within the block
  const varPattern = new RegExp(`(\\s*${escapedVarName}\\s*:\\s*)([^;]+)(;)`, 'g');

  if (!varPattern.test(blockContent)) {
    console.warn(`⚠️ Color variable ${varName} not found in ${blockSelector} block`);
    return cssContent;
  }

  // Reset regex lastIndex
  varPattern.lastIndex = 0;

  // Replace the variable value
  const updatedBlock = blockContent.replace(varPattern, `$1${newValue}$3`);

  // Replace the block in the full CSS content
  return cssContent.replace(blockPattern, updatedBlock);
}
