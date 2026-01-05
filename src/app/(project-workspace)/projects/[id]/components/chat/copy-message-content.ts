import type { AssistantBlock } from '@/lib/types';

/**
 * Extracts copyable text content from a chat message.
 * For user messages: returns the content directly
 * For assistant messages: extracts text, thinking, and tool information from blocks
 */
export function extractMessageContent(
  content?: string,
  blocks?: AssistantBlock[],
  role?: 'user' | 'assistant' | 'system' | 'admin'
): string {
  // User messages: return content directly
  if (role === 'user' || !blocks || blocks.length === 0) {
    return content || '';
  }

  // Assistant messages: extract from blocks
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        parts.push(block.content);
        break;

      case 'thinking':
        parts.push(`[Thinking]\n${block.content}`);
        break;

      case 'tool': {
        const toolParts = [`[Tool: ${block.name}]`];

        // Format tool input
        if (block.input && Object.keys(block.input).length > 0) {
          const inputStr = formatToolInput(block.input);
          if (inputStr) {
            toolParts.push(`Input: ${inputStr}`);
          }
        }

        // Format tool result
        if (block.result) {
          toolParts.push(`Result: ${block.result}`);
        }

        parts.push(toolParts.join('\n'));
        break;
      }
    }
  }

  return parts.join('\n\n');
}

/**
 * Formats tool input for readable display
 */
function formatToolInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return '';

  // For simple inputs (1-2 keys), show inline
  if (entries.length <= 2) {
    return entries.map(([key, value]) => `${key}=${formatValue(value)}`).join(', ');
  }

  // For complex inputs, show as formatted JSON
  return JSON.stringify(input, null, 2);
}

/**
 * Formats a single value for display
 */
function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    // Truncate long strings
    return value.length > 100 ? `"${value.slice(0, 100)}..."` : `"${value}"`;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Copies text to clipboard and returns success status
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}
