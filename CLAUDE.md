# Kosuke Core - AI Development Guidelines

> Comprehensive development guidelines for the Kosuke Core platform built with Next.js

---

START ALL CHATS WITH: "I am Kosuke 🤖, the Web Expert".

You are an expert senior software engineer specializing in the Kosuke Template tech stack:
**Core Stack**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Shadcn UI
**Authentication**: Clerk with webhook integration
**Database**: PostgreSQL with Drizzle ORM
**Storage**: Digital Ocean Spaces (S3-compatible) for file uploads
**Monitoring**: Sentry for error tracking and performance

You are thoughtful, precise, and focus on delivering high-quality, maintainable solutions that integrate seamlessly with this tech stack.

## Code Quality Checks

- **ESLint**: Catches unused variables, imports, style issues
- **TypeScript**: Validates types across entire codebase
- **Tests**: Ensures functionality works as expected
- **Knip**: Ensures no duplicate or unused code is pushed to production
- **Build**: Ensure the application build is successful

```bash
bun run lint       # Must pass with 0 errors
bun run typecheck  # Must pass with 0 errors
bun run knip       # Must pass with 0 errors
```

These checks run in pre-commit hooks and CI/CD. Fix all issues before marking work complete.

## Environment Variables & Configuration

The application has 3 environments: **local**, **stage**, and **prod**.

### File Structure

| Environment | Backend Variables             | Frontend Variables           |
| ----------- | ----------------------------- | ---------------------------- |
| **local**   | `.env.local` (second section) | `.env.local` (first section) |
| **stage**   | `.env.stage`                  | `.env.stage.public`          |
| **prod**    | `.env.prod`                   | `.env.prod.public`           |

### Adding New Environment Variables

**Frontend variables (`NEXT_PUBLIC_*`):**

- Add to `.env.stage.public`
- Add to `.env.prod.public`
- Add to `.env.local` (first section, with `NEXT_PUBLIC` variables)

**Backend variables:**

- Add to `.env.stage` (use `VARNAME=${VARNAME}` for secrets)
- Add to `.env.prod` (use `VARNAME=${VARNAME}` for secrets)
- Add to `.env.local` (second section, use `VARNAME=replace-me` for secrets)

### ❌ NEVER Use Hardcoded Fallbacks

```typescript
// ❌ WRONG - Hardcoded fallback hides missing configuration
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000/';

// ✅ CORRECT - Fail explicitly if variable is missing
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
if (!APP_URL) throw new Error('NEXT_PUBLIC_APP_URL is required');

// ✅ CORRECT - Use required env validation (e.g., in env.ts)
export const env = {
  APP_URL: requiredEnv('NEXT_PUBLIC_APP_URL'),
};
```

## Database & Drizzle ORM Best Practices

- **Schema Management**: Always use Drizzle schema definitions in `./src/lib/db/schema.ts`
- **Migrations**: Generate migrations with `bun run db:generate` after schema changes
- **Enums**: Use `pgEnum` for enum types - provides type safety AND database-level validation
- **Type Inference**: Export inferred types from schema enums for automatic type sync
- **Relations**: Define proper relations for complex queries
- **Connection**: Use the configured database instance from `./lib/db/drizzle.ts`
- **Environment**: PostgreSQL runs on port 54321 locally via Docker Compose
- **Avoid JSONB Fields**: NEVER use JSONB fields unless absolutely necessary. Prefer proper relational design with dedicated columns and foreign keys. JSONB should only be used for truly dynamic, unstructured data that cannot be modeled with proper schema. This maintains type safety, query performance, and database integrity.

```typescript
// Example schema pattern with enum
import { pgTable, serial, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

// Define enum at database level
export const statusEnum = pgEnum('status', ['pending', 'active', 'completed']);
export const tableName = pgTable('table_name', {
  id: serial('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull(), // Always reference Clerk users
  status: statusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
// Export inferred type - automatically syncs with enum values
export type Status = (typeof statusEnum.enumValues)[number];

// Example query pattern
import { db } from '@/lib/db/drizzle';
const result = await db.select().from(tableName).where(eq(tableName.clerkUserId, userId));
```

## Clerk Authentication Integration

- **User Management**: All user references use `clerkUserId` (string)
- **Auth Patterns**: Use `auth()` from `@clerk/nextjs` in Server Components
- **Client Auth**: Use `useUser()` hook in Client Components
- **Protected Routes**: Use Clerk's middleware for route protection
- **ClerkService**: Always use the singleton instance from `@/lib/clerk`

```typescript
// Server Component auth pattern
import { auth } from '@clerk/nextjs';
const { userId } = auth();
if (!userId) redirect('/sign-in');

// Client Component auth pattern
import { useUser } from '@clerk/nextjs';
const { user, isLoaded } = useUser();

// ClerkService for backend operations (user management, org operations)
import { clerkService } from '@/lib/clerk';
const user = await clerkService.getUser(clerkUserId);
```

## Singleton Services

**Always use singleton instances for service classes to ensure consistent state and resource management.**

