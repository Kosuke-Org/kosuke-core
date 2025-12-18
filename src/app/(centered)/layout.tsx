'use client';

import Navbar from '@/components/navbar';

export default function CenteredLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <div className="flex-1">{children}</div>
    </>
  );
}
