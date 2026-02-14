import Link from 'next/link'
import { Home, User, Phone } from 'lucide-react'

export const metadata = {
  title: 'Portal Clientes - Maninos Homes',
  description: 'Tu casa móvil en Texas. Casas renovadas, listas para vivir.',
}

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="bg-navy-900 text-white sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/clientes" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gold-500 rounded-lg flex items-center justify-center">
                <Home className="w-6 h-6 text-navy-900" />
              </div>
              <div>
                <span className="font-bold text-lg">Maninos Homes</span>
                <span className="text-gold-400 text-xs block -mt-1">Tu hogar en Texas</span>
              </div>
            </Link>
            
            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <Link 
                href="/clientes/casas" 
                className="text-gray-300 hover:text-white transition-colors"
              >
                Ver Casas
              </Link>
              <Link 
                href="/clientes/mi-cuenta" 
                className="flex items-center gap-2 bg-gold-500 text-navy-900 px-4 py-2 rounded-lg font-medium hover:bg-gold-400 transition-colors"
              >
                <User className="w-4 h-4" />
                Mi Cuenta
              </Link>
            </nav>
            
            {/* Mobile menu button */}
            <button className="md:hidden p-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <main>
        {children}
      </main>
      
      {/* Footer */}
      <footer className="bg-navy-900 text-white mt-20">
        <div className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gold-500 rounded-lg flex items-center justify-center">
                  <Home className="w-6 h-6 text-navy-900" />
                </div>
                <span className="font-bold text-xl">Maninos Homes</span>
              </div>
              <p className="text-gray-400 mb-4">
                Tu casa móvil en Texas. Casas renovadas y listas para vivir.
                Compra segura al contado con transferencia de título directo.
              </p>
            </div>
            
            {/* Links */}
            <div>
              <h4 className="font-semibold mb-4">Enlaces</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/clientes/casas" className="hover:text-gold-400">Ver Casas</Link></li>
                <li><Link href="/clientes/mi-cuenta" className="hover:text-gold-400">Mi Cuenta</Link></li>
              </ul>
            </div>
            
            {/* Contact */}
            <div>
              <h4 className="font-semibold mb-4">Contacto</h4>
              <ul className="space-y-2 text-gray-400">
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>(832) 745-9600</span>
                </li>
                <li>Houston, Texas</li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-navy-800 mt-8 pt-8 text-center text-gray-500 text-sm">
            <p>© {new Date().getFullYear()} Maninos Homes LLC. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}