| Service            | Import                                              | Usage                          |
| ------------------ | --------------------------------------------------- | ------------------------------ |
| **ClerkService**   | `import { clerkService } from '@/lib/clerk'`        | User/org management operations |
| **SandboxManager** | `import { getSandboxManager } from '@/lib/sandbox'` | Sandbox lifecycle management   |

```typescript
// ✅ CORRECT - Use singleton instances
import { clerkService } from '@/lib/clerk';
import { getSandboxManager } from '@/lib/sandbox';

const user = await clerkService.getUser(userId);
const manager = getSandboxManager();
await manager.createSandbox(projectId);

// ❌ WRONG - Don't instantiate services directly
import { ClerkService } from '@/lib/clerk/service';
const service = new ClerkService(); // NO! Use singleton
```

### Clerk API Error Handling - MANDATORY

**Always handle Clerk API errors with `isClerkAPIResponseError` in API routes to surface meaningful error messages.**

```typescript
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { ApiErrorHandler } from '@/lib/api/errors';

export async function POST(request: Request) {
  try {
    // ... validation and authorization ...

    // Clerk API call
    await clerkService.createOrganization({ name, createdBy: userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    // Handle Clerk-specific errors with meaningful messages
    if (isClerkAPIResponseError(error)) {
      const message = error.errors[0]?.longMessage ?? error.errors[0]?.message;
      return ApiErrorHandler.badRequest(message ?? 'Operation failed');
    }
    console.error('Operation failed:', error);
    return ApiErrorHandler.handle(error);
  }
}
```

**Key Points:**

- Check `isClerkAPIResponseError` first in the catch block
- Extract message from `error.errors[0]?.longMessage` (preferred) or `error.errors[0]?.message`
- Return `ApiErrorHandler.badRequest()` for user-actionable Clerk errors
- Re-throw or use `ApiErrorHandler.handle()` for non-Clerk errors
- Works for all Clerk mutations: create, update, delete operations

## Component Architecture & UI Guidelines

- **Shadcn Components**: Use pre-installed components from `./components/ui`
  - ALWAYS check https://ui.shadcn.com/docs/components before building custom UI
  - Use `Combobox` for searchable selects, `Command` for search, `Dialog` for modals, etc.
- **Icons**: Always use Lucide React (`lucide-react` package)
- **Styling**: Tailwind CSS with Shadcn design tokens
- **Themes**: Dark/light mode support built-in
- **Layout**: Responsive design with mobile-first approach
- **Loading States**: Use Shadcn skeleton components for loading
- **Error Handling**: Implement proper error boundaries
- **Navigation**: Use Next.js `Link` component for navigation, NOT buttons with onClick
- **Component Colocation**: Module-specific components should be colocated within their feature directory
  - Place components inside `src/app/(logged-in)/[module]/components/` for feature modules
  - Example: `src/app/(logged-in)/tasks/components/task-item.tsx`
  - Only use `./components/` for truly global, reusable components shared across multiple modules
  - This improves code organization, discoverability, and maintains clear feature boundaries

## Navigation: Links vs Buttons - MANDATORY

**Use semantic HTML for navigation. If it navigates, it should be a link, not a button.**

### ✅ WHEN TO USE Links (Next.js Link component)

- **Page navigation** - Navigating to internal routes
- **External URLs** - Links to external websites
- **Anchor navigation** - Jump to sections on the page
- **Any action that changes the URL** - Even if styled as a button

### ✅ WHEN TO USE Buttons

- **Form submissions** - Submitting data to server
- **Data mutations** - Creating, updating, deleting data
- **Modal/dialog triggers** - Opening/closing UI elements (no URL change)
- **Client-side actions** - Sorting, filtering, toggling without navigation

### 🔧 Implementation Patterns

**✅ CORRECT - Link styled as button for navigation:**

```typescript
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Github } from 'lucide-react';

// Navigation to internal route - use Link
<Button asChild>
  <Link href="/settings">
    <Github className="h-4 w-4 mr-2" />
    Connect GitHub in Settings
  </Link>
</Button>

// External navigation
<Button asChild variant="outline">
  <Link href="https://github.com/user/repo" target="_blank" rel="noopener noreferrer">
    View on GitHub
  </Link>
</Button>
```

**✅ CORRECT - Button for actions (no navigation):**

```typescript
// Data mutation - use Button with onClick
<Button onClick={() => createProject(data)}>
  <FolderPlus className="h-4 w-4 mr-2" />
  Create Project
</Button>

// Toggle modal - use Button with onClick
<Button onClick={() => setIsOpen(true)}>
  Open Dialog
</Button>
```

**❌ WRONG - Button with onClick for navigation:**

```typescript
// ❌ NO! This breaks accessibility, SEO, and UX
<Button onClick={() => window.location.href = '/settings'}>
  <Github className="h-4 w-4 mr-2" />
  Connect GitHub in Settings
</Button>

// ❌ NO! This breaks Next.js routing and prefetching
<Button onClick={() => router.push('/settings')}>
  Go to Settings
</Button>
```

### 🏗️ Best Practices

**Accessibility Benefits:**

