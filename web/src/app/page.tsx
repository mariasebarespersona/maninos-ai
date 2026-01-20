'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { 
  Send, Bot, User, Building2, Users, Briefcase, TrendingUp, 
  FileText, Home, ShoppingCart, Wallet, Truck, Menu, X,
  ChevronRight, Sparkles, Phone, MessageCircle, Search,
  PlusCircle, BarChart3, Settings, LogOut, Bell, HelpCircle,
  Zap, Shield, Clock, CheckCircle2, ArrowRight
} from 'lucide-react'
import PropertiesDrawer from '@/components/PropertiesDrawer'
import ClientsDrawer from '@/components/ClientsDrawer'
import { UserMenu } from '@/components/Auth'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  agent?: string
  timestamp?: string
}

// 6 Macroprocesos de Maninos
const PROCESSES = [
  { 
    id: 'comercializar', 
    icon: ShoppingCart, 
    label: 'Comercializar', 
    color: 'from-pink-500 to-rose-500',
    bgColor: 'bg-pink-500/10',
    textColor: 'text-pink-400',
    desc: 'Marketing, leads y captación de clientes'
  },
  { 
    id: 'adquirir', 
    icon: Building2, 
    label: 'Adquirir', 
    color: 'from-amber-400 to-orange-500',
    bgColor: 'bg-amber-500/10',
    textColor: 'text-amber-400',
    desc: 'Búsqueda y evaluación de propiedades'
  },
  { 
    id: 'incorporar', 
    icon: Users, 
    label: 'Incorporar', 
    color: 'from-blue-400 to-indigo-500',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-400',
    desc: 'Registro de clientes y KYC'
  },
  { 
    id: 'fondear', 
    icon: Wallet, 
    label: 'Fondear', 
    color: 'from-emerald-400 to-teal-500',
    bgColor: 'bg-emerald-500/10',
    textColor: 'text-emerald-400',
    desc: 'Gestión de inversionistas'
  },
  { 
    id: 'gestionar', 
    icon: Briefcase, 
    label: 'Gestionar', 
    color: 'from-purple-400 to-violet-500',
    bgColor: 'bg-purple-500/10',
    textColor: 'text-purple-400',
    desc: 'Cartera, cobros y pagos'
  },
  { 
    id: 'entregar', 
    icon: Truck, 
    label: 'Entregar', 
    color: 'from-cyan-400 to-sky-500',
    bgColor: 'bg-cyan-500/10',
    textColor: 'text-cyan-400',
    desc: 'Transferencia de títulos'
  },
]

// Quick actions con iconos más descriptivos
const QUICK_ACTIONS = [
  { 
    icon: Search, 
    label: 'Buscar propiedades', 
    prompt: 'Busca propiedades móviles en Houston, TX con 3 recámaras',
    color: 'from-amber-400 to-orange-500'
  },
  { 
    icon: PlusCircle, 
    label: 'Nuevo cliente', 
    prompt: 'Quiero registrar un nuevo cliente',
    color: 'from-blue-400 to-indigo-500'
  },
  { 
    icon: Shield, 
    label: 'Verificar KYC', 
    prompt: 'Iniciar verificación KYC para un cliente',
    color: 'from-emerald-400 to-teal-500'
  },
  { 
    icon: BarChart3, 
    label: 'Calcular DTI', 
    prompt: 'Calcular el DTI para un cliente',
    color: 'from-purple-400 to-violet-500'
  },
]

