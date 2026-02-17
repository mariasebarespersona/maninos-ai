'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState, useRef } from 'react'
import { useInView, useStaggerReveal } from '@/hooks/useInView'
import { 
  Home, Shield, FileText, ArrowRight, Star, CheckCircle, 
  MessageCircle, Phone, Heart, Users, BadgeCheck,
  ChevronRight, Wrench, MapPin, Sparkles, Play
} from 'lucide-react'

interface Stats {
  total_available: number
  price_range: { min: number; max: number; avg: number }
  cities_count: number
}

/* ═══════════════════════════════════════════════════════════════════
   MANINOS HOMES — CLIENT PORTAL HOMEPAGE
   
   Design Direction: "Luxury Real Estate meets Hispanic Warmth"
   An editorial, magazine-style homepage that feels warm but premium.
   Following Anthropic frontend-design Skill:
   - Bold aesthetic direction, NOT generic
   - Scroll-triggered reveals (Intersection Observer)
   - Asymmetric layouts, overlapping elements
   - Noise/grain textures for depth
   - Dominant blue + sharp gold accents
   - Surprising hover states
   ═══════════════════════════════════════════════════════════════════ */

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
    <div className="portal-clientes overflow-hidden">
      <HeroSection stats={stats} />
      <TrustBar />
      <FeaturesSection />
      <HowItWorksSection />
      <StatsSection stats={stats} />
      <CTASection />
    </div>
  )
}

