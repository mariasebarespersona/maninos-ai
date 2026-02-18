'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useInView } from '@/hooks/useInView'
import {
  ArrowRight, CheckCircle, MessageCircle, Phone,
  Shield, Home, Wrench, FileText, Heart, Search,
  UserPlus, CreditCard, Key, TrendingDown, MapPin, Users,
  Play
} from 'lucide-react'

interface Stats {
  total_available: number
  price_range: { min: number; max: number; avg: number }
  cities_count: number
}

interface FeaturedProperty {
  id: string
  address: string
  city: string
  sale_price: number
  photos: string[]
  bedrooms: number
  bathrooms: number
}

export default function ClientPortalHome() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [featured, setFeatured] = useState<FeaturedProperty[]>([])

  useEffect(() => {
    fetch('/api/public/properties/stats/summary')
      .then(r => r.json())
      .then(data => { if (data.ok) setStats(data) })
      .catch(() => {})

    fetch('/api/public/properties?limit=6')
      .then(r => r.json())
      .then(data => { if (data.ok) setFeatured(data.properties?.slice(0, 6) || []) })
      .catch(() => {})
  }, [])

  return (
    <div>
      <Hero />
      <TrustNumbers stats={stats} />
      {featured.length > 0 && <FeaturedSection properties={featured} />}
      <VideoSection />
      <ValueProps />
      <HowItWorks />
      <CTASection />
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HERO — Dark, cinematic, ONE clear CTA
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function Hero() {
  const bgImage = '/images/hero-mobile-homes.png'

  return (
    <section className="relative min-h-[85vh] flex items-center -mt-[76px] pt-[76px]" style={{ background: '#1a1a2e' }}>
      {/* Background image — actual Maninos property or stock mobile home */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${bgImage}')` }}
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.25) 100%)' }} />

      <div className="relative z-10 w-full max-w-[1760px] mx-auto px-6 sm:px-8 lg:px-10">
        <div className="max-w-2xl">
          <h1
            className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.06] opacity-0 animate-fade-in-up"
            style={{ animationDelay: '0.1s', animationFillMode: 'forwards', color: '#ffffff', letterSpacing: '-0.03em', fontFamily: "'Plus Jakarta Sans', sans-serif", textShadow: '0 2px 20px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.5)' }}
          >
            Tu nuevo hogar en Texas
          </h1>
          <p
            className="text-xl sm:text-2xl mt-4 leading-snug font-semibold opacity-0 animate-fade-in-up"
            style={{ animationDelay: '0.2s', animationFillMode: 'forwards', color: 'rgba(255,255,255,0.95)', fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.02em', textShadow: '0 2px 16px rgba(0,0,0,0.6)' }}
          >
            Un lugar seguro para tu familia.
          </p>
          <p
            className="text-[15px] sm:text-[17px] mt-4 leading-relaxed opacity-0 animate-fade-in-up"
            style={{ animationDelay: '0.3s', animationFillMode: 'forwards', color: 'rgba(255,255,255,0.8)', fontFamily: "'Inter', sans-serif", letterSpacing: '-0.01em', textShadow: '0 1px 8px rgba(0,0,0,0.4)' }}
          >
            Casas móviles listas para mudarte. Compra al contado o con plan dueño a dueño RTO.
          </p>

          <div
            className="mt-8 opacity-0 animate-fade-in-up"
            style={{ animationDelay: '0.45s', animationFillMode: 'forwards' }}
          >
            <Link
              href="/clientes/casas"
              className="inline-flex items-center gap-3 px-8 py-4 rounded-xl text-white font-semibold text-[15px] transition-all duration-200 hover:brightness-110 hover:scale-[1.02]"
              style={{ background: '#0068b7', boxShadow: '0 4px 14px rgba(0,104,183,0.4)', fontFamily: "'Inter', sans-serif", letterSpacing: '-0.01em' }}
            >
              <Search className="w-5 h-5" />
              Buscar mi casa
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TRUST NUMBERS — Real metrics that build confidence
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function TrustNumbers({ stats }: { stats: Stats | null }) {
  const { ref, isInView } = useInView()

  const metrics = [
    {
      icon: <TrendingDown className="w-5 h-5" />,
      value: 'Hasta 20%',
      label: 'por debajo del mercado',
      detail: 'Precios competitivos vs. el mercado local',
    },
    {
      icon: <Home className="w-5 h-5" />,
      value: stats?.total_available ? `${stats.total_available}+` : '—',
      label: 'casas disponibles',
      detail: stats?.price_range?.min && stats?.price_range?.max
        ? `Desde $${Math.round(stats.price_range.min / 1000)}K hasta $${Math.round(stats.price_range.max / 1000)}K`
        : 'Inventario actualizado cada semana',
    },
    {
      icon: <MapPin className="w-5 h-5" />,
      value: stats?.cities_count ? `${stats.cities_count}+` : '20+',
      label: 'ciudades en Texas',
      detail: 'Houston, Dallas y zonas cercanas',
    },
    {
      icon: <Users className="w-5 h-5" />,
      value: '100%',
      label: 'en español',
      detail: 'Equipo bilingüe que te acompaña en todo',
    },
  ]

  return (
    <section className="py-10 sm:py-14 bg-white border-b border-gray-100">
      <div ref={ref} className="max-w-[1760px] mx-auto px-6 sm:px-8 lg:px-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {metrics.map((m, i) => (
            <div
              key={m.label}
              className="text-center"
              style={{
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'none' : 'translateY(12px)',
                transition: `all 0.4s ease ${i * 0.08}s`,
              }}
            >
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#e6f0f8] text-[#004274] mb-3">
                {m.icon}
              </div>
              <div className="text-[26px] sm:text-[32px] font-extrabold text-[#222]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                {m.value}
              </div>
              <div className="text-[13px] font-semibold text-[#222] mt-1.5" style={{ letterSpacing: '-0.01em' }}>{m.label}</div>
              <div className="text-[12px] text-[#717171] mt-0.5" style={{ letterSpacing: '0' }}>{m.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   FEATURED — Airbnb-style property cards
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function FeaturedSection({ properties }: { properties: FeaturedProperty[] }) {
  const { ref, isInView } = useInView()

  return (
    <section className="py-16 sm:py-20 bg-white">
      <div className="max-w-[1760px] mx-auto px-6 sm:px-8 lg:px-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-[24px] sm:text-[28px] font-bold text-[#222]" style={{ letterSpacing: '-0.025em' }}>
              Casas disponibles
            </h2>
            <p className="text-[#717171] mt-1 text-[15px]">Encuentra tu próximo hogar</p>
          </div>
          <Link
            href="/clientes/casas"
            className="hidden sm:inline-flex items-center gap-1 text-[13px] font-semibold text-[#222] hover:underline"
          >
            Ver todas <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div ref={ref} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((p, i) => (
            <Link
              key={p.id}
              href={`/clientes/casas/${p.id}`}
              className="group block"
              style={{
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'none' : 'translateY(16px)',
                transition: `all 0.4s ease ${i * 0.05}s`,
              }}
            >
              {/* Photo */}
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 mb-3">
                {p.photos?.[0] ? (
                  <img
                    src={p.photos[0]}
                    alt={p.address}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Home className="w-10 h-10 text-gray-300" />
                  </div>
                )}
              </div>
              {/* Info */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-[15px] text-[#222] leading-snug" style={{ letterSpacing: '-0.01em' }}>
                    {p.city || 'Texas'}, TX
                  </h3>
                </div>
                <p className="text-[13px] text-[#717171] mt-0.5">{p.address}</p>
                {(p.bedrooms > 0 || p.bathrooms > 0) && (
                  <p className="text-[13px] text-[#717171]">
                    {p.bedrooms > 0 && `${p.bedrooms} hab`}
                    {p.bedrooms > 0 && p.bathrooms > 0 && ' · '}
                    {p.bathrooms > 0 && `${p.bathrooms} baños`}
                  </p>
                )}
                <p className="font-bold text-[15px] text-[#222] mt-1" style={{ letterSpacing: '-0.01em' }}>
                  ${p.sale_price?.toLocaleString()}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center sm:hidden">
          <Link
            href="/clientes/casas"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#222] hover:underline"
          >
            Ver todas las casas <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   VIDEOS — Informational videos (placeholders for now)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function VideoSection() {
  const { ref, isInView } = useInView()

  const videos = [
    {
      title: '¿Qué es Rent-to-Own?',
      description: 'Te explicamos cómo funciona el plan dueño a dueño paso a paso.',
      duration: '3:45',
    },
    {
      title: '¿Cómo elegir tu casa móvil?',
      description: 'Consejos para encontrar la casa perfecta para tu familia.',
      duration: '4:20',
    },
    {
      title: 'Proceso de compra con Maninos',
      description: 'Todo lo que necesitas saber antes de comprar.',
      duration: '5:10',
    },
  ]

  return (
    <section className="py-16 sm:py-20 bg-white">
      <div ref={ref} className="max-w-[1760px] mx-auto px-6 sm:px-8 lg:px-10">
        <div className="mb-8">
          <h2 className="text-[24px] sm:text-[28px] font-bold text-[#222]" style={{ letterSpacing: '-0.025em' }}>
            Videos informativos
          </h2>
          <p className="text-[#717171] mt-1 text-[15px]">Aprende más sobre el proceso de compra</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video, i) => (
            <div
              key={video.title}
              className="group cursor-pointer"
              style={{
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'none' : 'translateY(16px)',
                transition: `all 0.4s ease ${i * 0.08}s`,
              }}
            >
              {/* Video Placeholder */}
              <div className="aspect-video rounded-xl bg-gray-100 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 group-hover:border-[#004274]/30 group-hover:bg-[#e6f0f8]/30 transition-colors mb-3">
                <div className="w-14 h-14 rounded-full bg-[#004274]/10 flex items-center justify-center group-hover:bg-[#004274]/20 transition-colors">
                  <Play className="w-6 h-6 text-[#004274] ml-0.5" />
                </div>
                <span className="text-[12px] text-[#b0b0b0] font-medium">Próximamente · {video.duration}</span>
              </div>
              {/* Info */}
              <h3 className="font-semibold text-[15px] text-[#222] leading-snug" style={{ letterSpacing: '-0.01em' }}>
                {video.title}
              </h3>
              <p className="text-[13px] text-[#717171] mt-0.5">{video.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   VALUE PROPS — Clean icons + text
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function ValueProps() {
  const { ref, isInView } = useInView()

  const items = [
    { icon: <Home className="w-6 h-6" />, title: 'Calidad Garantizada', desc: 'Casas inspeccionadas y verificadas. Algunas completamente renovadas.' },
    { icon: <Shield className="w-6 h-6" />, title: 'Compra Segura', desc: 'Proceso transparente con documentos verificados y títulos limpios.' },
    { icon: <Heart className="w-6 h-6" />, title: 'Para Ti', desc: 'Hablamos español. Entendemos tus necesidades. Te acompañamos en cada paso.' },
    { icon: <FileText className="w-6 h-6" />, title: 'Dueño a Dueño RTO', desc: 'Planes Rent-to-Own flexibles si no puedes pagar al contado.' },
  ]

  return (
    <section className="py-16 sm:py-20" style={{ background: '#fafafa' }}>
      <div ref={ref} className="max-w-[1760px] mx-auto px-6 sm:px-8 lg:px-10">
        <h2 className="text-[24px] sm:text-[28px] font-bold text-[#222] mb-10" style={{ letterSpacing: '-0.025em' }}>
          ¿Por qué Maninos Homes?
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {items.map((item, i) => (
            <div
              key={item.title}
              style={{
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'none' : 'translateY(16px)',
                transition: `all 0.4s ease ${i * 0.08}s`,
              }}
            >
              <div className="text-[#004274] mb-4">{item.icon}</div>
              <h3 className="font-bold text-[15px] text-[#222] mb-1.5" style={{ letterSpacing: '-0.015em' }}>{item.title}</h3>
              <p className="text-[14px] text-[#484848] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HOW IT WORKS — Numbered steps, clean
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function HowItWorks() {
  const { ref, isInView } = useInView()

  const steps = [
    {
      num: '1',
      icon: <Search className="w-5 h-5" />,
      title: 'Explora el catálogo',
      desc: 'Navega casas disponibles con fotos, precios y detalles. Usa el simulador para calcular tu plan de pago.',
    },
    {
      num: '2',
      icon: <UserPlus className="w-5 h-5" />,
      title: 'Crea tu cuenta',
      desc: 'Regístrate gratis y solicita la casa que te gusta. Todo el proceso se gestiona desde tu cuenta.',
    },
    {
      num: '3',
      icon: <CreditCard className="w-5 h-5" />,
      title: 'Elige cómo pagar',
      desc: 'Paga al contado o aplica a nuestro plan dueño a dueño RTO. Te guiamos paso a paso desde tu cuenta.',
    },
    {
      num: '4',
      icon: <Key className="w-5 h-5" />,
      title: '¡Recibe tu casa!',
      desc: 'Completamos el papeleo y te entregamos las llaves. El título queda a tu nombre.',
    },
  ]

  return (
    <section className="py-16 sm:py-20 bg-white">
      <div ref={ref} className="max-w-[1760px] mx-auto px-6 sm:px-8 lg:px-10">
        <div className="max-w-2xl mb-10">
          <h2 className="text-[24px] sm:text-[28px] font-bold text-[#222]" style={{ letterSpacing: '-0.025em' }}>
            ¿Cómo funciona?
          </h2>
          <p className="text-[15px] text-[#484848] mt-2" style={{ lineHeight: 1.6 }}>
            Comprar tu casa es simple. Todo lo haces desde tu cuenta — sin complicaciones.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <div
              key={step.num}
              style={{
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'none' : 'translateY(16px)',
                transition: `all 0.4s ease ${i * 0.08}s`,
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ background: '#004274' }}
                >
                  {step.num}
                </div>
                <div className="text-[#004274]">{step.icon}</div>
              </div>
              <h3 className="font-bold text-[15px] text-[#222] mb-1.5" style={{ letterSpacing: '-0.015em' }}>{step.title}</h3>
              <p className="text-[14px] text-[#484848] leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>

        {/* WhatsApp/Phone note — supplementary */}
        <div
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 pt-8 border-t border-gray-100"
          style={{
            opacity: isInView ? 1 : 0,
            transition: 'opacity 0.5s ease 0.4s',
          }}
        >
          <p className="text-[13px] text-[#b0b0b0]">¿Prefieres hablar con alguien?</p>
          <div className="flex items-center gap-3">
            <a
              href="https://api.whatsapp.com/send?phone=+19362005200&text=Hola!%20Me%20interesa%20una%20casa"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium text-[#25d366] border border-[#25d366]/30 hover:bg-[#25d366]/5 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
            <a
              href="tel:9362005200"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium text-[#717171] border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Phone className="w-3.5 h-3.5" /> (936) 200-5200
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CTA — Simple, centered
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function CTASection() {
  return (
    <section className="py-16 sm:py-24" style={{ background: '#fafafa' }}>
      <div className="max-w-2xl mx-auto px-6 text-center">
        <h2 className="text-[24px] sm:text-[28px] font-bold text-[#222]" style={{ letterSpacing: '-0.025em' }}>
          ¿Listo para encontrar tu hogar?
        </h2>
        <p className="text-[15px] text-[#484848] mt-3 leading-relaxed">
          Explora nuestro catálogo o contáctanos directamente. Estamos aquí para ayudarte.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          <Link
            href="/clientes/casas"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-white font-semibold text-[15px] transition-all hover:brightness-110"
            style={{ background: '#004274', letterSpacing: '-0.01em' }}
          >
            Ver casas <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="https://api.whatsapp.com/send?phone=+19362005200&text=Hola!%20Me%20interesa%20una%20casa"
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-[15px] text-[#222] border border-gray-300 hover:border-gray-400 hover:shadow-sm transition-all"
          >
            <MessageCircle className="w-4 h-4 text-[#25d366]" /> WhatsApp
          </a>
        </div>
      </div>
    </section>
  )
}