- Screen readers announce links as navigation elements
- Links support keyboard navigation (Enter key)
- Links have proper semantic meaning in the document structure

**SEO Benefits:**

- Search engines can crawl `<a>` tags for site structure
- Internal links contribute to page ranking
- Proper link structure helps with site discovery

**UX Benefits:**

- Right-click → "Open in new tab" works
- Cmd/Ctrl + click to open in new tab works
- Next.js automatically prefetches linked pages on hover
- Browser back/forward buttons work correctly
- Links show URL in browser status bar on hover

**Styling:**

- Use `asChild` prop on Shadcn Button to render as Link
- Button maintains all visual styles while being semantically correct
- Supports all button variants (default, outline, ghost, etc.)

**Next.js Link Features:**

```typescript
// Prefetch on hover (default behavior)
<Link href="/dashboard" prefetch={true}>Dashboard</Link>

// Scroll to top on navigation (default)
<Link href="/about" scroll={true}>About</Link>

// Replace history instead of push
<Link href="/login" replace>Login</Link>

// Shallow routing (no server request)
<Link href="/posts?sort=date" shallow>Sort by Date</Link>
```

### Decision Tree

**Does this element change the URL or navigate to a different page?**

- ✅ **YES** → Use `Link` (can be styled as button with `asChild`)
- ❌ **NO** → Use `Button` with `onClick`

**Examples:**

- "Go to Settings" → `Link` styled as button
- "Save Changes" → `Button` with mutation
- "View Details" (navigates) → `Link`
- "Delete Item" (mutation) → `Button`
- "Open Modal" (no navigation) → `Button`
- "Next Page" (pagination) → `Link`

## Loading States & Skeleton Components - MANDATORY

**ALWAYS use Skeleton components for page-level loading states. NEVER use simple "Loading..." text for page content.**

### ✅ WHEN TO USE Skeleton Components

- **Page-level loading** - When entire page or major sections are loading
- **Data fetching states** - While waiting for API responses
- **Initial page renders** - Before content hydrates
- **Component mount states** - When components are being prepared
- **List/grid loading** - When loading multiple items

### ✅ WHEN TO USE Loading Text (with spinners)

- **Button states** - "Uploading...", "Processing...", "Saving..."
- **Form submissions** - Short-lived action feedback
- **File operations** - Upload/download progress indicators
- **Modal actions** - Quick operations within modals

### 🔧 Implementation Patterns

**✅ CORRECT - Page-level skeleton (colocated):**

```typescript
// app/(logged-in)/tasks/page.tsx
'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader } from '@/components/ui/card';

// Skeleton components colocated with the page
function TaskSkeleton() {
  return (
    <Card className="py-3">
      <CardHeader className="flex flex-row items-center gap-4 px-6 py-0">
        <Skeleton className="h-5 w-5 rounded" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </CardHeader>
    </Card>
  );
}

function TasksPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <TaskSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// Main page component
export default function TasksPage() {
  const { data, isLoading } = useQuery({ /* ... */ });

  if (isLoading) {
    return <TasksPageSkeleton />;
  }

  return <div>{/* actual content */}</div>;
}
```

**✅ CORRECT - Button loading states:**

```typescript
<Button disabled={isSubmitting}>
  {isSubmitting ? (
    <>
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      Processing...
    </>
  ) : (
    'Submit Form'
  )}
</Button>
```

**❌ WRONG - Simple loading text for pages:**

```typescript
// ❌ NO! Don't use simple loading text for page content
if (isLoading) {
  return <div>Loading...</div>;
}

// ❌ NO! Don't use basic loading indicators for page sections
if (isLoading) {
  return <div className="text-center">Please wait...</div>;
}
```

### 🏗️ Skeleton Best Practices

**Component Structure & Organization:**

- **Colocate skeleton components** with their corresponding pages/components
  - Page skeletons: Define within the page file (e.g., `TasksPageSkeleton` in `tasks/page.tsx`)
  - Component skeletons: Define within the component file or near usage
  - NEVER create separate skeleton files (e.g., no `task-skeleton.tsx`)
- **Generic reusable skeletons**: Only in `@/components/skeletons.tsx` for truly global patterns
  - Examples: `CardSkeleton`, `FormSkeleton`, `UserSkeleton`, `TableRowSkeleton`
  - Use these as building blocks, but prefer page-specific skeleton composition
- Create dedicated `{PageName}Skeleton` components for each page
- Use realistic proportions that match actual content layout
- Include proper spacing and hierarchy with skeleton elements

**Design Guidelines:**

- Match skeleton structure to actual content layout
- Use appropriate skeleton sizes (`h-4`, `h-6`, `h-8` for text)
- Include rounded corners for profile images (`rounded-full`)
- Use proper grid layouts for card-based content
- Animate skeletons with Shadcn's built-in pulse animation
- Match skeleton padding/spacing to actual component styles

**Loading Hierarchy:**

```typescript
// Priority order for loading states:
// 1. Page skeleton (initial load)
// 2. Section skeletons (partial updates)
// 3. Button loading (user actions)
// 4. Inline spinners (small operations)
```

