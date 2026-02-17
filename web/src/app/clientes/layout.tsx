'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { User, Phone, X, Menu, Mail, MapPin, ChevronRight, MessageCircle } from 'lucide-react'

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const navLinks = [
    { href: '/clientes/casas', label: 'Comprar' },
    { href: '/clientes/mi-cuenta', label: 'Mi Cuenta' },
  ]

  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <div className="portal-clientes min-h-screen bg-white">

      {/* ═══════════ HEADER ═══════════ */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'mn-glass-dark shadow-lg'
            : 'bg-transparent'
        }`}
        style={!scrolled ? { background: 'linear-gradient(180deg, rgba(0,35,61,0.85) 0%, transparent 100%)' } : undefined}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">

            {/* Logo */}
            <Link href="/clientes" className="flex items-center gap-3 group">
              <Image
                src="/images/maninos-logo.png"
                alt="Maninos Homes"
                width={100}
                height={46}
                className="mn-logo-white h-8 sm:h-10 w-auto transition-transform group-hover:scale-105"
                priority
              />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    isActive(link.href)
                      ? 'bg-white/15 text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                >
                  {link.label}
                </Link>
              ))}

              <div className="w-px h-6 bg-white/20 mx-2" />

              {/* WhatsApp CTA */}
              <a
                href="https://api.whatsapp.com/send?phone=+18327459600&text=Hola!%20Me%20interesa%20una%20casa%20en%20Maninos%20Homes"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 bg-[#25d366] text-white hover:bg-[#20bd5a] shadow-md hover:shadow-lg"
                style={{ fontFamily: "'Montserrat', sans-serif" }}
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </a>

              <Link
                href="/clientes/mi-cuenta"
                className="ml-2 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 text-white border border-white/30 hover:bg-white hover:text-[#004274]"
                style={{ fontFamily: "'Montserrat', sans-serif" }}
              >
                <User className="w-4 h-4" />
                Acceder
              </Link>
            </nav>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 rounded-lg text-white hover:bg-white/10 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Nav Overlay */}
          {mobileMenuOpen && (
            <nav className="md:hidden pb-6 pt-2 space-y-1 mn-animate-fade-in">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-between px-4 py-3.5 rounded-xl transition-colors ${
                    isActive(link.href)
                      ? 'bg-white/15 text-white'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                  style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600 }}
                >
                  {link.label}
                  <ChevronRight className="w-4 h-4 opacity-50" />
                </Link>
              ))}

              <div className="pt-2 flex flex-col gap-2">
                <a
                  href="https://api.whatsapp.com/send?phone=+18327459600&text=Hola!%20Me%20interesa%20una%20casa%20en%20Maninos%20Homes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-white font-semibold bg-[#25d366] hover:bg-[#20bd5a]"
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                >
                  <MessageCircle className="w-5 h-5" />
                  Escríbenos por WhatsApp
                </a>
                <a
                  href="tel:8327459600"
                  className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                >
                  <Phone className="w-5 h-5" />
                  (832) 745-9600
                </a>
              </div>
            </nav>
          )}
        </div>
      </header>

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <main className="min-h-screen">
        {children}
      </main>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer style={{ background: 'var(--mn-blue-dark)' }} className="text-white">
        {/* Gold accent line */}
        <div className="h-1 mn-gradient-gold" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">

            {/* Brand */}
            <div className="lg:col-span-2">
              <Image
                src="/images/maninos-logo.png"
                alt="Maninos Homes"
                width={160}
                height={74}
                className="mn-logo-white h-12 w-auto mb-6"
              />
              <p className="text-white/60 text-base leading-relaxed mb-6 max-w-md" style={{ fontFamily: "'Mulish', sans-serif" }}>
                Apoyamos a la comunidad hispana en Texas en la búsqueda del sueño americano.
                Ofrecemos hogares dignos y accesibles de la más alta calidad.
              </p>
              <p className="text-sm font-semibold tracking-wide uppercase" style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}>
                &ldquo;Tu hogar, nuestro compromiso&rdquo;
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wider mb-6" style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}>
                Navegación
              </h4>
              <ul className="space-y-3">
                {[
                  { href: '/clientes', label: 'Inicio' },
                  { href: '/clientes/casas', label: 'Ver Casas' },
                  { href: '/clientes/mi-cuenta', label: 'Mi Cuenta' },
                  { href: 'https://www.tdhca.texas.gov/', label: 'TDHCA Texas', external: true },
                ].map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/60 hover:text-white transition-colors text-sm flex items-center gap-1"
                        style={{ fontFamily: "'Mulish', sans-serif" }}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-white/60 hover:text-white transition-colors text-sm"
                        style={{ fontFamily: "'Mulish', sans-serif" }}
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wider mb-6" style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}>
                Contacto
              </h4>
              <ul className="space-y-4">
                <li>
                  <a href="tel:8327459600" className="flex items-center gap-3 text-white/60 hover:text-white transition-colors text-sm group">
                    <Phone className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--mn-gold)' }} />
                    <span>(832) 745-9600</span>
                  </a>
                </li>
                <li>
                  <a href="mailto:info@maninoshomes.com" className="flex items-center gap-3 text-white/60 hover:text-white transition-colors text-sm group">
                    <Mail className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--mn-gold)' }} />
                    <span>info@maninoshomes.com</span>
                  </a>
                </li>
                <li className="flex items-start gap-3 text-white/60 text-sm">
                  <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--mn-gold)' }} />
                  <span>15891 Old Houston Rd.<br />Conroe, TX 77302</span>
                </li>
              </ul>

              {/* WhatsApp CTA */}
              <a
                href="https://api.whatsapp.com/send?phone=+18327459600&text=Hola!%20Me%20interesa%20una%20casa%20en%20Maninos%20Homes"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold bg-[#25d366] hover:bg-[#20bd5a] transition-colors text-sm w-full"
                style={{ fontFamily: "'Montserrat', sans-serif" }}
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </a>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/10 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-white/40 text-xs" style={{ fontFamily: "'Mulish', sans-serif" }}>
              © {new Date().getFullYear()} Maninos Homes LLC. Todos los derechos reservados.
            </p>
            <div className="flex items-center gap-6">
              <a href="https://www.maninoshomes.com" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white/60 text-xs transition-colors">
                maninoshomes.com
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
