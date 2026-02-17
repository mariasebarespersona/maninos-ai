'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useInView } from '@/hooks/useInView'
import {
  ArrowRight, Star, CheckCircle, MessageCircle, Phone,
  Shield, Home, MapPin, Wrench, FileText, Heart, Users,
  BadgeCheck, ChevronRight
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
      .then(data => { if (data.ok) setStats(data) })
      .catch(console.error)
  }, [])

  return (
    <div className="portal-clientes">
      <Hero stats={stats} />
      <SocialProof />
      <WhyUs />
      <HowItWorks />
      <Numbers stats={stats} />
      <FinalCTA />
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HERO — Clean, cinematic, confident
   Large headline, clear CTA, no visual clutter
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function Hero({ stats }: { stats: Stats | null }) {
  return (
    <section className="relative min-h-[92vh] flex items-center" style={{ background: '#00233d' }}>
      {/* Subtle gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(160deg, rgba(0,35,61,1) 0%, rgba(0,66,116,0.95) 50%, rgba(0,90,158,0.85) 100%)',
        }}
      />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-20">
        <div className="max-w-3xl">

          {/* Tagline */}
          <p
            className="text-sm font-semibold tracking-[0.15em] uppercase mb-6 opacity-0 animate-fade-in-up"
            style={{ color: 'var(--mn-gold-light)', fontFamily: "'Montserrat', sans-serif", animationDelay: '0.1s', animationFillMode: 'forwards' }}
          >
            Casas móviles renovadas en Texas
          </p>

          {/* Headline */}
          <h1
            className="text-[2.75rem] sm:text-6xl lg:text-7xl font-extrabold text-white leading-[1.08] tracking-tight opacity-0 animate-fade-in-up"
            style={{ fontFamily: "'Montserrat', sans-serif", animationDelay: '0.2s', animationFillMode: 'forwards' }}
          >
            Tu nuevo hogar{' '}
            <span className="block" style={{ color: 'var(--mn-gold-light)' }}>
              empieza aquí.
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className="text-lg sm:text-xl text-white/60 leading-relaxed mt-8 max-w-xl opacity-0 animate-fade-in-up"
            style={{ fontFamily: "'Mulish', sans-serif", animationDelay: '0.35s', animationFillMode: 'forwards' }}
          >
            Apoyamos a la comunidad hispana con hogares dignos y accesibles.
            Compra al contado o con financiamiento flexible.
          </p>

          {/* CTAs */}
          <div
            className="flex flex-col sm:flex-row gap-4 mt-10 opacity-0 animate-fade-in-up"
            style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}
          >
            <Link
              href="/clientes/casas"
              className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-lg text-white font-bold text-base transition-all duration-200 hover:brightness-110"
              style={{
                background: 'var(--mn-gold)',
                fontFamily: "'Montserrat', sans-serif",
                boxShadow: '0 4px 20px rgba(163,141,72,0.3)',
              }}
            >
              Ver casas disponibles
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>

            <a
              href="https://api.whatsapp.com/send?phone=+18327459600&text=Hola!%20Me%20interesa%20una%20casa%20en%20Maninos%20Homes"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-lg text-white/90 font-semibold text-base transition-all duration-200 border border-white/20 hover:bg-white/10 hover:border-white/40"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            >
              <MessageCircle className="w-4 h-4" style={{ color: '#25d366' }} />
              Escríbenos
            </a>
          </div>

          {/* Quick stats */}
          {stats && stats.total_available > 0 && (
            <div
              className="flex items-center gap-8 sm:gap-12 mt-16 pt-8 border-t border-white/10 opacity-0 animate-fade-in-up"
              style={{ animationDelay: '0.65s', animationFillMode: 'forwards' }}
            >
              <Stat value={`${stats.total_available}`} label="Casas disponibles" />
              <Stat value={`${stats.cities_count}`} label="Ciudades en TX" />
              <Stat value={`$${Math.round(stats.price_range.avg / 1000)}k`} label="Precio promedio" />
            </div>
          )}
        </div>
      </div>

      {/* Clean bottom edge */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 48" fill="none" className="w-full block">
          <path d="M0 48h1440V24c-180 16-360 24-720 24S180 40 0 24v24z" fill="white" />
        </svg>
      </div>
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl sm:text-3xl font-extrabold text-white" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        {value}
      </p>
      <p className="text-sm text-white/40 mt-0.5" style={{ fontFamily: "'Mulish', sans-serif" }}>
        {label}
      </p>
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SOCIAL PROOF — Credibility strip
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function SocialProof() {
  const { ref, isInView } = useInView()
  const items = [
    { icon: <BadgeCheck className="w-5 h-5" />, text: 'Empresa registrada en Texas' },
    { icon: <Shield className="w-5 h-5" />, text: 'Pagos 100% seguros' },
    { icon: <FileText className="w-5 h-5" />, text: 'Títulos verificados TDHCA' },
    { icon: <Users className="w-5 h-5" />, text: '+200 familias atendidas' },
  ]
  return (
    <section ref={ref} className="py-8 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="flex flex-wrap justify-center gap-x-10 gap-y-4">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 text-sm"
              style={{
                color: 'var(--mn-dark-600)',
                fontFamily: "'Mulish', sans-serif",
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'none' : 'translateY(8px)',
                transition: `all 0.5s ease ${i * 0.06}s`,
              }}
            >
              <span style={{ color: 'var(--mn-blue)' }}>{item.icon}</span>
              <span className="font-medium">{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   WHY US — Clean feature cards
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function WhyUs() {
  const { ref: titleRef, isInView: titleVisible } = useInView()
  const { ref: gridRef, isInView: gridVisible } = useInView({ rootMargin: '0px 0px -80px 0px' })

  const features = [
    { icon: <Wrench className="w-6 h-6" />, title: 'Casas 100% Renovadas', desc: 'Plomería, electricidad, pisos, techo y pintura. Listas para mudarte el mismo día.' },
    { icon: <Shield className="w-6 h-6" />, title: 'Compra Segura', desc: 'Proceso transparente, documentos verificados y título transferido a tu nombre.' },
    { icon: <Heart className="w-6 h-6" />, title: 'Comunidad Hispana', desc: 'Hablamos tu idioma, entendemos tus necesidades. Te acompañamos en cada paso.' },
    { icon: <FileText className="w-6 h-6" />, title: 'Financiamiento RTO', desc: 'Planes flexibles de Renta con Opción a Compra si no puedes pagar al contado.' },
    { icon: <BadgeCheck className="w-6 h-6" />, title: 'Títulos Limpios', desc: 'Cada título verificado con TDHCA Texas. Sin deudas, sin problemas legales.' },
    { icon: <Users className="w-6 h-6" />, title: 'Equipo Dedicado', desc: 'Profesionales disponibles por teléfono, WhatsApp o en persona.' },
  ]

  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">

        {/* Header */}
        <div
          ref={titleRef}
          className="max-w-xl mb-16"
          style={{
            opacity: titleVisible ? 1 : 0,
            transform: titleVisible ? 'none' : 'translateY(20px)',
            transition: 'all 0.6s ease',
          }}
        >
          <p className="text-sm font-semibold tracking-[0.12em] uppercase mb-3" style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}>
            ¿Por qué elegirnos?
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold leading-tight" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
            Tu hogar, nuestro compromiso
          </h2>
          <p className="text-base text-gray-500 mt-4 leading-relaxed" style={{ fontFamily: "'Mulish', sans-serif" }}>
            Más que vender casas, construimos hogares. Cada familia recibe atención personalizada.
          </p>
        </div>

        {/* Grid */}
        <div ref={gridRef} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feat, i) => (
            <div
              key={feat.title}
              className="group p-6 rounded-xl border border-gray-100 bg-white transition-all duration-300 hover:shadow-lg hover:border-gray-200"
              style={{
                opacity: gridVisible ? 1 : 0,
                transform: gridVisible ? 'none' : 'translateY(24px)',
                transition: `opacity 0.5s ease ${i * 0.06}s, transform 0.5s ease ${i * 0.06}s, box-shadow 0.3s ease, border-color 0.3s ease`,
              }}
            >
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-105"
                style={{ background: 'var(--mn-blue-50)', color: 'var(--mn-blue)' }}
              >
                {feat.icon}
              </div>
              <h3 className="text-base font-bold mb-1.5" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
                {feat.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed" style={{ fontFamily: "'Mulish', sans-serif" }}>
                {feat.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HOW IT WORKS — Clean numbered steps
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function HowItWorks() {
  const { ref, isInView } = useInView({ rootMargin: '0px 0px -60px 0px' })

  const steps = [
    { num: '01', title: 'Elige tu casa', desc: 'Explora nuestro catálogo con fotos, precios y ubicaciones.', icon: <Home className="w-5 h-5" /> },
    { num: '02', title: 'Contáctanos', desc: 'Escríbenos por WhatsApp o llámanos para resolver tus dudas.', icon: <MessageCircle className="w-5 h-5" /> },
    { num: '03', title: 'Realiza el pago', desc: 'Al contado o con plan de financiamiento RTO flexible.', icon: <Shield className="w-5 h-5" /> },
    { num: '04', title: 'Recibe tu título', desc: 'Procesamos la transferencia. El título queda a tu nombre.', icon: <FileText className="w-5 h-5" /> },
  ]

  return (
    <section className="py-20 sm:py-28" style={{ background: 'var(--mn-light)' }}>
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="text-center max-w-xl mx-auto mb-16">
          <p className="text-sm font-semibold tracking-[0.12em] uppercase mb-3" style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}>
            Proceso simple
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
            ¿Cómo funciona?
          </h2>
        </div>

        <div ref={ref} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <div
              key={step.num}
              className="relative bg-white rounded-xl p-6 border border-gray-100 transition-all duration-300 hover:shadow-md"
              style={{
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'none' : 'translateY(24px)',
                transition: `opacity 0.5s ease ${i * 0.1}s, transform 0.5s ease ${i * 0.1}s, box-shadow 0.3s ease`,
              }}
            >
              {/* Number */}
              <span
                className="text-4xl font-extrabold leading-none block mb-4"
                style={{ color: 'var(--mn-light-300)', fontFamily: "'Montserrat', sans-serif" }}
              >
                {step.num}
              </span>
              <div className="flex items-center gap-3 mb-3">
                <span style={{ color: 'var(--mn-blue)' }}>{step.icon}</span>
                <h3 className="font-bold text-base" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
                  {step.title}
                </h3>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed" style={{ fontFamily: "'Mulish', sans-serif" }}>
                {step.desc}
              </p>
              {/* Connector */}
              {i < 3 && (
                <div className="hidden lg:block absolute top-1/2 -right-4 z-10">
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   NUMBERS — Dark accent section
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function Numbers({ stats }: { stats: Stats | null }) {
  const { ref, isInView } = useInView()
  if (!stats || stats.total_available === 0) return null

  const items = [
    { value: stats.total_available, label: 'Casas disponibles' },
    { value: stats.cities_count, label: 'Ciudades en Texas' },
    { value: `$${Math.round(stats.price_range.min / 1000)}k`, label: 'Desde', isString: true },
    { value: '200+', label: 'Familias felices', isString: true },
  ]

  return (
    <section ref={ref} className="py-16" style={{ background: 'var(--mn-blue-dark)' }}>
      <div className="max-w-5xl mx-auto px-6 sm:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'none' : 'translateY(12px)',
                transition: `all 0.5s ease ${i * 0.08}s`,
              }}
            >
              <p className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--mn-gold-light)', fontFamily: "'Montserrat', sans-serif" }}>
                {item.value}
              </p>
              <p className="text-sm text-white/40 mt-1.5" style={{ fontFamily: "'Mulish', sans-serif" }}>
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   FINAL CTA — Clear, warm, inviting
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function FinalCTA() {
  const { ref, isInView } = useInView()

  return (
    <section className="py-24 sm:py-32 bg-white">
      <div
        ref={ref}
        className="max-w-2xl mx-auto px-6 sm:px-8 text-center"
        style={{
          opacity: isInView ? 1 : 0,
          transform: isInView ? 'none' : 'translateY(20px)',
          transition: 'all 0.6s ease',
        }}
      >
        <h2 className="text-3xl sm:text-4xl font-extrabold leading-tight" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
          ¿Listo para encontrar tu nuevo hogar?
        </h2>
        <p className="text-base text-gray-500 mt-5 leading-relaxed max-w-lg mx-auto" style={{ fontFamily: "'Mulish', sans-serif" }}>
          Explora nuestro catálogo o contáctanos directamente.
          Estamos aquí para ayudarte.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
          <Link
            href="/clientes/casas"
            className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-lg text-white font-bold text-base transition-all duration-200 hover:brightness-110"
            style={{
              background: 'var(--mn-blue)',
              fontFamily: "'Montserrat', sans-serif",
              boxShadow: '0 4px 16px rgba(0,66,116,0.25)',
            }}
          >
            Ver casas
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <a
            href="tel:8327459600"
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-lg font-semibold text-base transition-all duration-200"
            style={{
              color: 'var(--mn-blue)',
              border: '2px solid var(--mn-blue)',
              fontFamily: "'Montserrat', sans-serif",
            }}
          >
            <Phone className="w-4 h-4" />
            (832) 745-9600
          </a>
        </div>
      </div>
    </section>
  )
}