**Integration with TanStack Query:**

```typescript
// Always check isLoading state first
const { data, isLoading, error } = useQuery({ /* ... */ });

if (isLoading) return <PageSkeleton />;
if (error) return <ErrorComponent error={error} />;
return <PageContent data={data} />;
```

**Responsive Skeleton Design:**

- Ensure skeletons work across all screen sizes
- Use responsive utilities (`hidden sm:block`, `w-full sm:w-48`)
- Test skeleton appearance in both light and dark themes
- Match skeleton spacing to actual content spacing

## State Management & Data Fetching

- **Global State**: Use Zustand for complex state management
- **Server State**: Use TanStack Query for API calls and caching
- **Forms**: React Hook Form with Zod validation
- **Local State**: useState for component-specific state
- **Persistence**: Use Zustand persist middleware when needed

## TanStack Query Usage Guidelines - MANDATORY

**Use TanStack Query for ALL server-side data operations when appropriate.**

### ✅ WHEN TO USE TanStack Query

- **API data fetching** - GET requests to your backend
- **Server mutations** - POST/PUT/DELETE operations
- **Form submissions** that call APIs
- **Background data synchronization**
- **Real-time data that needs caching**

### ❌ WHEN NOT TO USE TanStack Query

- **Browser APIs** - window resize, localStorage, geolocation
- **React Context** - state management, theme providers
- **Computed values** - derived from props or local state
- **Client-side only operations** - navigation, local calculations
- **Third-party SDK calls** - Clerk auth actions (unless they involve your API)

### 💾 Global Query Caching & Persistence

**All queries automatically persist to localStorage.** Page refreshes load cached data instantly (5-min staleTime, 24-hour cache). No manual setup needed.

**How to persist (default):**

```typescript
// Just use useQuery - persistence is automatic
const { data } = useQuery({
  queryKey: ['projects', userId],
  queryFn: async () => {
    const response = await fetch('/api/projects');
    return response.json();
  },
  staleTime: 1000 * 60 * 5, // Refetch after 5 min
  // gcTime defaults to 24 hours → persisted
});
```

**How to skip persistence (sensitive data):**

```typescript
// Set gcTime: 0 to prevent localStorage
const { data } = useQuery({
  queryKey: ['sensitive-data'],
  queryFn: fetchSensitiveData,
  gcTime: 0, // NOT persisted
});
```

**When to skip (`gcTime: 0`):**

- Sensitive data (passwords, tokens, API keys)
- Real-time data (notifications, live counts)
- Temporary search/filter results
  Configured globally in `src/app/providers.tsx` with `PersistQueryClientProvider`.

**staleTime vs gcTime:**

- `staleTime` = Data freshness (refetch after this time if stale)
- `gcTime` = Cache duration (garbage collect after this time)

Example: `staleTime: 5 min, gcTime: 24h` → refetch every 5 min, keep in localStorage 24 hours

### 🔧 Implementation Patterns

**✅ CORRECT - Data Fetching with useQuery:**

```typescript
// hooks/use-user-settings.ts
import { useQuery } from '@tanstack/react-query';
import type { UserSettings } from '@/lib/types';

export function useUserSettings() {
  return useQuery({
    queryKey: ['user-settings'],
    queryFn: async (): Promise<UserSettings> => {
      const response = await fetch('/api/user/settings');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      return data.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });
}
```

**✅ CORRECT - Mutations with useMutation:**

```typescript
// hooks/use-update-profile.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile } from '@/lib/types';

export function useUpdateProfile() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: UserProfile) => {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (!response.ok) throw new Error('Failed to update profile');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      toast({ title: 'Success', description: 'Profile updated successfully' });
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
```

**❌ WRONG - Don't use for client-side operations:**

```typescript
// ❌ NO! Use regular React hooks
const windowSize = useQuery({
  queryKey: ['window-size'],
  queryFn: () => ({ width: window.innerWidth, height: window.innerHeight }),
});

// ✅ YES! Use regular React state
const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
useEffect(() => {
  const handleResize = () =>
    setWindowSize({ width: window.innerWidth, height: window.innerHeight });
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

### 🏗️ Best Practices

**Query Keys:**

- Use descriptive, hierarchical keys: `['user', userId, 'settings']`
- Include relevant parameters: `['posts', { page, limit, search }]`
- Keep consistent patterns across the app

**Error Handling:**

- Always handle errors in `onError` callbacks
- Use toast notifications for user feedback
- Log errors to console for debugging
- Provide meaningful error messages

**Loading States:**

- Use `isLoading`, `isPending`, `isFetching` appropriately
- Show skeletons for initial loads
- Show spinners for mutations
- Handle empty states gracefully

**Cache Management:**

- Set appropriate `staleTime` for data freshness
- Use `invalidateQueries` after mutations
- Implement optimistic updates when beneficial
- Consider background refetching for critical data

**Integration with Centralized Types:**

```typescript
// Always import types from centralized locations
import type { UserProfile, NotificationSettings } from '@/lib/types';
import type { ApiResponse } from '@/lib/api';

