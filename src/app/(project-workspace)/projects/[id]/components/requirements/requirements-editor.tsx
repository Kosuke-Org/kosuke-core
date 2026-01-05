'use client';

import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '../chat/copy-message-content';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Custom themes matching app's design system (globals.css)
// Light: --background: oklch(1 0 0), --popover: oklch(1 0 0), --accent: oklch(0.97 0 0)
// Dark: --background: oklch(0.145 0 0), --popover: oklch(0.205 0 0), --accent: oklch(0.269 0 0)
const lightTheme = {
  colors: {
    editor: {
      text: '#1a1a1a', // --foreground: oklch(0.145 0 0)
      background: 'transparent',
    },
    menu: {
      text: '#1a1a1a', // --popover-foreground
      background: '#ffffff', // --popover: oklch(1 0 0)
    },
    tooltip: {
      text: '#1a1a1a',
      background: '#f5f5f5', // --muted: oklch(0.97 0 0)
    },
    hovered: {
      text: '#1a1a1a',
      background: '#f5f5f5', // --accent: oklch(0.97 0 0)
    },
    selected: {
      text: '#fafafa', // --primary-foreground
      background: '#1a1a1a', // --primary
    },
    disabled: {
      text: '#737373', // --muted-foreground: oklch(0.556 0 0)
      background: '#f5f5f5',
    },
    shadow: '#e5e5e5',
    border: '#e5e5e5', // --border: oklch(0.922 0 0)
    sideMenu: '#a3a3a3',
  },
  borderRadius: 10, // --radius: 0.65rem ≈ 10px
  fontFamily: 'inherit',
};

const darkTheme = {
  colors: {
    editor: {
      text: '#fafafa', // --foreground: oklch(0.985 0 0)
      background: 'transparent',
    },
    menu: {
      text: '#fafafa', // --popover-foreground
      background: '#2d2d2d', // --popover: oklch(0.205 0 0)
    },
    tooltip: {
      text: '#fafafa',
      background: '#3d3d3d', // --muted: oklch(0.269 0 0)
    },
    hovered: {
      text: '#fafafa',
      background: '#3d3d3d', // --accent: oklch(0.269 0 0) - lighter than menu bg
    },
    selected: {
      text: '#1a1a1a', // --primary-foreground
      background: '#e5e5e5', // --primary: oklch(0.922 0 0)
    },
    disabled: {
      text: '#737373', // approx --muted-foreground
      background: '#3d3d3d',
    },
    shadow: '#1a1a1a',
    border: 'rgba(255, 255, 255, 0.1)', // --border: oklch(1 0 0 / 10%)
    sideMenu: '#a3a3a3', // --muted-foreground: oklch(0.708 0 0)
  },
  borderRadius: 10, // --radius: 0.65rem ≈ 10px
  fontFamily: 'inherit',
};

interface RequirementsEditorProps {
  initialContent?: string;
  editable?: boolean;
  className?: string;
  onSave?: (markdown: string) => Promise<void>;
  onSaveStatusChange?: (status: SaveStatus) => void;
  autoSaveDelay?: number;
}

export default function RequirementsEditor({
  initialContent,
  editable = true,
  className,
  onSave,
  onSaveStatusChange,
  autoSaveDelay = 2000,
}: RequirementsEditorProps) {
  const { resolvedTheme } = useTheme();
  const [isInitialized, setIsInitialized] = useState(false);
  const [copied, setCopied] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>(initialContent || '');
  const { toast } = useToast();

  const editor = useCreateBlockNote({}, []);

  // Initialize editor with markdown content
  useEffect(() => {
    if (!editor || isInitialized) return;

    const initializeContent = async () => {
      if (initialContent) {
        try {
          const blocks = editor.tryParseMarkdownToBlocks(initialContent);
          editor.replaceBlocks(editor.document, blocks);
        } catch (error) {
          console.error('Failed to parse markdown:', error);
        }
      }
      setIsInitialized(true);
    };

    initializeContent();
  }, [editor, initialContent, isInitialized]);

  // Auto-save handler with debounce
  const handleSave = useCallback(async () => {
    if (!editor || !onSave || !editable) return;

    const currentMarkdown = editor.blocksToMarkdownLossy(editor.document);

    // Don't save if content hasn't changed
    if (currentMarkdown === lastSavedContentRef.current) {
      return;
    }

    onSaveStatusChange?.('saving');

    try {
      await onSave(currentMarkdown);
      lastSavedContentRef.current = currentMarkdown;
      onSaveStatusChange?.('saved');

      // Reset to idle after showing saved status
      setTimeout(() => {
        onSaveStatusChange?.('idle');
      }, 2000);
    } catch (error) {
      console.error('Failed to save:', error);
      onSaveStatusChange?.('error');

      setTimeout(() => {
        onSaveStatusChange?.('idle');
      }, 3000);
    }
  }, [editor, onSave, onSaveStatusChange, editable]);

  // Debounced auto-save on content change
  const handleChange = useCallback(() => {
    if (!editable || !onSave) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    saveTimeoutRef.current = setTimeout(() => {
      handleSave();
    }, autoSaveDelay);
  }, [editable, onSave, autoSaveDelay, handleSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Determine theme - use custom themes with transparent background
  const blockNoteTheme = useMemo(
    () => (resolvedTheme === 'light' ? lightTheme : darkTheme),
    [resolvedTheme]
  );

  // Copy handler for requirements content
  const handleCopy = useCallback(async () => {
    if (!editor) return;

    const markdown = editor.blocksToMarkdownLossy(editor.document);
    if (!markdown.trim()) return;

    const success = await copyToClipboard(markdown);
    if (success) {
      setCopied(true);
      toast({ description: 'Requirements copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast({
        description: 'Failed to copy requirements',
        variant: 'destructive',
      });
    }
  }, [editor, toast]);

  if (!isInitialized && initialContent) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('group/editor relative', className)}>
      {/* Copy button - appears on hover */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="absolute right-2 top-2 z-10 h-8 w-8 opacity-0 group-hover/editor:opacity-100 transition-opacity bg-background/80 hover:bg-accent"
            aria-label="Copy requirements"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy requirements</TooltipContent>
      </Tooltip>

      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={blockNoteTheme}
        onChange={handleChange}
        data-requirements-editor
        className={cn(
          // Override BlockNote menu styles to match app's dropdown styling
          '[&_.bn-container]:bg-transparent',
          '[&_.bn-editor]:bg-transparent',
          // Add vertical padding to the editor content area
          '[&_.bn-editor]:py-4',
          // Menu/dropdown styling to match shadcn dropdowns
          '[&_.mantine-Menu-dropdown]:!bg-popover [&_.mantine-Menu-dropdown]:!border-border [&_.mantine-Menu-dropdown]:!shadow-md',
          '[&_.bn-menu-dropdown]:!bg-popover [&_.bn-menu-dropdown]:!border-border [&_.bn-menu-dropdown]:!shadow-md',
          '[&_.mantine-Menu-item]:!bg-transparent',
          '[&_.mantine-Menu-item:hover]:!bg-accent',
          '[&_.mantine-Menu-item[data-hovered]]:!bg-accent',
          '[&_.mantine-Menu-item[aria-selected="true"]]:!bg-accent'
        )}
      />
    </div>
  );
}
