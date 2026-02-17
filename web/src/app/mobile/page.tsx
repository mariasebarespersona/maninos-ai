import { redirect } from 'next/navigation'

/**
 * Mobile page now redirects to Homes.
 * The desktop app is fully responsive and includes a floating AI chat widget.
 * No separate mobile app needed.
 */
export default function MobilePage() {
  redirect('/homes')
}