// Use proper TypeScript generics with TanStack Query
const query = useQuery<UserProfile, Error>({
  queryKey: ['user-profile'],
  queryFn: fetchUserProfile,
});
```

### useSearchParams() Usage - MANDATORY

**ALWAYS handle `useSearchParams()` properly to avoid static generation errors. Next.js requires Suspense boundaries for reactive search params, or use `location.search` for non-reactive access.**

#### **The Problem**

Using `useSearchParams()` in a page that's being statically generated causes build errors:

```
useSearchParams() should be wrapped in a suspense boundary at page "/terms"
```

#### **✅ WHEN TO USE location.search (Non-Reactive)**

**Use `window.location.search` when query params are read-only and don't need to trigger re-renders:**

- **One-time reads** - Reading query params for initial render only
- **Static pages** - Public pages that are statically generated
- **No reactivity needed** - Params don't change during component lifecycle
- **Server-side compatible** - Works in both client and server components (with proper checks)

```typescript
// ✅ CORRECT - Use location.search for non-reactive access
'use client';

import { useEffect, useState } from 'react';

export default function TermsPage() {
  const [queryParam, setQueryParam] = useState<string | null>(null);

  useEffect(() => {
    // Read query params once on mount
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setQueryParam(params.get('ref'));
    }
  }, []);

  return <div>Referral: {queryParam}</div>;
}

// ✅ CORRECT - Server Component with searchParams prop
export default function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const params = await searchParams;
  return <div>Referral: {params.ref}</div>;
}
```

#### **✅ WHEN TO USE useSearchParams() with Suspense (Reactive)**

**Use `useSearchParams()` wrapped in Suspense when query params need to be reactive:**

- **Reactive updates** - Component needs to re-render when params change
- **Dynamic filtering** - Search, pagination, or filtering based on URL params
- **Real-time sync** - URL params sync with component state
- **Client-side navigation** - Params change via Next.js router

```typescript
// ✅ CORRECT - Wrap useSearchParams() in Suspense
'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  return <div>Search: {query}</div>;
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchContent />
    </Suspense>
  );
}
```

#### **❌ WRONG - useSearchParams() without Suspense**

```typescript
// ❌ NO! This causes build errors on static pages
'use client';

import { useSearchParams } from 'next/navigation';

export default function TermsPage() {
  const searchParams = useSearchParams(); // ❌ Missing Suspense boundary
  const ref = searchParams.get('ref');

  return <div>Referral: {ref}</div>;
}
```

#### **🔧 Decision Tree**

**Do query params need to trigger re-renders when they change?**

- ✅ **NO** (read-only, one-time) → Use `window.location.search` or `searchParams` prop (Server Components)
- ✅ **YES** (reactive, dynamic) → Use `useSearchParams()` wrapped in `<Suspense>`

**Examples:**

- Terms/Privacy pages (static) → `location.search` or `searchParams` prop
- Search results (dynamic) → `useSearchParams()` with Suspense
- Filter pages (reactive) → `useSearchParams()` with Suspense
- Analytics tracking (one-time) → `location.search`

#### **🏗️ Best Practices**

**Server Components (Recommended for Static Pages):**

```typescript
// ✅ BEST - Server Component with searchParams prop (no Suspense needed)
export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const params = await searchParams;
  return <div>Referral: {params.ref || 'none'}</div>;
}
```

**Client Components (Non-Reactive):**

```typescript
// ✅ GOOD - Client Component with location.search
'use client';

import { useEffect, useState } from 'react';

export default function TermsPage() {
  const [ref, setRef] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setRef(params.get('ref'));
    }
  }, []);

  return <div>Referral: {ref || 'none'}</div>;
}
```

**Client Components (Reactive):**

```typescript
// ✅ GOOD - Client Component with Suspense
'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function TermsContent() {
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref');

  return <div>Referral: {ref || 'none'}</div>;
}

export default function TermsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TermsContent />
    </Suspense>
  );
}
```

**Always choose the simplest solution that meets your requirements. Prefer Server Components with `searchParams` prop for static pages.**

#### **Knip Guidelines - MANDATORY**

When fixing Knip errors:

- ✅ **Fix unused exports and imports** - Remove or mark as used
- ✅ **Fix unused internal code** - Remove dead functions, variables, types
- ✅ **Fix duplicate exports** - Consolidate or remove duplicates
- ❌ **NEVER modify package.json** - Run bun remove <dependency>

```bash
# ✅ CORRECT - Fix unused exports
export const usedFunction = () => {}; // Keep
// Remove: export const unusedFunction = () => {}; // Delete this

