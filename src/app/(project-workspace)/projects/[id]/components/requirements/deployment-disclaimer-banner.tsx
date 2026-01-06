'use client';

import { ExternalLink, Info } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

interface DeploymentDisclaimerBannerProps {
  className?: string;
}

const DEPLOYMENT_DOCS_URL = 'https://docs.kosuke.ai/deployment';

export default function DeploymentDisclaimerBanner({ className }: DeploymentDisclaimerBannerProps) {
  return (
    <div className={cn('px-4 pt-4', className)}>
      <div className="flex items-start gap-3 w-full px-4 py-3 rounded-md bg-gradient-to-r from-amber-500/10 to-background border border-amber-500/20">
        <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1 space-y-1">
          <p className="text-xs text-foreground">
            <span className="font-medium">Disclaimer:</span> The MVP will be fully functional and
            working, but it&apos;s not deployed. In order for the deployment to be done, you need to
            purchase one of the maintenance plans after the MVP has been completed. Otherwise you
            can download the code and deploy it yourself.
          </p>
          <Link
            href={DEPLOYMENT_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline underline-offset-2"
          >
            Check here the instructions for deployment
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
