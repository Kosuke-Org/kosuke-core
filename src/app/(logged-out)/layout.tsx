import React from 'react';

import Footer from '@/components/footer';

export default function LoggedOutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 flex flex-col">
        <main className="flex-1 flex flex-col w-full">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