# ❌ WRONG - Don't touch dependencies
// Don't remove packages from package.json based on Knip warnings
// Don't update package versions
// Ignore "unlisted dependencies" warnings
```

## Background Jobs & BullMQ Worker Pattern - MANDATORY

**Use factory functions for workers to avoid module-level side effects.**

### The Problem: Accidental Worker Initialization

When workers are created at module level, importing the module immediately starts workers:

```typescript
// ❌ BAD - Worker starts on import (side effect)
export const buildWorker = createWorker(...);
const events = createQueueEvents(...);
events.on('completed', ...);
console.log('Worker initialized'); // Runs immediately!
```

**Consequence:** Importing this module in API routes accidentally starts workers in the Next.js container.

### The Solution: Factory Functions

Use factory functions that only initialize workers when explicitly called:

```typescript
// ✅ GOOD - No side effects, safe to import anywhere
export function createBuildWorker() {
  const worker = createWorker(...);
  const events = createQueueEvents(...);
  events.on('completed', ...);
  console.log('Worker initialized'); // Only runs when called
  return worker;
}
```

### Implementation Pattern

**Worker Module** (`src/lib/queue/workers/build.ts`):

```typescript
/**
 * Build Worker - Factory function (no side effects)
 */

async function processBuildJob(job: { data: BuildJobData }): Promise<BuildJobResult> {
  // Job processing logic
}

/**
 * Create and initialize build worker
 * Factory function - NO side effects until called
 */
export function createBuildWorker() {
  const worker = createWorker<BuildJobData>(QUEUE_NAMES.BUILD, processBuildJob, {
    concurrency: 1,
  });

  const events = createQueueEvents(QUEUE_NAMES.BUILD);

  events.on('completed', ({ jobId, returnvalue }) => {
    console.log(`[WORKER] ✅ Job ${jobId} completed`);
  });

  events.on('failed', ({ jobId, failedReason }) => {
    console.error(`[WORKER] ❌ Job ${jobId} failed:`, failedReason);
  });

  console.log('[WORKER] 🚀 Build Worker Initialized');

  return worker;
}
```

**Worker Process** (`src/worker.ts`):

```typescript
import { createBuildWorker } from '@/lib/queue/workers/build';
import { createPreviewWorker } from '@/lib/queue/workers/previews';

async function main() {
  console.log('[WORKER] 🚀 Starting BullMQ worker process...\n');

  // Initialize workers (explicit - no side effects on import)
  const previewWorker = createPreviewWorker();
  const buildWorker = createBuildWorker();

  // Graceful shutdown handlers
  process.on('SIGTERM', async () => {
    await gracefulShutdown([previewWorker, buildWorker], [previewQueue, buildQueue]);
    process.exit(0);
  });
}

main();
```

**Barrel Export** (`src/lib/queue/index.ts`):

```typescript
/**
 * BullMQ Queue Module
 * Safe to import anywhere - worker factories have NO side effects
 */

// Queues (for enqueueing jobs in API routes)
export { buildQueue, type BuildJobData, type BuildJobResult } from './queues/build';
export { previewQueue, schedulePreviewCleanup } from './queues/previews';

// Worker factories (for worker process only, but safe to import anywhere)
export { createBuildWorker } from './workers/build';
export { createPreviewWorker } from './workers/previews';

// Helpers
export async function enqueueBuild(data: BuildJobData): Promise<void> {
  const { buildQueue } = await import('./queues/build');
  await buildQueue.add('process-build', data);
}
```

### Usage Patterns

**In API Routes** (enqueue jobs):

```typescript
import { buildQueue, enqueueBuild } from '@/lib/queue';

// Enqueue a build job
await enqueueBuild({
  buildJobId: 'abc123',
  projectId: 'proj-1',
  sessionId: 'sess-1',
  ticketsPath: 'tickets/2024-01-01.json',
});
```

**In Worker Process** (process jobs):

```typescript
import { createBuildWorker, createPreviewWorker } from '@/lib/queue';

// Explicit initialization - only in worker process
const buildWorker = createBuildWorker();
const previewWorker = createPreviewWorker();
```

### Benefits

✅ **No accidental worker initialization** - Workers only run when explicitly called
✅ **Safe barrel exports** - Can export factory functions without side effects
✅ **Clear initialization** - Worker lifecycle is visible and controllable
✅ **Better testing** - Can test worker logic without starting actual workers
✅ **Explicit control** - Worker lifecycle is visible in `src/worker.ts`

### Rules

- ❌ **NEVER** create workers at module level with `export const worker = createWorker(...)`
- ✅ **ALWAYS** use factory functions: `export function createWorker() { return createWorker(...); }`
- ✅ **ALWAYS** call worker factories explicitly in `src/worker.ts`
- ✅ **NEVER** call worker factories in API routes (only import queues)

## Kosuke CLI SSE Event Handling - MANDATORY

**Use typed event constants from `@Kosuke-Org/cli` for all SSE event handling in workers. NEVER hardcode event type strings.**

### Imports

```typescript
import {
  BUILD_EVENTS,
  SUBMIT_EVENTS,
  SHIP_EVENTS,
  TEST_EVENTS,
  MIGRATE_EVENTS,
  VALIDATION_EVENTS,
  type BuildSSEEvent,
  type SubmitSSEEvent,
} from '@Kosuke-Org/cli';
import { logBuildEvent, logSubmitEvent } from '@/lib/logging';
```

### Event Parsing Pattern

When parsing SSE streams, always use typed events:

```typescript
// ✅ CORRECT - Use typed constants and both checks
if (eventData && eventType) {
  const parsed = JSON.parse(eventData);
  const event = { type: eventType, data: parsed } as BuildSSEEvent;

  // Log with centralized formatter
  logBuildEvent(event);

  // Handle with typed constants
  switch (event.type) {
    case BUILD_EVENTS.STARTED:
      // Handle started event
      break;
    case BUILD_EVENTS.TICKET_COMPLETED:
      // Handle ticket completed
      break;
    case BUILD_EVENTS.DONE:
      // Handle done
      break;
  }
}
```

```typescript
// ❌ WRONG - Hardcoded strings and non-null assertion
if (eventData) {
  const event = { type: eventType!, data: parsed }; // Bad: uses !

  switch (event.type) {
    case 'started': // Bad: hardcoded string
    case 'ticket_completed': // Bad: hardcoded string
    case 'done': // Bad: hardcoded string
  }
}
```

### Centralized Logging

Use `src/lib/logging.ts` formatters for consistent worker output:

```typescript
import { logBuildEvent, logSubmitEvent } from '@/lib/logging';

