import { clerkService } from '@/lib/clerk';
import { clerkMiddleware, ClerkMiddlewareAuth, createRouteMatcher } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/terms',
  '/privacy',
  '/cookies',
  // Sentry monitoring tunnel (must be public for error reporting)
  '/monitoring',
  '/monitoring(.*)',
  // SEO and metadata routes
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-96x96.png',
  '/apple-touch-icon.png',
  '/opengraph-image.jpg',
  '/opengraph-image-square.jpg',
]);

const isProtectedRoute = createRouteMatcher([
  '/projects(.*)',
  '/settings(.*)',
  '/organizations(.*)',
  '/onboarding',
]);
const isOnboardingRoute = createRouteMatcher(['/onboarding']);
const isRootRoute = createRouteMatcher(['/']);
const isApiRoute = createRouteMatcher(['/api(.*)']);

export const baseMiddleware = async (auth: ClerkMiddlewareAuth, req: NextRequest) => {
  if (isApiRoute(req)) return NextResponse.next();

  const { userId, redirectToSignIn } = await auth();

  // Unauthenticated users: redirect root to sign-in, allow public routes
  if (!userId) {
    if (isRootRoute(req)) {
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }
    if (!isPublicRoute(req)) {
      return redirectToSignIn({ returnBackUrl: req.url });
    }
    return NextResponse.next();
  }

  // Authenticated users
  // Check if user has completed onboarding
  const hasCompletedOnboarding = await clerkService.hasCompletedOnboarding(userId);

  // If onboarding not completed and not on onboarding page, redirect to onboarding
  if (!hasCompletedOnboarding && !isOnboardingRoute(req)) {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }

  // If onboarding completed and on onboarding page, redirect to projects
  if (hasCompletedOnboarding && isOnboardingRoute(req)) {
    return NextResponse.redirect(new URL('/projects', req.url));
  }

  // Redirect root to projects for authenticated users
  if (isRootRoute(req)) {
    return NextResponse.redirect(new URL('/projects', req.url));
  }

  // Allow protected and public routes
  if (isProtectedRoute(req) || isPublicRoute(req)) {
    return NextResponse.next();
  }

  // Redirect unknown routes to projects
  return NextResponse.redirect(new URL('/projects', req.url));
};

export default clerkMiddleware(baseMiddleware);

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
