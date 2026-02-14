'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Home, Shield, FileText, MapPin, ArrowRight, Star, CheckCircle } from 'lucide-react'

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
    <div>
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 text-white overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 25px 25px, white 2px, transparent 0)',
            backgroundSize: '50px 50px'
          }} />
        </div>
        
        <div className="container mx-auto px-4 py-20 md:py-32 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-gold-500/20 text-gold-400 px-4 py-2 rounded-full text-sm mb-6">
              <Star className="w-4 h-4" />
              <span>Casas renovadas en Texas</span>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              Tu Casa Móvil
              <span className="text-gold-400"> Lista para Vivir</span>
            </h1>
            
            <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              Casas móviles completamente renovadas en Texas. 
              Compra segura al contado con transferencia de título directo a tu nombre.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Link 
                href="/clientes/casas" 
                className="inline-flex items-center justify-center gap-2 bg-gold-500 text-navy-900 px-8 py-4 rounded-lg font-bold text-lg hover:bg-gold-400 transition-all hover:scale-105"
              >
                Ver Casas Disponibles
                <ArrowRight className="w-5 h-5" />
              </Link>
              
              <Link 
                href="/clientes/mi-cuenta" 
                className="inline-flex items-center justify-center gap-2 border-2 border-white/30 text-white px-8 py-4 rounded-lg font-medium hover:bg-white/10 transition-colors"
              >
                Tengo una Compra
              </Link>
            </div>
            
            {/* Stats */}
            {stats && stats.total_available > 0 && (
              <div className="grid grid-cols-3 gap-6 mt-12 pt-8 border-t border-white/10">
                <div>
                  <p className="text-3xl font-bold text-gold-400">{stats.total_available}</p>
                  <p className="text-gray-400 text-sm">Casas disponibles</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-gold-400">{stats.cities_count}</p>
                  <p className="text-gray-400 text-sm">Ciudades en Texas</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-gold-400">
                    ${Math.round(stats.price_range.avg / 1000)}k
                  </p>
                  <p className="text-gray-400 text-sm">Precio promedio</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-navy-900 mb-4">
              ¿Por qué elegirnos?
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Ofrecemos un proceso simple, transparente y seguro para que consigas tu casa móvil.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Home className="w-8 h-8" />}
              title="Casas Renovadas"
              description="Todas nuestras casas están completamente renovadas con materiales de calidad, listas para que te mudes."
            />
            <FeatureCard
              icon={<Shield className="w-8 h-8" />}
              title="Pago Seguro"
              description="Paga de forma segura con tarjeta a través de Stripe. Tu información está protegida."
            />
            <FeatureCard
              icon={<FileText className="w-8 h-8" />}
              title="Título Directo"
              description="Recibe el título de propiedad directamente a tu nombre. Sin intermediarios ni complicaciones."
            />
          </div>
        </div>
      </section>
      
      {/* How it Works */}
      <section className="py-20 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-navy-900 mb-4">
              ¿Cómo funciona?
            </h2>
            <p className="text-gray-600 text-lg">
              En 4 simples pasos tendrás tu nueva casa
            </p>
          </div>
          
          <div className="grid md:grid-cols-4 gap-6">
            <StepCard
              number={1}
              title="Elige tu casa"
              description="Navega nuestro catálogo y encuentra la casa perfecta para ti."
            />
            <StepCard
              number={2}
              title="Ingresa tus datos"
              description="Proporciona tu información y la ubicación donde colocarás la casa."
            />
            <StepCard
              number={3}
              title="Realiza el pago"
              description="Paga de forma segura con tarjeta. Aceptamos todas las tarjetas principales."
            />
            <StepCard
              number={4}
              title="Recibe tu título"
              description="Procesamos la transferencia y recibes el título a tu nombre."
            />
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-gold-500 to-gold-600">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-navy-900 mb-4">
            ¿Listo para encontrar tu nueva casa?
          </h2>
          <p className="text-navy-800 text-lg mb-8 max-w-2xl mx-auto">
            Explora nuestro catálogo de casas disponibles y da el primer paso hacia tu nuevo hogar.
          </p>
          <Link 
            href="/clientes/casas" 
            className="inline-flex items-center gap-2 bg-navy-900 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-navy-800 transition-colors"
          >
            Ver Casas Disponibles
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
      
      {/* Trust Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center items-center gap-8 text-gray-400">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>Empresa registrada en Texas</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>Pagos seguros con Stripe</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>Títulos verificados</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>+100 familias felices</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({ 
  icon, 
  title, 
  description 
}: { 
  icon: React.ReactNode
  title: string
  description: string 
}) {
  return (
    <div className="bg-slate-50 rounded-2xl p-8 text-center hover:shadow-lg transition-shadow">
      <div className="w-16 h-16 bg-gold-100 text-gold-600 rounded-xl flex items-center justify-center mx-auto mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-navy-900 mb-3">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  )
}

function StepCard({ 
  number, 
  title, 
  description 
}: { 
  number: number
  title: string
  description: string 
}) {
  return (
    <div className="relative">
      <div className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="w-12 h-12 bg-gold-500 text-navy-900 rounded-full flex items-center justify-center font-bold text-xl mb-4">
          {number}
        </div>
        <h3 className="font-bold text-navy-900 mb-2">{title}</h3>
        <p className="text-gray-600 text-sm">{description}</p>
      </div>
      
      {/* Arrow connector (hidden on last item) */}
      {number < 4 && (
        <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2">
          <ArrowRight className="w-6 h-6 text-gray-300" />
        </div>
      )}
    </div>
  )
}