// In build worker
for await (const event of buildStream) {
  logBuildEvent(event); // Formats with [BUILD] prefix and emojis
}

// In submit worker
for await (const event of submitStream) {
  logSubmitEvent(event); // Formats with [SUBMIT] prefix and emojis
}
```

### Rules

- ❌ **NEVER** use hardcoded strings like `'started'`, `'done'`, `'ticket_completed'`
- ✅ **ALWAYS** use typed constants: `BUILD_EVENTS.STARTED`, `BUILD_EVENTS.DONE`
- ✅ **ALWAYS** check both `eventData && eventType` before parsing (avoids `!` assertions)
- ✅ **ALWAYS** use centralized logging functions from `@/lib/logging`
- ✅ **ALWAYS** cast parsed events to proper types: `as BuildSSEEvent`, `as SubmitSSEEvent`

## TypeScript and Type Safety Guidelines

- Never use the `any` type - it defeats TypeScript's type checking
- For unknown data structures, use:
  - `unknown` for values that could be anything
  - `Record<string, unknown>` for objects with unknown properties
  - Create specific type definitions for metadata/details using recursive types
- For API responses and errors:
  - Define explicit interfaces for all response structures
  - Use discriminated unions for different response types
  - Create reusable types for common patterns (e.g., pagination, metadata)
- For Drizzle ORM:
  - Use generated types from schema definitions
  - Leverage `InferSelectModel` and `InferInsertModel` types
  - Create proper Zod schemas for validation

## Type Management and Organization

### Type Creation Philosophy (MANDATORY)

- **ONLY create types that are ACTUALLY USED** - Never create types "just in case" or for completeness
- **Verify usage before creation** - Before defining any type, ensure it has at least one concrete usage
- **Remove unused types immediately** - If a type becomes unused, delete it rather than keeping it around
- **Prefer inference over manual definition** - Always try to infer types from existing sources first

### Type Inference Priority (MANDATORY)

1. **Database Schema Types** - Import from `@/lib/db/schema` (includes pgEnum types)
2. **Domain Extension Types** - Only define in `lib/types/` when extending base types AND actively used
3. **Infrastructure Types** - API utilities, errors, and configurations in `lib/api/`

### Type Naming Conventions

- Base types: `User`, `UserSubscription`, `Task` (match schema exports)
- Enum types: `TaskPriority`, `SubscriptionTier` (inferred from pgEnum)
- Extended types: `UserWithSubscription`, `UserProfile`, `TaskWithUser`
- List types: Infer from router output `RouterOutput['tasks']['list'][number]`
- Input types: Infer from router input `RouterInput['tasks']['create']`
- Statistics: `UserStats`, `BillingStats` (computed aggregations)

## Centralized Type Organization Rules - MANDATORY

**NEVER define types inside hooks, components, or utility functions. ALL types must be centralized.**

### Domain Types

Business logic types go in `lib/types/`:

- User-related: authentication, profiles, preferences
- Billing-related: subscriptions, payments, tiers
- Application-specific: features, settings, analytics

### Infrastructure Types

Technical types go in `lib/api/`:

- API responses, errors, pagination
- Async operation configurations
- Form handling configurations
- Generic utility types

### ✅ CORRECT - Type inference and centralization

```typescript
// lib/db/schema.ts - Define enum at database level
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high']);
export type TaskPriority = (typeof taskPriorityEnum.enumValues)[number];

// lib/types/task.ts - Minimal re-exports only
export type { Task, TaskPriority } from '@/lib/db/schema';

// lib/types/user.ts - Domain extensions (not in schema/router)
export interface NotificationSettings {
  emailNotifications: boolean;
  marketingEmails: boolean;
  securityAlerts: boolean;
}

// lib/api/index.ts - Infrastructure types
export interface AsyncOperationOptions {
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}
```

### ❌ WRONG - Manual type definitions

```typescript
// ❌ NO! Don't manually define types that can be inferred
// hooks/use-tasks.ts
interface CreateTaskInput {
  // This duplicates the tRPC router input definition!
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high'; // Should use pgEnum from schema
}

