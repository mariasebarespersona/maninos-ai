'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import PropertiesDrawer from '@/components/PropertiesDrawer'
import ClientsDrawer from '@/components/ClientsDrawer'
import { useAuth } from '@/components/Auth/AuthProvider'

// Icons as simple SVGs for cleaner code
const Icons = {
  send: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>,
  menu: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  x: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  home: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  users: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  cart: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  wallet: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>,
  chart: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  truck: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>,
  sparkles: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>,
  logout: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  agent?: string
  timestamp?: string
}

const PROCESSES = [
  { id: 'comercializar', icon: Icons.cart, label: 'Comercializar', color: 'text-rose-400', bg: 'bg-rose-500/10' },
  { id: 'adquirir', icon: Icons.home, label: 'Adquirir', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { id: 'incorporar', icon: Icons.users, label: 'Incorporar', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { id: 'fondear', icon: Icons.wallet, label: 'Fondear', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { id: 'gestionar', icon: Icons.chart, label: 'Gestionar', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { id: 'entregar', icon: Icons.truck, label: 'Entregar', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
]

export default function HomePage() {
  const { user, signOut } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => `session-${Date.now()}`)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [clientsOpen, setClientsOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'

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
        body: JSON.stringify({ message: input, session_id: sessionId })
      })

      const data = await res.json()

      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: data.response || data.error || 'Sin respuesta',
        agent: data.agent,
        timestamp: new Date().toISOString()
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Error de conexión con el servidor',
        timestamp: new Date().toISOString()
      }])
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

  const getAgentColor = (agent?: string) => {
    const colors: Record<string, string> = {
      'AdquirirAgent': 'bg-amber-500/20 text-amber-400',
      'IncorporarAgent': 'bg-blue-500/20 text-blue-400',
      'ComercializarAgent': 'bg-rose-500/20 text-rose-400',
    }
    return colors[agent || ''] || 'bg-zinc-500/20 text-zinc-400'
  }

  return (
    <div className="h-screen flex bg-[#09090b] overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-[20%] w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-[10%] w-[400px] h-[400px] bg-orange-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50 w-72 
        bg-[#0f0f10]/95 backdrop-blur-xl border-r border-white/5
        transform transition-transform duration-300 lg:transform-none
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col
      `}>
        {/* Logo */}
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center glow-gold">
                <span className="text-black font-black text-lg">M</span>
              </div>
              <div>
                <div className="text-white font-bold text-lg">MANINOS</div>
                <div className="text-amber-400/60 text-[10px] tracking-[0.15em]">AI PLATFORM</div>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden btn-ghost">
              {Icons.x}
            </button>
          </div>
        </div>

        {/* Quick Access */}
        <div className="p-4">
          <div className="text-zinc-500 text-[10px] font-semibold tracking-wider mb-3">ACCESO RÁPIDO</div>
          <div className="space-y-1">
            <button 
              onClick={() => { setPropertiesOpen(true); setSidebarOpen(false); }}
              className="sidebar-item w-full"
            >
              <span className="text-amber-400">{Icons.home}</span>
              <span className="text-sm">Propiedades</span>
            </button>
            <button 
              onClick={() => { setClientsOpen(true); setSidebarOpen(false); }}
              className="sidebar-item w-full"
            >
              <span className="text-blue-400">{Icons.users}</span>
              <span className="text-sm">Clientes</span>
            </button>
          </div>
        </div>

        {/* Processes */}
        <div className="flex-1 p-4 overflow-y-auto scrollbar-thin">
          <div className="text-zinc-500 text-[10px] font-semibold tracking-wider mb-3">6 MACROPROCESOS</div>
          <div className="space-y-1">
            {PROCESSES.map((p, i) => (
              <button
                key={p.id}
                onClick={() => {
                  setInput(`Ayúdame con el proceso ${p.label}`)
                  setSidebarOpen(false)
                  inputRef.current?.focus()
                }}
                className={`sidebar-item w-full animate-slide-in delay-${i + 1}`}
              >
                <span className={p.color}>{p.icon}</span>
                <span className="text-sm">{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* User */}
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-zinc-800 rounded-full flex items-center justify-center text-white text-sm font-medium">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm truncate">{user?.email || 'Usuario'}</div>
              <div className="text-zinc-500 text-xs">Empleado</div>
            </div>
            <button onClick={signOut} className="btn-ghost text-zinc-500 hover:text-red-400">
              {Icons.logout}
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Header */}
        <header className="h-16 border-b border-white/5 flex items-center px-4 lg:px-6 bg-[#0a0a0b]/80 backdrop-blur-xl">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden btn-ghost mr-3">
            {Icons.menu}
          </button>
          
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <span className="text-amber-400">{Icons.sparkles}</span>
            </div>
            <div>
              <div className="text-white font-semibold">Asistente IA</div>
              <div className="text-zinc-500 text-xs hidden sm:block">Tu hogar, nuestro compromiso</div>
            </div>
          </div>

          <div className="ml-4 badge badge-success">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Online
          </div>

          <div className="ml-auto text-zinc-600 text-xs font-mono">
            #{sessionId.slice(-6)}
          </div>
        </header>

        {/* Chat */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-4 lg:p-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center animate-fade-in">
              {/* Logo */}
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-400/30 to-orange-500/30 rounded-3xl blur-2xl" />
                <div className="relative w-24 h-24 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 rounded-2xl flex items-center justify-center animate-float">
                  <span className="text-black text-5xl font-black">M</span>
                </div>
              </div>

              <h2 className="text-3xl font-bold text-white mb-3 text-center">
                ¡Hola! Soy <span className="text-gradient">Maninos AI</span>
              </h2>
              <p className="text-zinc-400 text-center max-w-md mb-10">
                Tu asistente para gestionar casas móviles rent-to-own. 
                ¿En qué puedo ayudarte hoy?
              </p>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3 max-w-md w-full">
                {[
                  { label: 'Buscar propiedades', prompt: 'Busca casas móviles en Houston con 3 recámaras', icon: Icons.home, color: 'text-amber-400' },
                  { label: 'Nuevo cliente', prompt: 'Quiero registrar un nuevo cliente', icon: Icons.users, color: 'text-blue-400' },
                  { label: 'Ver inventario', prompt: 'Muéstrame el inventario de propiedades', icon: Icons.chart, color: 'text-emerald-400' },
                  { label: 'Calcular oferta', prompt: 'Calcula oferta con market_value 50000', icon: Icons.wallet, color: 'text-purple-400' },
                ].map((action, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(action.prompt); inputRef.current?.focus(); }}
                    className={`card card-hover p-4 text-left animate-fade-in delay-${i + 1}`}
                  >
                    <span className={`${action.color} mb-2 block`}>{action.icon}</span>
                    <span className="text-white text-sm font-medium">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''} animate-fade-in`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-black text-sm font-bold">M</span>
                    </div>
                  )}
                  
                  <div className={msg.role === 'user' ? 'text-right' : ''}>
                    {msg.role === 'assistant' && msg.agent && (
                      <span className={`inline-block mb-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${getAgentColor(msg.agent)}`}>
                        {msg.agent.replace('Agent', '')}
                      </span>
                    )}
                    <div className={msg.role === 'user' ? 'chat-user' : 'chat-assistant'}>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-medium">{user?.email?.charAt(0).toUpperCase() || 'U'}</span>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-3 animate-fade-in">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                    <span className="text-black text-sm font-bold">M</span>
                  </div>
                  <div className="chat-assistant">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/5 bg-[#0a0a0b]/80 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu mensaje..."
              disabled={loading}
              className="input flex-1"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="btn-primary px-5"
            >
              {Icons.send}
            </button>
          </div>
          <p className="text-center text-zinc-700 text-xs mt-3">
            Maninos AI v2 • Powered by GPT-4o
          </p>
        </div>
      </main>

      {/* Drawers */}
      <PropertiesDrawer 
        isOpen={propertiesOpen} 
        onClose={() => setPropertiesOpen(false)}
        onSelectProperty={(p) => {
          setPropertiesOpen(false)
          setInput(`Info de propiedad: ${p.address}`)
          inputRef.current?.focus()
        }}
      />
      <ClientsDrawer 
        isOpen={clientsOpen} 
        onClose={() => setClientsOpen(false)}
        onSelectClient={(c) => {
          setClientsOpen(false)
          setInput(`Info del cliente ${c.full_name}`)
          inputRef.current?.focus()
        }}
      />
    </div>
  )
}