// Features para el welcome screen
const FEATURES = [
  { icon: Zap, title: '6 Agentes Especializados', desc: 'IA entrenada para cada proceso' },
  { icon: Shield, title: 'KYC Automatizado', desc: 'Verificación con Stripe Identity' },
  { icon: Clock, title: 'Respuesta Inmediata', desc: 'Disponible 24/7 para ti' },
]

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => `session-${Date.now()}`)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [clientsOpen, setClientsOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages.length])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          session_id: sessionId
        })
      })

      const data = await res.json()

      const aiMsg: ChatMessage = { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: data.response || data.error || 'Sin respuesta',
        agent: data.agent,
        timestamp: new Date().toISOString()
      }

      setMessages(prev => [...prev, aiMsg])
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Error de conexión con el servidor. Por favor intenta de nuevo.',
        timestamp: new Date().toISOString()
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, loading, sessionId, BACKEND_URL])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const getAgentBadge = (agent?: string) => {
    if (!agent) return null
    const agentConfig: Record<string, { bg: string, text: string }> = {
      'AdquirirAgent': { bg: 'bg-amber-500/20', text: 'text-amber-400' },
      'IncorporarAgent': { bg: 'bg-blue-500/20', text: 'text-blue-400' },
      'ComercializarAgent': { bg: 'bg-pink-500/20', text: 'text-pink-400' },
      'FondearAgent': { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
      'GestionarAgent': { bg: 'bg-purple-500/20', text: 'text-purple-400' },
      'EntregarAgent': { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
    }
    const config = agentConfig[agent] || { bg: 'bg-slate-500/20', text: 'text-slate-400' }
    return (
      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${config.bg} ${config.text}`}>
        {agent.replace('Agent', '')}
      </span>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-grid">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50
        ${sidebarCollapsed ? 'w-20' : 'w-72'} 
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        sidebar transition-all duration-300 ease-out
      `}>
        {/* Logo Section */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            {/* Logo with glow effect */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded-xl blur opacity-40 group-hover:opacity-60 transition-opacity" />
              <div className="relative w-11 h-11 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
                M
              </div>
            </div>
            
            {!sidebarCollapsed && (
              <div className="animate-fade-in">
                <h1 className="text-white font-bold text-xl tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                  MANINOS
                </h1>
                <p className="text-amber-400/80 text-[10px] font-medium uppercase tracking-widest">
                  AI Platform
                </p>
              </div>
            )}
            
            {/* Close button for mobile */}
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden ml-auto p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Toggle Collapse */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden lg:flex w-full items-center justify-center p-3 text-slate-500 hover:text-white hover:bg-white/5 transition-colors border-b border-white/5"
        >
          <Menu size={18} />
        </button>

        {/* Quick Access */}
        {!sidebarCollapsed && (
          <div className="px-4 py-3">
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest mb-3">
              Acceso Rápido
            </p>
            <div className="space-y-1">
              <button
                onClick={() => { setPropertiesOpen(true); setMobileMenuOpen(false); }}
                className="sidebar-item w-full group"
              >
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                  <Building2 size={16} />
                </div>
                <span className="text-sm">Ver Propiedades</span>
                <ChevronRight size={14} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <button
                onClick={() => { setClientsOpen(true); setMobileMenuOpen(false); }}
                className="sidebar-item w-full group"
              >
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                  <Users size={16} />
                </div>
                <span className="text-sm">Ver Clientes</span>
                <ChevronRight size={14} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </div>
        )}

        {/* Processes Navigation */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto scrollbar-thin">
          {!sidebarCollapsed && (
            <p className="px-1 text-slate-500 text-[10px] font-semibold uppercase tracking-widest mb-3">
              6 Macroprocesos
            </p>
          )}
          <ul className="space-y-1">
            {PROCESSES.map((process, i) => (
              <li key={process.id} className={`animate-fade-in stagger-${i + 1}`}>
                <button
                  onClick={() => {
                    setInput(`Ayúdame con el proceso ${process.label}`)
                    setMobileMenuOpen(false)
                    inputRef.current?.focus()
                  }}
                  className="sidebar-item w-full group"
                  title={process.desc}
                >
                  <div className={`p-2 rounded-lg ${process.bgColor} ${process.textColor} group-hover:scale-110 transition-transform`}>
                    <process.icon size={sidebarCollapsed ? 20 : 16} />
                  </div>
                  {!sidebarCollapsed && (
                    <>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium">{process.label}</span>
                        <p className="text-[10px] text-slate-500 truncate">{process.desc}</p>
                      </div>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-white/5">
          {!sidebarCollapsed ? (
            <UserMenu />
          ) : (
            <div className="flex justify-center">
              <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-white text-sm font-medium">
                U
              </div>
            </div>
          )}
        </div>

        {/* Contact Info */}
        {!sidebarCollapsed && (
          <div className="px-4 pb-4">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Contacto</p>
              <a 
                href="tel:832-745-9600" 
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-amber-400 transition-colors"
              >
                <Phone size={14} />
                832-745-9600
              </a>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="h-16 border-b border-white/5 flex items-center px-4 lg:px-6 flex-shrink-0 bg-[color:var(--bg-surface-glass)] backdrop-blur-xl z-30">
          {/* Mobile menu button */}
          <button 
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 -ml-2 mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
          >
            <Menu size={20} />
          </button>

          {/* Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-400/20 to-orange-500/20">
              <Sparkles size={18} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                Asistente AI
              </h2>
              <p className="text-xs text-slate-500 hidden sm:block">Tu hogar, nuestro compromiso</p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="ml-4 badge-success">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            Online
          </div>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden md:block text-xs text-slate-500 font-mono">
              #{sessionId.slice(-6)}
            </span>
            <button className="btn-icon relative">
              <Bell size={18} />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
            </button>
            <button className="btn-icon">
              <HelpCircle size={18} />
            </button>
          </div>
        </header>
        
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin" ref={scrollRef}>
          {messages.length === 0 ? (
            /* Welcome Screen */
            <div className="h-full flex flex-col items-center justify-center p-6 bg-glow">
              {/* Hero Logo */}
              <div className="relative mb-8 animate-float">
                <div className="absolute -inset-4 bg-gradient-to-r from-amber-400/30 to-orange-500/30 rounded-3xl blur-2xl" />
                <div className="relative w-24 h-24 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 rounded-2xl flex items-center justify-center text-white text-5xl font-bold shadow-2xl">
                  M
                </div>
              </div>

              {/* Welcome Text */}
              <h3 
                className="text-3xl md:text-4xl font-bold text-white mb-3 text-center animate-fade-in"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                ¡Bienvenido a <span className="gradient-text">Maninos AI</span>!
              </h3>
              <p className="text-slate-400 text-center max-w-lg mb-8 animate-fade-in stagger-1">
                Tu asistente inteligente para la gestión de casas móviles rent-to-own.
                Puedo ayudarte con los <span className="text-amber-400 font-semibold">6 procesos</span> de la cadena de valor.
              </p>

              {/* Features */}
              <div className="flex flex-wrap justify-center gap-6 mb-10">
                {FEATURES.map((feature, i) => (
                  <div 
                    key={i} 
                    className={`flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 animate-fade-in stagger-${i + 2}`}
                  >
                    <feature.icon size={16} className="text-amber-400" />
                    <div>
                      <p className="text-white text-sm font-medium">{feature.title}</p>
                      <p className="text-slate-500 text-xs">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Actions Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl w-full">
                {QUICK_ACTIONS.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(action.prompt)
                      inputRef.current?.focus()
                    }}
                    className={`
                      group relative overflow-hidden p-4 rounded-2xl 
                      bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20
                      transition-all duration-300 text-left
                      animate-fade-in stagger-${i + 3}
                    `}
                  >
                    {/* Gradient background on hover */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${action.color} opacity-0 group-hover:opacity-10 transition-opacity`} />
                    
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-lg`}>
                      <action.icon size={20} className="text-white" />
                    </div>
                    <span className="text-white text-sm font-medium block group-hover:text-amber-400 transition-colors">
                      {action.label}
                    </span>
                    <ArrowRight size={14} className="absolute bottom-4 right-4 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Chat Messages */
            <div className="max-w-3xl mx-auto p-6 space-y-6">
              {messages.map((msg, i) => (
                <div
                  key={msg.id}
                  className={`flex gap-4 animate-fade-in ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div className={`
                    w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg
                    ${msg.role === 'user'
                      ? 'bg-slate-600 text-white'
                      : 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                    }
                  `}>
                    {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                  </div>

                  {/* Message Content */}
                  <div className={`max-w-[80%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                    {/* Agent Badge */}
                    {msg.role === 'assistant' && msg.agent && (
                      <div className="mb-2">{getAgentBadge(msg.agent)}</div>
                    )}

                    {/* Bubble */}
                    <div className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>

                    {/* Timestamp */}
                    <p className="text-[10px] text-slate-600 mt-1.5 px-1">
                      {msg.timestamp && new Date(msg.timestamp).toLocaleTimeString('es-MX', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              ))}
              
              {/* Loading State */}
              {loading && (
                <div className="flex gap-4 animate-fade-in">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                    <Bot size={18} className="text-white" />
                  </div>
                  <div className="chat-bubble-assistant">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
              
        {/* Input Area */}
        <div className="p-4 border-t border-white/5 bg-[color:var(--bg-surface-glass)] backdrop-blur-xl flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3 items-end">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe tu mensaje..."
                  disabled={loading}
                  className="input-lg pr-12"
                />
                <div className="absolute right-3 bottom-3 text-slate-600 text-xs hidden sm:block">
                  Enter ↵
                </div>
              </div>
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="btn-primary h-14 px-6"
              >
                <Send size={20} />
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 px-1">
              <p className="text-slate-600 text-xs">
                Maninos AI v2.0 • Powered by GPT-4o
              </p>
              <a 
                href="https://www.maninoshomes.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-slate-500 text-xs hover:text-amber-400 transition-colors"
              >
                maninoshomes.com
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* Drawers */}
      <PropertiesDrawer 
        isOpen={propertiesOpen} 
        onClose={() => setPropertiesOpen(false)}
        onSelectProperty={(property) => {
          setPropertiesOpen(false)
          setInput(`Dame información sobre la propiedad ${property.address}`)
          inputRef.current?.focus()
        }}
      />
      <ClientsDrawer 
        isOpen={clientsOpen} 
        onClose={() => setClientsOpen(false)}
        onSelectClient={(client) => {
          setClientsOpen(false)
          setInput(`Dame información sobre el cliente ${client.full_name} (ID: ${client.id})`)
          inputRef.current?.focus()
        }}
      />
    </div>
  )
}
