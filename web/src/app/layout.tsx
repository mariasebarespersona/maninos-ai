import './globals.css'
import React from 'react'
import type { Metadata } from 'next'
import { AuthProvider } from '@/components/Auth/AuthProvider'

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
      </head>
      <body className="min-h-screen overflow-hidden">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
// v2.1 - Redesign
