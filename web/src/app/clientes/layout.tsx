'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { User, Phone, X, Menu, Mail, MapPin, MessageCircle, Globe } from 'lucide-react'

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()

  // Detect if we're on the homepage (dark hero needs white text)
  const isHomepage = pathname === '/clientes'

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => { setMobileMenuOpen(false) }, [pathname])

  const navLinks = [
    { href: '/clientes/casas', label: 'Casas' },
  ]

  const isActive = (href: string) => pathname.startsWith(href)

  // On homepage: transparent header that becomes white on scroll
  // On other pages: always white
  const useTransparent = isHomepage && !scrolled

  return (
    <div className="portal-clientes min-h-screen bg-white">

      {/* ── HEADER ── */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          useTransparent ? '' : 'bg-white shadow-sm'
        }`}
        style={useTransparent ? { background: 'transparent' } : { borderBottom: '1px solid #f0f0f0' }}
      >
        <div className="max-w-[1760px] mx-auto px-6 sm:px-8 lg:px-10">
          <div className="flex items-center justify-between h-16 sm:h-[76px]">

            {/* Logo */}
            <Link href="/clientes" className="flex items-center">
              <Image
                src="/images/maninos-logo.png"
                alt="Maninos Homes"
                width={120}
                height={55}
                className={`h-8 sm:h-9 w-auto ${useTransparent ? 'mn-logo-white' : ''}`}
                priority
              />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 py-2 rounded-full text-[14px] font-semibold transition-all duration-200 ${
                    isActive(link.href)
                      ? useTransparent
                        ? 'bg-white/15 text-white'
                        : 'bg-gray-100 text-gray-900'
                      : useTransparent
                        ? 'text-white/80 hover:text-white hover:bg-white/10'
                        : 'text-[#484848] hover:text-[#222] hover:bg-gray-50'
                  }`}
                >
                  {link.label}
                </Link>
              ))}

              <div className={`w-px h-5 mx-2 ${useTransparent ? 'bg-white/20' : 'bg-gray-200'}`} />

              <div className="relative group">
                <button
                  className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all flex items-center gap-1 ${
                    useTransparent
                      ? 'text-white/70 hover:text-white hover:bg-white/10'
                      : 'text-[#717171] hover:text-[#222] hover:bg-gray-50'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" /> Oficinas
                </button>
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-2 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <a href="tel:9362005200" className="block px-4 py-2 text-[13px] text-[#484848] hover:bg-gray-50 transition-colors">
                    <span className="font-semibold text-[#222]">Conroe</span> · (936) 200-5200
                  </a>
                  <a href="tel:8327459600" className="block px-4 py-2 text-[13px] text-[#484848] hover:bg-gray-50 transition-colors">
                    <span className="font-semibold text-[#222]">Houston</span> · (832) 745-9600
                  </a>
                  <a href="tel:4696005200" className="block px-4 py-2 text-[13px] text-[#484848] hover:bg-gray-50 transition-colors">
                    <span className="font-semibold text-[#222]">Dallas</span> · (469) 600-5200
                  </a>
                </div>
              </div>

              <Link
                href="/clientes/mi-cuenta"
                className={`ml-1 flex items-center gap-2 px-4 py-2.5 rounded-full text-[14px] font-semibold transition-all duration-200 border ${
                  useTransparent
                    ? 'border-white/30 text-white hover:bg-white hover:text-gray-900'
                    : 'border-gray-300 text-[#484848] hover:shadow-md hover:border-gray-400'
                }`}
              >
                <User className="w-4 h-4" />
                Acceder
              </Link>
            </nav>

            {/* Mobile toggle */}
            <button
              className={`md:hidden p-2 rounded-full transition-colors ${
                useTransparent ? 'text-white hover:bg-white/10' : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Nav */}
          {mobileMenuOpen && (
            <nav className="md:hidden pb-6 pt-2 animate-fade-in">
              <div className="space-y-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`block px-4 py-3 rounded-xl text-base font-semibold transition-colors ${
                      isActive(link.href)
                        ? useTransparent ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-900'
                        : useTransparent ? 'text-white/80 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                <a
                  href="https://api.whatsapp.com/send?phone=+18327459600&text=Hola!%20Me%20interesa%20una%20casa"
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold bg-[#25d366] hover:bg-[#20bd5a] text-sm"
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
                <a
                  href="tel:9362005200"
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
                    useTransparent ? 'text-white/70' : 'text-gray-500'
                  }`}
                >
                  <Phone className="w-4 h-4" /> Conroe: (936) 200-5200
                </a>
              </div>
            </nav>
          )}
        </div>
      </header>

      {/* ── MAIN ── */}
      <main>{children}</main>

      {/* ── FOOTER ── */}
      <footer className="bg-[#fafafa] border-t border-gray-200">
        <div className="max-w-[1760px] mx-auto px-6 sm:px-8 lg:px-10 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">

            {/* Brand */}
            <div>
              <Image
                src="/images/maninos-logo.png"
                alt="Maninos Homes"
                width={120}
                height={55}
                className="h-8 w-auto mb-4"
              />
              <p className="text-[13px] text-[#717171] leading-relaxed">
                Casas móviles renovadas en Texas.
                Apoyamos a la comunidad hispana.
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-[13px] font-bold text-[#222] uppercase tracking-wide mb-4">Explorar</h4>
              <ul className="space-y-2.5">
                {[
                  { href: '/clientes', label: 'Inicio' },
                  { href: '/clientes/casas', label: 'Ver Casas' },
                  { href: '/clientes/mi-cuenta', label: 'Mi Cuenta' },
                ].map(l => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[13px] text-[#717171] hover:text-[#222] transition-colors hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="text-[13px] font-bold text-[#222] uppercase tracking-wide mb-4">Recursos</h4>
              <ul className="space-y-2.5">
                <li><a href="https://www.tdhca.texas.gov/" target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#717171] hover:text-[#222] transition-colors hover:underline">TDHCA Texas</a></li>
                <li><a href="https://www.maninoshomes.com" target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#717171] hover:text-[#222] transition-colors hover:underline">maninoshomes.com</a></li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-[13px] font-bold text-[#222] uppercase tracking-wide mb-4">Oficinas</h4>
              <ul className="space-y-2.5">
                <li>
                  <a href="tel:9362005200" className="text-[13px] text-[#717171] hover:text-[#222] transition-colors hover:underline flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5" /> Conroe: (936) 200-5200
                  </a>
                </li>
                <li>
                  <a href="tel:8327459600" className="text-[13px] text-[#717171] hover:text-[#222] transition-colors hover:underline flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5" /> Houston: (832) 745-9600
                  </a>
                </li>
                <li>
                  <a href="tel:4696005200" className="text-[13px] text-[#717171] hover:text-[#222] transition-colors hover:underline flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5" /> Dallas: (469) 600-5200
                  </a>
                </li>
                <li>
                  <a href="mailto:info@maninoshomes.com" className="text-[13px] text-[#717171] hover:text-[#222] transition-colors hover:underline flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5" /> info@maninoshomes.com
                  </a>
                </li>
                <li className="text-[13px] text-[#717171] flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> 15891 Old Houston Rd., Conroe TX 77302
                </li>
              </ul>
              <a
                href="https://api.whatsapp.com/send?phone=+18327459600&text=Hola!"
                target="_blank" rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-white text-[13px] font-semibold bg-[#25d366] hover:bg-[#20bd5a] transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
            </div>
          </div>

          {/* Bottom */}
          <div className="border-t border-gray-200 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[12px] text-[#b0b0b0]">
              © {new Date().getFullYear()} Maninos Homes LLC · Todos los derechos reservados
            </p>
            <div className="flex items-center gap-1 text-[12px] text-[#b0b0b0]">
              <Globe className="w-3 h-3" /> Español
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
