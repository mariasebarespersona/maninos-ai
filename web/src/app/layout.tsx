import './globals.css'
import React from 'react'
import type { Metadata } from 'next'
import { AuthProvider } from '@/components/Auth/AuthProvider'

// Import Google Fonts via HTML link for reliability
const fontUrl = "https://fonts.googleapis.com/css2?family=Lato:wght@300;400;500;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap";

export const metadata: Metadata = {
  title: 'MANINOS AI - Tu hogar, nuestro compromiso',
  description: 'Plataforma inteligente de gestión para casas móviles rent-to-own. Maninos Capital LLC.',
  icons: {
    icon: '/favicon.ico',
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
      <body className="min-h-screen overflow-hidden bg-slate-50 font-sans">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
