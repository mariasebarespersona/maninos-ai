import { redirect } from 'next/navigation'

/**
 * Root page - Redirects to Portal Homes
 * 
 * The main entry point for the app now redirects to the new
 * Portal Homes dashboard for the Comercializar flow.
 */
export default function RootPage() {
  redirect('/homes')
}
