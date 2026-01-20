'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { 
  Send, Bot, User, Building2, Users, Briefcase, TrendingUp, 
  FileText, Home, ShoppingCart, Wallet, Truck, Menu,
  ChevronRight, Sparkles
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
  { id: 'comercializar', icon: ShoppingCart, label: 'Comercializar', color: 'text-pink-400', desc: 'Marketing y ventas' },
  { id: 'adquirir', icon: Building2, label: 'Adquirir', color: 'text-amber-400', desc: 'Buscar propiedades' },
  { id: 'incorporar', icon: Users, label: 'Incorporar', color: 'text-blue-400', desc: 'Registrar clientes' },
  { id: 'fondear', icon: Wallet, label: 'Fondear', color: 'text-emerald-400', desc: 'Inversionistas' },
  { id: 'gestionar', icon: Briefcase, label: 'Gestionar', color: 'text-purple-400', desc: 'Cobros y pagos' },
  { id: 'entregar', icon: Truck, label: 'Entregar', color: 'text-cyan-400', desc: 'Transferir títulos' },
]

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => `session-${Date.now()}`)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [clientsOpen, setClientsOpen] = useState(false)
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
        content: 'Error de conexión con el servidor.',
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

  // Quick action buttons
  const quickActions = [
    { icon: Building2, label: 'Buscar propiedades', prompt: 'Busca propiedades móviles en Houston, TX con 3 recámaras', color: 'text-amber-400' },
    { icon: Users, label: 'Nuevo cliente', prompt: 'Quiero registrar un nuevo cliente', color: 'text-blue-400' },
    { icon: FileText, label: 'Verificar KYC', prompt: 'Iniciar verificación KYC para un cliente', color: 'text-emerald-400' },
    { icon: TrendingUp, label: 'Calcular DTI', prompt: 'Calcular el DTI para un cliente', color: 'text-purple-400' },
  ]

  const getAgentBadge = (agent?: string) => {
    if (!agent) return null
    const colors: Record<string, string> = {
      'AdquirirAgent': 'bg-amber-500/20 text-amber-400',
      'IncorporarAgent': 'bg-blue-500/20 text-blue-400',
      'ComercializarAgent': 'bg-pink-500/20 text-pink-400',
    }
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${colors[agent] || 'bg-slate-500/20 text-slate-400'}`}>
        {agent.replace('Agent', '')}
      </span>
    )
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-slate-900/50 border-r border-white/5 flex flex-col transition-all duration-300`}>
        {/* Logo */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-amber-500/20 flex-shrink-0">
          M
                </div>
            {sidebarOpen && (
              <div>
                <h1 className="text-white font-bold text-lg">MANINOS</h1>
                <p className="text-slate-500 text-xs">AI Platform v2.0</p>
              </div>
            )}
          </div>
        </div>

        {/* Toggle */}
                  <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="m-2 p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
                <Menu size={20} />
                  </button>

        {/* Quick Access */}
        {sidebarOpen && (
          <div className="px-4 mb-2">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-2">Acceso Rápido</p>
            <div className="space-y-1">
              <button
                onClick={() => setPropertiesOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <Building2 size={18} />
                <span className="text-sm">Ver Propiedades</span>
                <ChevronRight size={14} className="ml-auto" />
              </button>
              <button
                onClick={() => setClientsOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <Users size={18} />
                <span className="text-sm">Ver Clientes</span>
                <ChevronRight size={14} className="ml-auto" />
              </button>
            </div>
          </div>
        )}

        {/* Processes Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          {sidebarOpen && (
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-3">6 Macroprocesos</p>
          )}
          <ul className="space-y-1">
            {PROCESSES.map((process) => (
              <li key={process.id}>
                <button
                  onClick={() => {
                    setInput(`Ayúdame con el proceso ${process.label}`)
                    inputRef.current?.focus()
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                  title={process.desc}
                >
                  <process.icon size={18} className={process.color} />
                  {sidebarOpen && (
                    <>
                      <span className="text-sm">{process.label}</span>
                      <span className="ml-auto text-slate-600 text-xs">{process.desc}</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* User */}
        <div className="p-4 border-t border-white/5">
          {sidebarOpen ? (
            <UserMenu />
          ) : (
            <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white text-sm font-medium mx-auto">
              U
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-white/5 flex items-center px-6 flex-shrink-0">
          <Sparkles size={20} className="text-amber-400 mr-2" />
          <h2 className="text-white font-semibold">Asistente AI</h2>
          <span className="ml-3 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-full">
            Online
          </span>
          <div className="ml-auto text-slate-500 text-sm">
            Sesión: {sessionId.slice(-8)}
            </div>
        </header>
        
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6" ref={scrollRef}>
            {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center text-white text-4xl font-bold shadow-lg shadow-amber-500/20 mb-6">
                M
                </div>
              <h3 className="text-2xl font-bold text-white mb-2">¡Bienvenido a Maninos AI!</h3>
              <p className="text-slate-400 text-center max-w-md mb-8">
                Tu asistente inteligente para la gestión de propiedades rent-to-own.
                Puedo ayudarte con los 6 procesos de la cadena de valor.
              </p>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
                {quickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(action.prompt)
                      inputRef.current?.focus()
                    }}
                    className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors text-left group"
                  >
                    <action.icon size={20} className={action.color} />
                    <span className="text-white text-sm group-hover:text-amber-400 transition-colors">{action.label}</span>
                  </button>
                ))}
                </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-slate-600 text-white'
                      : 'bg-gradient-to-br from-amber-400 to-amber-600 text-white'
                }`}>
                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
                  <div className={`max-w-[80%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                    {msg.role === 'assistant' && msg.agent && (
                      <div className="mb-1">{getAgentBadge(msg.agent)}</div>
                    )}
                    <div className={`inline-block px-4 py-3 rounded-2xl ${
                      msg.role === 'user'
                        ? 'bg-amber-500 text-white rounded-tr-sm'
                        : 'bg-white/10 text-white rounded-tl-sm'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                    <Bot size={16} className="text-white" />
                  </div>
                  <div className="bg-white/10 px-4 py-3 rounded-2xl rounded-tl-sm">
                    <div className="flex gap-1">
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
        <div className="p-4 border-t border-white/5 flex-shrink-0">
          <div className="max-w-3xl mx-auto flex gap-3">
                    <input
                        ref={inputRef}
                        type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu mensaje..."
              disabled={loading}
              className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
            />
              <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-lg shadow-amber-500/20"
            >
              <Send size={20} />
              </button>
            </div>
          <p className="text-center text-slate-600 text-xs mt-2">
            Maninos AI v2.0 • 6 Agentes especializados
          </p>
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