/* ═══════════ HERO — Full-bleed, asymmetric, grain overlay ═══════════ */
function HeroSection({ stats }: { stats: Stats | null }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const heroRef = useRef<HTMLElement>(null)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!heroRef.current) return
    const rect = heroRef.current.getBoundingClientRect()
    setMousePos({
      x: (e.clientX - rect.left) / rect.width - 0.5,
      y: (e.clientY - rect.top) / rect.height - 0.5,
    })
  }

  return (
    <section
      ref={heroRef}
      onMouseMove={handleMouseMove}
      className="relative min-h-[95vh] flex items-center overflow-hidden mn-grain"
      style={{ background: 'linear-gradient(145deg, #00172b 0%, #00233d 30%, #004274 60%, #005a9e 100%)' }}
    >
      {/* Dynamic gradient orbs — shift with mouse */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute w-[600px] h-[600px] rounded-full transition-transform duration-[2000ms] ease-out"
          style={{
            background: 'radial-gradient(circle, rgba(163,141,72,0.12) 0%, transparent 65%)',
            top: '10%',
            right: '-5%',
            transform: `translate(${mousePos.x * -20}px, ${mousePos.y * -20}px)`,
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full transition-transform duration-[2000ms] ease-out"
          style={{
            background: 'radial-gradient(circle, rgba(0,90,158,0.2) 0%, transparent 65%)',
            bottom: '5%',
            left: '10%',
            transform: `translate(${mousePos.x * 15}px, ${mousePos.y * 15}px)`,
          }}
        />
        {/* Dot grid pattern */}
        <div className="absolute inset-0 mn-dots text-white/[0.035]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 w-full">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left — Editorial copy, 7 cols */}
          <div className="lg:col-span-7">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-8 mn-animate-fade-up mn-stagger-1"
              style={{
                background: 'rgba(163,141,72,0.15)',
                color: '#c4af6a',
                fontFamily: "'Montserrat', sans-serif",
                border: '1px solid rgba(163,141,72,0.2)',
              }}
            >
              <Sparkles className="w-4 h-4" />
              Casas renovadas • Listas para vivir
            </div>

            {/* Headline — dramatic sizing, gold accent */}
            <h1 className="mn-animate-fade-up mn-stagger-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              <span className="block text-4xl sm:text-5xl lg:text-[3.75rem] xl:text-7xl font-black text-white leading-[1.05] tracking-tight">
                Tu Hogar
              </span>
              <span className="block text-4xl sm:text-5xl lg:text-[3.75rem] xl:text-7xl font-black leading-[1.05] tracking-tight" style={{ color: '#c4af6a' }}>
                en Texas
              </span>
              <span className="block text-4xl sm:text-5xl lg:text-[3.75rem] xl:text-7xl font-black text-white leading-[1.05] tracking-tight">
                Comienza Aquí
              </span>
            </h1>

            {/* Subhead — generous negative space */}
            <p
              className="text-lg sm:text-xl text-white/60 leading-relaxed mt-8 max-w-xl mn-animate-fade-up mn-stagger-3"
              style={{ fontFamily: "'Mulish', sans-serif" }}
            >
              Apoyamos a la comunidad hispana con casas móviles renovadas de alta calidad.
              Compra al contado o con nuestro plan de financiamiento flexible.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-4 mt-10 mn-animate-fade-up mn-stagger-4">
              <Link
                href="/clientes/casas"
                className="group inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-bold text-base text-white transition-all duration-300 shadow-lg hover:shadow-xl hover:translate-y-[-2px] mn-pulse-glow"
                style={{
                  background: 'linear-gradient(135deg, var(--mn-gold) 0%, var(--mn-gold-dark) 100%)',
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                Ver Casas Disponibles
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1.5" />
              </Link>

              <a
                href="https://api.whatsapp.com/send?phone=+18327459600&text=Hola!%20Me%20interesa%20una%20casa%20en%20Maninos%20Homes"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-base text-white transition-all duration-300 hover:translate-y-[-2px]"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1.5px solid rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(8px)',
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                <MessageCircle className="w-5 h-5" style={{ color: '#25d366' }} />
                Escríbenos
              </a>
            </div>

            {/* Stats bar — overlapping the section boundary */}
            {stats && stats.total_available > 0 && (
              <div className="grid grid-cols-3 gap-6 sm:gap-10 mt-16 pt-8 border-t border-white/10 mn-animate-fade-up mn-stagger-5">
                {[
                  { value: stats.total_available, label: 'Casas disponibles', suffix: '' },
                  { value: stats.cities_count, label: 'Ciudades en TX', suffix: '' },
                  { value: Math.round(stats.price_range.avg / 1000), label: 'Precio promedio', suffix: 'k', prefix: '$' },
                ].map((stat, i) => (
                  <div key={i}>
                    <p
                      className="text-3xl sm:text-4xl lg:text-5xl font-black tabular-nums"
                      style={{ color: '#c4af6a', fontFamily: "'Montserrat', sans-serif" }}
                    >
                      {stat.prefix}{stat.value}{stat.suffix}
                    </p>
                    <p className="text-white/40 text-sm mt-1" style={{ fontFamily: "'Mulish', sans-serif" }}>
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right — Floating card composition, 5 cols */}
          <div className="hidden lg:block lg:col-span-5 relative">
            <div className="relative h-[520px]">
              
              {/* Testimonial — floating, overlapping */}
              <div
                className="absolute -top-2 -left-10 z-30 bg-white rounded-2xl shadow-2xl p-5 max-w-[220px] mn-floating mn-animate-slide-right mn-stagger-5"
                style={{ border: '1px solid rgba(0,0,0,0.04)' }}
              >
                <div className="flex items-center gap-1 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-[13px] text-gray-700 leading-snug" style={{ fontFamily: "'Mulish', sans-serif" }}>
                  &ldquo;Mi familia ya tiene su casa propia gracias a Maninos.&rdquo;
                </p>
                <p className="text-[11px] text-gray-400 mt-2 font-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  — Familia Rodríguez
                </p>
              </div>

              {/* Main property card */}
              <div
                className="absolute top-10 right-0 w-[85%] bg-white/[0.07] rounded-3xl p-6 mn-animate-scale-in mn-stagger-3 mn-corner-gold"
                style={{ border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
              >
                <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center">
                  <Image
                    src="/images/maninos-logo.png"
                    alt="Maninos Homes"
                    width={220}
                    height={100}
                    className="mn-logo-white opacity-20"
                  />
                </div>
                <div className="mt-5 flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold text-base" style={{ fontFamily: "'Montserrat', sans-serif" }}>Casa renovada</p>
                    <p className="text-white/40 text-sm flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Conroe, TX
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-white/30 uppercase tracking-wider font-bold" style={{ fontFamily: "'Montserrat'" }}>Desde</p>
                    <p className="text-2xl font-black" style={{ color: '#c4af6a', fontFamily: "'Montserrat', sans-serif" }}>
                      {stats ? `$${(stats.price_range.min / 1000).toFixed(0)}k` : '$20k'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Floating badge — bottom right */}
              <div
                className="absolute bottom-12 right-4 z-30 flex items-center gap-2.5 px-5 py-3 rounded-xl shadow-xl mn-floating-slow mn-animate-slide-left mn-stagger-6"
                style={{ background: 'var(--mn-blue)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <BadgeCheck className="w-5 h-5 text-white" />
                <span className="text-white text-sm font-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  Título verificado
                </span>
              </div>

              {/* Decorative ring */}
              <div
                className="absolute bottom-0 -left-6 w-24 h-24 rounded-full mn-floating"
                style={{
                  border: '2px solid rgba(163,141,72,0.15)',
                  animationDelay: '1s',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Angled separator — not a boring wave */}
      <div className="absolute bottom-0 left-0 right-0 h-20">
        <div
          className="absolute inset-0"
          style={{
            background: 'white',
            clipPath: 'polygon(0 60%, 30% 40%, 60% 65%, 100% 35%, 100% 100%, 0 100%)',
          }}
        />
      </div>
    </section>
  )
}

/* ═══════════ TRUST BAR — Horizontal credibility strip ═══════════ */
function TrustBar() {
  const { ref, isInView } = useInView()

  const items = [
    'Empresa registrada en Texas',
    'Pagos 100% seguros',
    'Títulos verificados por TDHCA',
    '+200 familias atendidas',
  ]

  return (
    <section ref={ref} className="py-6 bg-white border-b" style={{ borderColor: 'var(--mn-light-200)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3">
          {items.map((item, i) => (
            <div
              key={item}
              className="flex items-center gap-2"
              style={{
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'translateY(0)' : 'translateY(10px)',
                transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 0.08}s`,
              }}
            >
              <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--mn-gold)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--mn-dark-600)', fontFamily: "'Mulish', sans-serif" }}>
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════ FEATURES — Asymmetric grid, scroll reveals ═══════════ */
function FeaturesSection() {
  const { ref: titleRef, isInView: titleVisible } = useInView()
  const { ref: gridRef, isInView: gridVisible } = useInView({ rootMargin: '0px 0px -100px 0px' })

  const features = [
    {
      icon: <Wrench className="w-7 h-7" />,
      title: 'Casas 100% Renovadas',
      description: 'Cada casa pasa por una renovación completa: plomería, electricidad, pisos, techo y pintura. Lista para mudarte.',
      accent: false,
    },
    {
      icon: <Shield className="w-7 h-7" />,
      title: 'Compra Segura',
      description: 'Proceso transparente con documentos verificados. Tu pago protegido y título transferido a tu nombre.',
      accent: false,
    },
    {
      icon: <Heart className="w-7 h-7" />,
      title: 'Comunidad Hispana',
      description: 'Hablamos tu idioma. Entendemos tus necesidades. Te acompañamos en cada paso.',
      accent: true, // This one will be visually different — the "grid-breaking" element
    },
    {
      icon: <FileText className="w-7 h-7" />,
      title: 'Financiamiento RTO',
      description: '¿No puedes pagar al contado? Planes flexibles de Renta con Opción a Compra.',
      accent: false,
    },
    {
      icon: <BadgeCheck className="w-7 h-7" />,
      title: 'Títulos Limpios',
      description: 'Verificamos cada título con TDHCA Texas. Sin deudas, sin problemas legales.',
      accent: false,
    },
    {
      icon: <Users className="w-7 h-7" />,
      title: 'Equipo Dedicado',
      description: 'Profesionales disponibles para resolver cualquier duda. ¡Llámanos o escríbenos!',
      accent: false,
    },
  ]

  return (
    <section className="relative py-24 sm:py-32 bg-white mn-grain-light">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section header — left-aligned for editorial feel */}
        <div
          ref={titleRef}
          className="max-w-2xl mb-16 sm:mb-20"
          style={{
            opacity: titleVisible ? 1 : 0,
            transform: titleVisible ? 'translateY(0)' : 'translateY(30px)',
            transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 max-w-[40px]" style={{ background: 'var(--mn-gold)' }} />
            <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}>
              ¿Por qué elegirnos?
            </p>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.1]" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
            Tu hogar, nuestro
            <span style={{ color: 'var(--mn-gold)' }}> compromiso</span>
          </h2>
          <p className="text-lg mt-5 leading-relaxed" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
            Más que vender casas, construimos hogares. Acompañamos a cada familia en todo el proceso.
          </p>
        </div>

        {/* Feature grid — asymmetric: 2 cols with one special card */}
        <div ref={gridRef} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feat, i) => (
            <div
              key={feat.title}
              className={`group relative rounded-2xl p-7 sm:p-8 transition-all duration-500 mn-hover-lift mn-hover-gold-line overflow-hidden ${
                feat.accent
                  ? 'sm:col-span-2 lg:col-span-1'
                  : ''
              }`}
              style={{
                background: feat.accent ? 'linear-gradient(135deg, var(--mn-blue) 0%, var(--mn-blue-dark) 100%)' : 'white',
                border: feat.accent ? 'none' : '1px solid var(--mn-light-200)',
                opacity: gridVisible ? 1 : 0,
                transform: gridVisible ? 'translateY(0)' : 'translateY(40px)',
                transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 0.08}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 0.08}s, box-shadow 0.35s ease`,
              }}
            >
              {/* Decorative corner for accent card */}
              {feat.accent && (
                <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none" style={{ background: 'radial-gradient(circle at 100% 0%, rgba(163,141,72,0.2), transparent 70%)' }} />
              )}
              
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-3deg]"
                style={{
                  background: feat.accent ? 'rgba(163,141,72,0.2)' : 'var(--mn-blue-50)',
                  color: feat.accent ? '#c4af6a' : 'var(--mn-blue)',
                }}
              >
                {feat.icon}
              </div>
              <h3
                className="text-lg font-bold mb-2"
                style={{
                  color: feat.accent ? 'white' : 'var(--mn-dark)',
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                {feat.title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{
                  color: feat.accent ? 'rgba(255,255,255,0.65)' : 'var(--mn-gray)',
                  fontFamily: "'Mulish', sans-serif",
                }}
              >
                {feat.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════ HOW IT WORKS — Diagonal background, overlapping cards ═══════════ */
function HowItWorksSection() {
  const { ref: titleRef, isInView: titleVisible } = useInView()
  const { ref: stepsRef, isInView: stepsVisible } = useInView({ rootMargin: '0px 0px -80px 0px' })

  const steps = [
    { num: 1, title: 'Elige tu casa', desc: 'Explora nuestro catálogo con fotos, precios y ubicaciones detalladas.', icon: <Home className="w-6 h-6" /> },
    { num: 2, title: 'Contáctanos', desc: 'Escríbenos por WhatsApp o llámanos para resolver todas tus dudas.', icon: <MessageCircle className="w-6 h-6" /> },
    { num: 3, title: 'Realiza el pago', desc: 'Paga al contado o elige nuestro plan de financiamiento RTO flexible.', icon: <Shield className="w-6 h-6" /> },
    { num: 4, title: 'Recibe tu título', desc: 'Procesamos la transferencia y el título queda a tu nombre. ¡Listo!', icon: <FileText className="w-6 h-6" /> },
  ]

  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      {/* Angled background — diagonal feel */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(170deg, var(--mn-light) 0%, white 50%, var(--mn-light) 100%)',
        }}
      />
      {/* Decorative gold line */}
      <div className="absolute top-0 left-0 w-full h-[2px] mn-gradient-gold opacity-40" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header — centered for this section */}
        <div
          ref={titleRef}
          className="text-center mb-16 sm:mb-20 max-w-2xl mx-auto"
          style={{
            opacity: titleVisible ? 1 : 0,
            transform: titleVisible ? 'translateY(0)' : 'translateY(30px)',
            transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="h-px w-8" style={{ background: 'var(--mn-gold)' }} />
            <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}>
              Proceso simple
            </p>
            <div className="h-px w-8" style={{ background: 'var(--mn-gold)' }} />
          </div>
          <h2 className="text-3xl sm:text-4xl font-black" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
            ¿Cómo funciona?
          </h2>
          <p className="text-lg mt-4" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
            En 4 sencillos pasos, tu nuevo hogar estará listo
          </p>
        </div>

        {/* Steps — horizontal on desktop, vertical on mobile */}
        <div ref={stepsRef} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4">
          {steps.map((step, i) => (
            <div
              key={step.num}
              className="relative group"
              style={{
                opacity: stepsVisible ? 1 : 0,
                transform: stepsVisible ? 'translateY(0)' : 'translateY(40px)',
                transition: `all 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 0.12}s`,
              }}
            >
              <div className="bg-white rounded-2xl p-7 h-full transition-all duration-300 mn-hover-lift" style={{ border: '1px solid var(--mn-light-200)' }}>
                {/* Step number — large, overlapping */}
                <div className="flex items-center gap-4 mb-5">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white transition-all duration-300 group-hover:rotate-[-6deg] group-hover:scale-110"
                    style={{ background: 'var(--mn-blue)' }}
                  >
                    {step.icon}
                  </div>
                  <span
                    className="text-5xl font-black leading-none"
                    style={{ color: 'var(--mn-light-200)', fontFamily: "'Montserrat', sans-serif" }}
                  >
                    {step.num}
                  </span>
                </div>

                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
                  {step.desc}
                </p>
              </div>

              {/* Connector arrow */}
              {step.num < 4 && (
                <div className="hidden lg:flex absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                  <ChevronRight className="w-5 h-5" style={{ color: 'var(--mn-gold)' }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════ STATS — Full-bleed dark with grain ═══════════ */
function StatsSection({ stats }: { stats: Stats | null }) {
  const { ref, isInView } = useInView()

  if (!stats || stats.total_available === 0) return null

  return (
    <section
      ref={ref}
      className="relative py-20 overflow-hidden mn-grain"
      style={{ background: 'linear-gradient(135deg, var(--mn-blue-dark) 0%, var(--mn-blue) 100%)' }}
    >
      <div className="absolute inset-0 mn-dots text-white/[0.02] pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { value: stats.total_available, label: 'Casas Disponibles' },
            { value: stats.cities_count, label: 'Ciudades' },
            { value: `$${Math.round(stats.price_range.min / 1000)}k`, label: 'Desde' },
            { value: '200+', label: 'Familias Felices' },
          ].map((item, i) => (
            <div
              key={i}
              style={{
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.9)',
                transition: `all 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 0.1}s`,
              }}
            >
              <p className="text-4xl sm:text-5xl font-black" style={{ color: '#c4af6a', fontFamily: "'Montserrat', sans-serif" }}>
                {item.value}
              </p>
              <p className="text-white/40 text-sm mt-2" style={{ fontFamily: "'Mulish', sans-serif" }}>
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════ CTA — Warm, inviting, grain overlay ═══════════ */
function CTASection() {
  const { ref, isInView } = useInView()

  return (
    <section className="relative py-24 sm:py-32 overflow-hidden bg-white">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full" style={{
          background: 'radial-gradient(ellipse at 30% 50%, rgba(0,66,116,0.04) 0%, transparent 60%)',
        }} />
        <div className="absolute top-0 right-0 w-full h-full" style={{
          background: 'radial-gradient(ellipse at 80% 30%, rgba(163,141,72,0.04) 0%, transparent 50%)',
        }} />
      </div>

      <div
        ref={ref}
        className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
        style={{
          opacity: isInView ? 1 : 0,
          transform: isInView ? 'translateY(0)' : 'translateY(30px)',
          transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Gold decorative lines */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <div className="h-px w-16" style={{ background: 'linear-gradient(90deg, transparent, var(--mn-gold))' }} />
          <Sparkles className="w-5 h-5" style={{ color: 'var(--mn-gold)' }} />
          <div className="h-px w-16" style={{ background: 'linear-gradient(90deg, var(--mn-gold), transparent)' }} />
        </div>

        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
          ¿Listo para encontrar
          <span style={{ color: 'var(--mn-gold)' }}> tu nuevo hogar</span>?
        </h2>
        <p className="text-lg mt-5 max-w-2xl mx-auto" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
          Explora nuestro catálogo o contáctanos directamente. 
          Estamos aquí para ayudarte a dar el primer paso.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
          <Link
            href="/clientes/casas"
            className="group inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-bold text-base text-white transition-all duration-300 shadow-lg hover:shadow-xl hover:translate-y-[-2px]"
            style={{
              background: 'linear-gradient(135deg, var(--mn-blue) 0%, var(--mn-blue-dark) 100%)',
              fontFamily: "'Montserrat', sans-serif",
            }}
          >
            Ver Casas
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1.5" />
          </Link>
          <a
            href="tel:8327459600"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-base transition-all duration-200 hover:translate-y-[-1px]"
            style={{
              color: 'var(--mn-blue)',
              border: '2px solid var(--mn-blue)',
              fontFamily: "'Montserrat', sans-serif",
            }}
          >
            <Phone className="w-5 h-5" />
            (832) 745-9600
          </a>
        </div>
      </div>
    </section>
  )
}
