import './globals.css'
import React from 'react'
import type { Metadata, Viewport } from 'next'
import { AuthProvider } from '@/components/Auth/AuthProvider'
import { ToastProvider } from '@/components/ui/Toast'
import PWAInstall from '@/components/PWA/PWAInstall'

// Import Google Fonts via HTML link for reliability
const fontUrl = "https://fonts.googleapis.com/css2?family=Lato:wght@300;400;500;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#d4a853',
}

export const metadata: Metadata = {
  title: {
    default: 'Maninos Homes — Casas móviles en Texas',
    template: '%s | Maninos Homes',
  },
  description:
    'Casas móviles listas para mudarte en Texas. Compra al contado o con plan dueño a dueño (RTO). Un lugar seguro para tu familia. Maninos Homes LLC.',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192.svg',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Maninos Homes',
  },
  openGraph: {
    siteName: 'Maninos Homes',
    locale: 'es_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={fontUrl} rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-slate-50 font-sans">
        <ToastProvider>
          <AuthProvider>
            {children}
            <PWAInstall />
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
