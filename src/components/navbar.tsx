'use client';

import { useClerk, useOrganization } from '@clerk/nextjs';
import { LayoutDashboard, LogOut, Settings } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useUser } from '@/hooks/use-user';

import { OrganizationSwitcherComponent } from '@/components/organization-switcher';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type NavbarProps = {
  hideSignIn?: boolean;
  className?: string;
};

export default function Navbar({ hideSignIn = false, className }: NavbarProps) {
  const { clerkUser, user, isLoaded, isSignedIn, imageUrl, displayName, initials } = useUser();
  const { signOut } = useClerk();
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Get organization display name
  const orgDisplayName = organization
    ? organization.publicMetadata?.isPersonal
      ? 'Personal Workspace'
      : organization.name
    : 'No workspace';

  const handleLogout = async () => {
    try {
      await signOut({ redirectUrl: '/sign-in' });
    } catch (error) {
      console.error('Error signing out:', error);
      // Fallback redirect if signOut fails
      router.push('/sign-in');
      router.refresh();
    }
  };

  // Render user menu or auth buttons
  const renderUserSection = () => {
    if (!isLoaded) {
      return <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />;
    }

    if (isSignedIn && clerkUser) {
      return (
        <div className="flex items-center gap-3">
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-10 min-w-[200px] rounded-lg pl-3 pr-2 bg-muted/50 hover:bg-muted border border-border/50"
              >
                {isOrgLoaded && (
                  <span className="flex-1 text-sm font-medium text-muted-foreground truncate text-center max-w-[140px]">
                    {orgDisplayName}
                  </span>
                )}
                <Avatar className="h-7 w-7 cursor-pointer transition-all">
                  {imageUrl && <AvatarImage src={imageUrl} alt={displayName || 'User'} />}
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mt-1">
              <div className="flex items-center justify-start gap-2 p-2">
                <div className="flex flex-col space-y-0.5">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <OrganizationSwitcherComponent onClose={() => setDropdownOpen(false)} />
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/projects')} className="cursor-pointer">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Projects</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/settings')} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }

    if (hideSignIn) {
      return null;
    }

    return (
      <div className="flex items-center space-x-4">
        <Link href="/sign-in">
          <Button variant="default" size="sm">
            Sign In
          </Button>
        </Link>
      </div>
    );
  };

  return (
    <div className="w-full border-b border-border relative z-50">
      <header className={cn('bg-background w-full h-14', className)}>
        <div className="w-full h-full px-6 sm:px-8 md:px-16 lg:px-24 flex justify-between items-center max-w-screen-2xl mx-auto">
          <Link
            href="/"
            className="flex items-center hover:opacity-80 transition-opacity cursor-pointer"
          >
            <Image
              src="/logo-dark.svg"
              alt="Kosuke"
              width={24}
              height={24}
              className="block dark:hidden"
              priority
            />
            <Image
              src="/logo.svg"
              alt="Kosuke"
              width={24}
              height={24}
              className="hidden dark:block"
              priority
            />
            <span className="ml-2 text-xl text-foreground">Kosuke</span>
          </Link>

          {renderUserSection()}
        </div>
      </header>
    </div>
  );
}