// lib/types/task.ts
export type TaskPriority = 'low' | 'medium' | 'high'; // ❌ NO! Infer from pgEnum

// hooks/use-notification-settings.ts
interface NotificationSettings {
  // ❌ NO! Move to lib/types/
  emailNotifications: boolean;
  marketingEmails: boolean;
  securityAlerts: boolean;
}

interface AsyncOperationOptions {
  // ❌ NO! Move to lib/api/
  successMessage?: string;
  errorMessage?: string;
}
```

### ✅ Import Patterns

```typescript
// For domain types (ALWAYS import from @/lib/types, even if just re-exports)
import type { User, Task, TaskPriority, UserProfile, NotificationSettings } from '@/lib/types';

// For infrastructure types
import type { ApiResponse, AsyncOperationOptions } from '@/lib/api';

// ❌ WRONG - Don't import domain types directly from schema in application code
import type { User, Task } from '@/lib/db/schema'; // NO! Use @/lib/types instead

// ✅ OK - Only import from schema in database operations (tRPC routers, migrations)
// lib/trpc/routers/tasks.ts
import { tasks } from '@/lib/db/schema'; // OK in database queries
```

## Code Style and Structure

- Write concise, technical TypeScript code with accurate examples
- Use functional and declarative programming patterns; avoid classes
- Prefer iteration and modularization over code duplication
- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError)
- Structure files: exported component, subcomponents, helpers, static content, types
- Always reference Clerk users via `clerkUserId` in database operations
- Use proper error handling for all external API calls (e.g. Clerk)

## Performance Optimization

- Implement proper code splitting with Next.js dynamic imports
- Use React.memo for expensive computations
- Leverage TanStack Query's caching capabilities
- Use proper key props for lists
- Implement proper virtualization for long lists
- Optimize images with Next.js Image component
- Use Sentry performance monitoring

## Color Rules

- Never use new colors, always use the ones defined in `./app/globals.css` file (following shadcn/ui theme)
- Use CSS variables for consistent theming across light/dark modes

## SEO Configuration

**This is an authentication-first application with minimal public pages.**

**Sitemap** only includes legal pages in `app/sitemap.ts`.

## GitHub Actions Workflow Notifications - MANDATORY

**When creating new GitHub Actions workflows, ALWAYS add Slack notifications for success and failure outcomes.**

### ✅ WHEN TO ADD Slack Notifications

- **Custom workflows on main branch** - Any new workflow created for project-specific automation that runs on the main branch (e.g., `on-main.yml`)
- **Deployment workflows** - Release, build, or deployment pipelines
- **Automated operations** - Scheduled jobs, syncs, or maintenance tasks
- **Release workflows** - Version updates, releases, or publishing

### ❌ WHEN NOT TO ADD Slack Notifications

- **CI workflows** - `ci.yml` and similar PR/commit checks (handled separately via GitHub Actions settings)
- **Claude workflows** - `claude.yml` workflow (AI automation tool)
- **PR/Review workflows** - Code quality checks running on every pull request (too noisy)
- **Local development workflows** - Developer-only testing workflows

### 🔧 Implementation Pattern

**Always add both success and failure notifications at the end of critical jobs:**

```yaml
- name: Notify Slack - Success
  if: success()
  run: |
    curl -X POST --data '{"text":"✅ Workflow Name Completed Successfully\nDetails: https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}"}' ${{ secrets.SLACK_DEV_CHANNEL_WEBHOOK_URL }}

- name: Notify Slack - Failure
  if: failure()
  run: |
    curl -X POST --data "{\"text\":\"❌ Workflow Name Failed\nAction: https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}\"}" ${{ secrets.SLACK_DEV_CHANNEL_WEBHOOK_URL }}
```

### 🏗️ Best Practices

**Include relevant information in success messages:**

- Release workflows → Link to GitHub release page
- Deployment workflows → Link to deployed environment
- Sync workflows → Link to action run for visibility
- Always include action run link for debugging

**Use consistent emoji indicators:**

- ✅ Success
- ❌ Failure
- 🔄 In Progress (optional, for long-running jobs)

**Minimal, focused notifications:**

- Only notify for workflows that require team visibility
- Don't notify on routine CI checks (too noisy)
- Include direct link to GitHub Actions run: `https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}`

### 🔑 Required Secrets

Use `SLACK_DEV_CHANNEL_WEBHOOK_URL` secret for notifications:

- Secret must be configured in GitHub repository settings
- Never hardcode webhook URLs in workflow files
- Applies to custom workflows on main branch only

**Rationale:** Ensures team visibility into custom automated workflows, enabling quick response to failures and tracking deployment progress without overwhelming with routine CI noise.

## Documentation Guidelines - MANDATORY

- **NEVER proactively create documentation files** (\*.md) or README files
- **NEVER create feature documentation** when implementing new features
- Only create documentation files if **explicitly requested** by the user
- Focus on implementing the feature code, not documenting it
