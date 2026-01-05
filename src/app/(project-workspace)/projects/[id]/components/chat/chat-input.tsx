'use client';

import { ArrowUp, Image as ImageIcon, Loader2, Paperclip, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// Import types and hooks
import { ACCEPTED_FILE_TYPES_ACCEPT, useFileUpload } from '@/hooks/use-file-upload';
import type { ChatInputProps } from '@/lib/types';
import ChatInputAttachments from './chat-input-attachments';
import PoweredByIndicator from './powered-by-indicator';

export default function ChatInput({
  onSendMessage,
  isLoading = false,
  isStreaming = false,
  onStop,
  placeholder = 'Type a message...',
  className,
  disabled = false,
  model,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [includeContext, setIncludeContext] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaHeight, setTextareaHeight] = useState<number | undefined>(undefined);

  // Use the file upload hook for all file-related logic
  const {
    attachments,
    isDraggingOver,
    fileInputRef,
    formRef,
    handleFileChange,
    handleRemoveAttachment,
    triggerFileInput,
    clearAttachments,
    hasAttachments,
  } = useFileUpload();

  const MIN_HEIGHT = 60;
  const MAX_HEIGHT = 300;

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Temporarily reset height to auto to get accurate scrollHeight
    textarea.style.height = 'auto';

    // Calculate new height based on content, clamped between min and max
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.max(MIN_HEIGHT, Math.min(scrollHeight, MAX_HEIGHT));

    // Apply the new height
    textarea.style.height = `${newHeight}px`;
    setTextareaHeight(newHeight);
  }, [message]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If streaming, stop the stream instead of sending
    if (isStreaming && onStop) {
      onStop();
      return;
    }

    if ((!message.trim() && !hasAttachments) || isLoading || disabled) return;

    try {
      // Send the message with all attached files if present
      await onSendMessage(message.trim(), {
        includeContext,
        attachments: attachments.map(a => a.file),
      });

      // Clear the input and all attachments
      setMessage('');
      clearAttachments();
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className={cn('pb-0', className)}>
      <div
        className={cn(
          'relative flex flex-col rounded-lg border border-border transition-colors shadow-lg bg-background',
          isDraggingOver && 'border-primary border-dashed bg-primary/5'
        )}
      >
        {isDraggingOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 pointer-events-none rounded-lg">
            <div className="flex flex-col items-center text-primary">
              <ImageIcon className="h-10 w-10 mb-2" />
              <p className="text-sm font-medium">Drop images or PDFs to attach</p>
            </div>
          </div>
        )}

        <ChatInputAttachments
          attachments={attachments}
          onRemoveAttachment={handleRemoveAttachment}
        />

        <Textarea
          ref={textareaRef}
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading || disabled}
          className={cn(
            'resize-none border-0 bg-transparent! px-3 py-3 shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm',
            textareaHeight !== undefined && textareaHeight >= MAX_HEIGHT
              ? 'overflow-y-auto'
              : 'overflow-y-hidden'
          )}
          style={{ height: textareaHeight ?? MIN_HEIGHT }}
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
        />

        {/* Footer with Powered by and action buttons */}
        <div className="flex items-center justify-between px-3 py-2">
          <PoweredByIndicator model={model} />

          <div className="flex items-center gap-1">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept={ACCEPTED_FILE_TYPES_ACCEPT}
              multiple
              className="hidden"
              id="file-upload"
            />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isLoading || disabled}
              onClick={triggerFileInput}
              title="Attach images or PDFs (you can also paste or drag & drop)"
            >
              <Paperclip className="h-5 w-5" />
              <span className="sr-only">Attach images or PDFs</span>
            </Button>

            <Button
              type="submit"
              size="icon"
              variant={
                isStreaming ? 'outline' : !message.trim() && !hasAttachments ? 'outline' : 'default'
              }
              className="h-8 w-8"
              disabled={
                disabled || (!isStreaming && ((!message.trim() && !hasAttachments) || isLoading))
              }
            >
              {isLoading && !isStreaming ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isStreaming ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <ArrowUp className="h-5 w-5" />
              )}
              <span className="sr-only">{isStreaming ? 'Stop generation' : 'Send message'}</span>
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
