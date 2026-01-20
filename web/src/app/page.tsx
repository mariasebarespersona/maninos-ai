'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import PropertiesDrawer from '@/components/PropertiesDrawer'
import ClientsDrawer from '@/components/ClientsDrawer'
import { useAuth } from '@/components/Auth/AuthProvider'

// Clean SVG Icons
const Icons = {
  send: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>, // Arrow right
  menu: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  x: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  home: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  users: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  search: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
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
  { id: 'comercializar', label: 'Comercializar', icon: '📢' },
  { id: 'adquirir', label: 'Adquirir', icon: '🏠' },
  { id: 'incorporar', label: 'Incorporar', icon: '✍️' },
  { id: 'fondear', label: 'Fondear', icon: '💰' },
  { id: 'gestionar', label: 'Gestionar', icon: '📋' },
  { id: 'entregar', label: 'Entregar', icon: '🔑' },
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

  return (
    <div className="h-screen flex bg-slate-50 font-sans text-navy-900 overflow-hidden">
      
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-navy-900/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar - Clean White */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50 w-72 
        bg-white border-r border-navy-100 flex flex-col shadow-soft
        transform transition-transform duration-300 lg:transform-none
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-6 border-b border-navy-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-gold-400 to-gold-600 rounded-lg flex items-center justify-center text-white font-serif font-bold text-xl shadow-gold">
              M
            </div>
            <div>
              <div className="font-serif font-bold text-lg text-navy-900 tracking-tight">MANINOS</div>
              <div className="text-[10px] uppercase tracking-widest text-gold-600 font-semibold">Capital LLC</div>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-navy-400">
            {Icons.x}
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
          {/* Quick Access */}
          <div>
            <div className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-2 px-2">Acceso Rápido</div>
            <div className="space-y-1">
              <button onClick={() => { setPropertiesOpen(true); setSidebarOpen(false); }} className="sidebar-link w-full">
                <span className="text-gold-500">{Icons.home}</span>
                <span className="font-medium">Propiedades</span>
              </button>
              <button onClick={() => { setClientsOpen(true); setSidebarOpen(false); }} className="sidebar-link w-full">
                <span className="text-navy-500">{Icons.users}</span>
                <span className="font-medium">Clientes</span>
              </button>
            </div>
          </div>

          {/* Processes */}
          <div>
            <div className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-2 px-2">Gestión</div>
            <div className="space-y-1">
              {PROCESSES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setInput(`Ayúdame con el proceso ${p.label}`)
                    setSidebarOpen(false)
                    inputRef.current?.focus()
                  }}
                  className="sidebar-link w-full group"
                >
                  <span className="group-hover:scale-110 transition-transform">{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-navy-50 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-navy-100 flex items-center justify-center text-navy-700 font-bold border border-white shadow-sm">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-navy-900 truncate">{user?.email}</div>
              <div className="text-xs text-navy-500">Empleado</div>
            </div>
            <button onClick={signOut} className="text-navy-400 hover:text-red-500 transition-colors p-2">
              {Icons.logout}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative z-0">
        
        {/* Header */}
        <header className="h-16 bg-white border-b border-navy-50 flex items-center px-6 justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-navy-500">
              {Icons.menu}
            </button>
            <div className="flex items-center gap-2 text-navy-900 font-serif font-medium">
              <span className="text-gold-500">{Icons.sparkles}</span>
              Asistente Inteligente
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-medium text-navy-500">Sistema Online</span>
          </div>
        </header>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-50">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto animate-fade-in">
              
              <div className="mb-8 p-6 bg-white rounded-2xl shadow-soft border border-navy-50 text-center">
                <div className="w-16 h-16 bg-navy-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">👋</span>
                </div>
                <h2 className="text-3xl font-serif font-bold text-navy-900 mb-2">Bienvenido a Maninos AI</h2>
                <p className="text-navy-500">Tu copiloto experto para la gestión inmobiliaria.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {[
                  { title: "Buscar Propiedad", desc: "Encuentra casas por precio o ubicación", icon: Icons.search, prompt: "Busca casas en Houston..." },
                  { title: "Registrar Cliente", desc: "Inicia el proceso de onboarding", icon: Icons.users, prompt: "Quiero registrar un cliente nuevo..." },
                ].map((action, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(action.prompt); inputRef.current?.focus(); }}
                    className="card-luxury p-5 text-left group hover:border-gold-300"
                  >
                    <div className="w-10 h-10 bg-navy-50 rounded-lg flex items-center justify-center mb-3 text-navy-600 group-hover:bg-gold-50 group-hover:text-gold-600 transition-colors">
                      {action.icon}
                    </div>
                    <h3 className="font-bold text-navy-900 mb-1">{action.title}</h3>
                    <p className="text-sm text-navy-500">{action.desc}</p>
                  </button>
                ))}
              </div>

            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 pb-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-slide-up`}>
                  
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
                    msg.role === 'user' ? 'bg-navy-900 text-white' : 'bg-white border border-navy-100 text-gold-600'
                  }`}>
                    {msg.role === 'user' ? 'U' : 'AI'}
                  </div>

                  {/* Message */}
                  <div className={`max-w-[80%] space-y-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                    {msg.role === 'assistant' && msg.agent && (
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-navy-50 text-navy-600 border border-navy-100 mb-1">
                        {msg.agent.replace('Agent', '')}
                      </span>
                    )}
                    <div className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}>
                      <p className="whitespace-pre-wrap leading-relaxed text-sm">{msg.content}</p>
                    </div>
                    <div className="text-[10px] text-navy-400 px-1">
                      {msg.timestamp && new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>

                </div>
              ))}
              
              {loading && (
                <div className="flex gap-4 animate-fade-in">
                  <div className="w-10 h-10 rounded-full bg-white border border-navy-100 flex items-center justify-center text-gold-600 shadow-sm">AI</div>
                  <div className="bg-white border border-navy-100 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm flex gap-1">
                    <span className="w-2 h-2 bg-navy-300 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-navy-300 rounded-full animate-bounce delay-75"></span>
                    <span className="w-2 h-2 bg-navy-300 rounded-full animate-bounce delay-150"></span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-white border-t border-navy-50">
          <div className="max-w-3xl mx-auto flex gap-3 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu mensaje..."
              disabled={loading}
              className="input-luxury pr-14"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="absolute right-2 top-2 btn-gold !p-2 !rounded-md !h-auto shadow-none"
            >
              {Icons.send}
            </button>
          </div>
          <div className="text-center mt-2 text-[10px] text-navy-400 uppercase tracking-widest">
            Maninos AI v4.0 • Luxury Edition
          </div>
        </div>

      </main>

      {/* Drawers */}
      <PropertiesDrawer 
        isOpen={propertiesOpen} 
        onClose={() => setPropertiesOpen(false)}
        onSelectProperty={(p) => {
          setPropertiesOpen(false)
          setInput(`Info propiedad: ${p.address}`)
          inputRef.current?.focus()
        }}
      />
      <ClientsDrawer 
        isOpen={clientsOpen} 
        onClose={() => setClientsOpen(false)}
        onSelectClient={(c) => {
          setClientsOpen(false)
          setInput(`Info cliente: ${c.full_name}`)
          inputRef.current?.focus()
        }}
      />
    </div>
  )
}
