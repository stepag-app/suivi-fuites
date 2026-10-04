import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SessionProvider } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: 'Suivi des fuites',
  description: 'Détection et réparation de fuites : STEPAG',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icone.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b5d8a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
