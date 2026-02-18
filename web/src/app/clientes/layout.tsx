import type { Metadata } from 'next'
import ClientPortalNav from './ClientPortalNav'

export const metadata: Metadata = {
  title: 'Maninos Homes — Tu nuevo hogar en Texas',
  description:
    'Casas móviles listas para mudarte en Texas. Compra al contado o con plan dueño a dueño (RTO). Un lugar seguro para tu familia. Maninos Homes LLC.',
  openGraph: {
    title: 'Maninos Homes — Tu nuevo hogar en Texas',
    description:
      'Casas móviles listas para mudarte en Texas. Compra al contado o con plan dueño a dueño (RTO). Un lugar seguro para tu familia.',
    siteName: 'Maninos Homes',
    locale: 'es_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Maninos Homes — Tu nuevo hogar en Texas',
    description:
      'Casas móviles listas para mudarte en Texas. Compra al contado o con plan dueño a dueño (RTO). Un lugar seguro para tu familia.',
  },
}

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ClientPortalNav>{children}</ClientPortalNav>
}
