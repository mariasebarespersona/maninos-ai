'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { 
  Home, Shield, FileText, ArrowRight, Star, CheckCircle, 
  MessageCircle, Phone, Sparkles, Heart, Users, BadgeCheck,
  ChevronRight, Wrench, MapPin
} from 'lucide-react'

interface Stats {
  total_available: number
  price_range: { min: number; max: number; avg: number }
  cities_count: number
}

export default function ClientPortalHome() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch('/api/public/properties/stats/summary')
      .then(r => r.json())
      .then(data => {
        if (data.ok) setStats(data)
      })
      .catch(console.error)
  }, [])

  return (
    <div className="portal-clientes">
      
      {/* ═══════════════════════════════════════════════════
          HERO SECTION — Full-bleed immersive
          ═══════════════════════════════════════════════════ */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden" style={{ background: 'linear-gradient(135deg, #00233d 0%, #004274 40%, #005a9e 100%)' }}>
        {/* Decorative shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full" style={{ background: 'radial-gradient(circle, rgba(163,141,72,0.15) 0%, transparent 70%)' }} />
          <div className="absolute bottom-0 left-0 w-full h-64" style={{ background: 'linear-gradient(0deg, rgba(0,35,61,0.6) 0%, transparent 100%)' }} />
          <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full" style={{ background: 'radial-gradient(circle, rgba(0,90,158,0.3) 0%, transparent 70%)' }} />
          {/* Subtle dot pattern */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px'
          }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            
            {/* Left — Copy */}
            <div className="mn-animate-fade-up">
              <div 
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-8 mn-animate-fade-up mn-stagger-1"
                style={{ background: 'rgba(163,141,72,0.2)', color: '#c4af6a', fontFamily: "'Montserrat', sans-serif" }}
              >
                <Sparkles className="w-4 h-4" />
                Casas renovadas listas para vivir
              </div>

              <h1 
                className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.1] mb-6 mn-animate-fade-up mn-stagger-2"
                style={{ fontFamily: "'Montserrat', sans-serif" }}
              >
                Tu Hogar en Texas
                <span className="block" style={{ color: '#c4af6a' }}>
                  Comienza Aquí
                </span>
              </h1>

              <p className="text-lg sm:text-xl text-white/70 leading-relaxed mb-10 max-w-lg mn-animate-fade-up mn-stagger-3" style={{ fontFamily: "'Mulish', sans-serif" }}>
                Apoyamos a la comunidad hispana con casas móviles renovadas de alta calidad.
                Compra al contado o con plan de financiamiento.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mn-animate-fade-up mn-stagger-4">
                <Link
                  href="/clientes/casas"
                  className="btn-brand btn-brand-gold group"
                  style={{ fontSize: '1.0625rem', padding: '1rem 2rem' }}
                >
                  Ver Casas Disponibles
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </Link>

                <a
                  href="https://api.whatsapp.com/send?phone=+18327459600&text=Hola!%20Me%20interesa%20una%20casa%20en%20Maninos%20Homes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-brand btn-brand-whatsapp"
                  style={{ fontSize: '1.0625rem', padding: '1rem 2rem' }}
                >
                  <MessageCircle className="w-5 h-5" />
                  Escríbenos
                </a>
              </div>

              {/* Stats bar */}
              {stats && stats.total_available > 0 && (
                <div className="grid grid-cols-3 gap-6 mt-14 pt-8 border-t border-white/10 mn-animate-fade-up mn-stagger-5">
                  <div>
                    <p className="text-3xl sm:text-4xl font-black" style={{ color: '#c4af6a', fontFamily: "'Montserrat', sans-serif" }}>
                      {stats.total_available}
                    </p>
                    <p className="text-white/50 text-sm mt-1" style={{ fontFamily: "'Mulish', sans-serif" }}>
                      Casas disponibles
                    </p>
                  </div>
                  <div>
                    <p className="text-3xl sm:text-4xl font-black" style={{ color: '#c4af6a', fontFamily: "'Montserrat', sans-serif" }}>
                      {stats.cities_count}
                    </p>
                    <p className="text-white/50 text-sm mt-1" style={{ fontFamily: "'Mulish', sans-serif" }}>
                      Ciudades en TX
                    </p>
                  </div>
                  <div>
                    <p className="text-3xl sm:text-4xl font-black" style={{ color: '#c4af6a', fontFamily: "'Montserrat', sans-serif" }}>
                      ${Math.round(stats.price_range.avg / 1000)}k
                    </p>
                    <p className="text-white/50 text-sm mt-1" style={{ fontFamily: "'Mulish', sans-serif" }}>
                      Precio promedio
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right — Visual card stack */}
            <div className="hidden lg:block relative mn-animate-fade-up mn-stagger-3">
              <div className="relative">
                {/* Floating testimonial */}
                <div className="absolute -top-4 -left-8 z-20 bg-white rounded-2xl shadow-2xl p-5 max-w-[240px] mn-animate-slide-right mn-stagger-5" style={{ animationDelay: '0.8s' }}>
                  <div className="flex items-center gap-2 mb-2">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-sm text-gray-700 leading-snug" style={{ fontFamily: "'Mulish', sans-serif" }}>
                    &ldquo;Excelente servicio. Mi familia ya tiene su casa propia.&rdquo;
                  </p>
                  <p className="text-xs text-gray-400 mt-2 font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    — Familia Rodríguez, Houston
                  </p>
                </div>

                {/* Main visual */}
                <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/10">
                  <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center">
                    <Image
                      src="/images/maninos-logo.png"
                      alt="Maninos Homes"
                      width={280}
                      height={130}
                      className="mn-logo-white opacity-30"
                    />
                  </div>
                  <div className="mt-6 flex items-center justify-between">
                    <div>
                      <p className="text-white font-bold text-lg" style={{ fontFamily: "'Montserrat', sans-serif" }}>Casa renovada</p>
                      <p className="text-white/50 text-sm flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> Texas
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-white/40">Desde</p>
                      <p className="text-2xl font-black" style={{ color: '#c4af6a', fontFamily: "'Montserrat', sans-serif" }}>
                        {stats ? `$${(stats.price_range.min / 1000).toFixed(0)}k` : '$20k'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Floating badge */}
                <div className="absolute -bottom-4 -right-4 z-20 flex items-center gap-2 px-5 py-3 rounded-xl shadow-xl mn-animate-slide-right mn-stagger-6" style={{ background: '#004274', animationDelay: '1s' }}>
                  <BadgeCheck className="w-5 h-5 text-white" />
                  <span className="text-white text-sm font-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    Título verificado
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Wave separator */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path d="M0 80H1440V20C1440 20 1320 60 1140 50C960 40 720 0 540 20C360 40 120 60 0 40V80Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          WHY CHOOSE US — Value proposition
          ═══════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}>
              ¿Por qué elegirnos?
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-5" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
              Tu hogar, nuestro compromiso
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
              Más que vender casas, construimos hogares. Acompañamos a cada familia en todo el proceso.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Wrench className="w-7 h-7" />}
              title="Casas 100% Renovadas"
              description="Cada casa pasa por una renovación completa: plomería, electricidad, pisos, techo y pintura. Lista para que te mudes."
              delay={1}
            />
            <FeatureCard
              icon={<Shield className="w-7 h-7" />}
              title="Compra Segura"
              description="Proceso transparente con documentos verificados. Tu pago está protegido y el título se transfiere directamente a tu nombre."
              delay={2}
            />
            <FeatureCard
              icon={<Heart className="w-7 h-7" />}
              title="Comunidad Hispana"
              description="Hablamos tu idioma. Entendemos tus necesidades. Te acompañamos en cada paso hacia tu nuevo hogar."
              delay={3}
            />
            <FeatureCard
              icon={<FileText className="w-7 h-7" />}
              title="Financiamiento Disponible"
              description="¿No puedes pagar al contado? Ofrecemos planes de Renta con Opción a Compra (RTO) flexibles y accesibles."
              delay={4}
            />
            <FeatureCard
              icon={<BadgeCheck className="w-7 h-7" />}
              title="Títulos Limpios"
              description="Verificamos cada título con TDHCA (Texas Department of Housing). Sin deudas, sin problemas."
              delay={5}
            />
            <FeatureCard
              icon={<Users className="w-7 h-7" />}
              title="Equipo Dedicado"
              description="Nuestro equipo de profesionales está disponible para resolver cualquier duda. ¡Llámanos o escríbenos!"
              delay={6}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          HOW IT WORKS — Step by step
          ═══════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 mn-gradient-mesh">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}>
              Proceso Simple
            </p>
            <h2 className="text-3xl sm:text-4xl font-black mb-5" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
              ¿Cómo funciona?
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
              En 4 sencillos pasos, tu nuevo hogar estará listo
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { num: 1, title: 'Elige tu casa', desc: 'Explora nuestro catálogo con fotos, precios y ubicaciones.', icon: <Home className="w-6 h-6" /> },
              { num: 2, title: 'Contáctanos', desc: 'Escríbenos por WhatsApp o llámanos para resolver tus dudas.', icon: <MessageCircle className="w-6 h-6" /> },
              { num: 3, title: 'Realiza el pago', desc: 'Paga al contado o elige nuestro plan de financiamiento RTO.', icon: <Shield className="w-6 h-6" /> },
              { num: 4, title: 'Recibe tu título', desc: 'Procesamos la transferencia y el título queda a tu nombre.', icon: <FileText className="w-6 h-6" /> },
            ].map((step) => (
              <div key={step.num} className={`relative mn-animate-fade-up mn-stagger-${step.num}`}>
                <div className="bg-white rounded-2xl p-8 border border-gray-100 hover:shadow-xl transition-all duration-300 group h-full">
                  {/* Step number */}
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 text-white transition-transform group-hover:scale-110"
                    style={{ background: 'var(--mn-blue)' }}
                  >
                    {step.icon}
                  </div>
                  <div className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}>
                    Paso {step.num}
                  </div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
                    {step.desc}
                  </p>
                </div>
                {/* Connector */}
                {step.num < 4 && (
                  <div className="hidden lg:flex absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                    <ChevronRight className="w-6 h-6" style={{ color: 'var(--mn-gray-light)' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          CTA SECTION — Warm & inviting
          ═══════════════════════════════════════════════════ */}
      <section className="relative py-20 sm:py-28 overflow-hidden" style={{ background: 'var(--mn-blue)' }}>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(163,141,72,0.2) 0%, transparent 70%)' }} />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(0,90,158,0.3) 0%, transparent 70%)' }} />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-6 leading-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            ¿Listo para encontrar
            <span style={{ color: '#c4af6a' }}> tu nuevo hogar</span>?
          </h2>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto" style={{ fontFamily: "'Mulish', sans-serif" }}>
            Explora nuestro catálogo o contáctanos directamente. 
            Estamos aquí para ayudarte a dar el primer paso.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/clientes/casas"
              className="btn-brand btn-brand-gold group"
              style={{ fontSize: '1.0625rem', padding: '1rem 2.5rem' }}
            >
              Ver Casas
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="tel:8327459600"
              className="btn-brand btn-brand-outline"
              style={{ fontSize: '1.0625rem', padding: '1rem 2.5rem', borderColor: 'rgba(255,255,255,0.3)', color: 'white' }}
            >
              <Phone className="w-5 h-5" />
              Llámanos: (832) 745-9600
            </a>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          TRUST BAR
          ═══════════════════════════════════════════════════ */}
      <section className="py-12 bg-white border-t" style={{ borderColor: 'var(--mn-light-200)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4">
            {[
              'Empresa registrada en Texas',
              'Pagos 100% seguros',
              'Títulos verificados por TDHCA',
              '+200 familias atendidas',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--mn-blue)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--mn-dark-600)', fontFamily: "'Mulish', sans-serif" }}>
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ─── Sub-components ─── */

function FeatureCard({
  icon,
  title,
  description,
  delay = 1,
}: {
  icon: React.ReactNode
  title: string
  description: string
  delay?: number
}) {
  return (
    <div className={`group mn-animate-fade-up mn-stagger-${delay}`}>
      <div className="bg-white rounded-2xl p-8 border border-gray-100 hover:shadow-xl hover:border-transparent transition-all duration-300 h-full">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 text-white transition-all group-hover:scale-110 group-hover:shadow-lg"
          style={{ background: 'var(--mn-blue)' }}
        >
          {icon}
        </div>
        <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
          {title}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
          {description}
        </p>
      </div>
    </div>
  )
}
