'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { WaitingForPaymentPreviewProps } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ExternalLink, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';

/**
 * Preview component for waiting_for_payment status
 * Shows a banner with Stripe invoice link
 */
export default function WaitingForPaymentPreview({
  stripeInvoiceUrl,
  className,
  onToggleSidebar,
  isSidebarCollapsed,
}: WaitingForPaymentPreviewProps) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              className="h-8 w-8"
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="border-amber-500 text-amber-600">
                Waiting for Payment
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              You need to pay the invoice and then we will start working on your project
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Payment Required</CardTitle>
            <CardDescription>
              Your requirements have been reviewed and validated. Please complete the payment to
              start development.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {stripeInvoiceUrl ? (
              <Button asChild className="w-full">
                <Link href={stripeInvoiceUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Pay Invoice
                </Link>
              </Button>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Invoice link will be available shortly. Please check back soon.
              </p>
            )}
            <div className="w-full rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">
              Not convinced about the pricing?{' '}
              <Link
                href="https://links.kosuke.ai/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Contact us
              </Link>
              . Bear in mind that the price will increase a lot.
            </div>
            <p className="text-center text-xs text-muted-foreground">
              By proceeding, you agree to our{' '}
              <Link
                href="https://kosuke.ai/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Terms of Service
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
