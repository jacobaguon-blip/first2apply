import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { InstallPrompt } from './components/installPrompt';
import { SwRegister } from './components/swRegister';
import { ThemeProvider } from './components/themeProvider';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'First 2 Apply',
  description: 'Get notified of new job postings from 10+ popular job boards before anyone else.',
  applicationName: 'First 2 Apply',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'First 2 Apply',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/favicons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/favicons/apple-touch-icon.png', sizes: '180x180' }],
    shortcut: [{ url: '/favicons/favicon.ico' }],
  },
  other: {
    'msapplication-TileColor': '#000000',
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fff' },
    { media: '(prefers-color-scheme: dark)', color: '#000' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen min-w-screen antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
        <SwRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
