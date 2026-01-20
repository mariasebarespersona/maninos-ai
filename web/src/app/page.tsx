'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Building2, Users, Briefcase, TrendingUp, FileText, Home } from 'lucide-react'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => `session-${Date.now()}`)
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
    { icon: Building2, label: 'Buscar propiedades', prompt: 'Busca propiedades en Houston, TX' },
    { icon: Users, label: 'Nuevo cliente', prompt: 'Quiero registrar un nuevo cliente' },
    { icon: FileText, label: 'Generar contrato', prompt: 'Necesito generar un contrato RTO' },
    { icon: TrendingUp, label: 'Calcular DTI', prompt: 'Calcula el DTI para un cliente' },
  ]

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900/50 border-r border-white/5 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-amber-500/20">
              M
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">MANINOS</h1>
              <p className="text-slate-500 text-xs">AI Platform</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-3">Procesos</p>
          <ul className="space-y-1">
            <li>
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-white bg-white/10 rounded-lg">
                <Home size={18} />
                <span className="text-sm">Dashboard</span>
              </a>
            </li>
            <li>
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <Building2 size={18} />
                <span className="text-sm">Adquirir</span>
              </a>
            </li>
            <li>
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <Users size={18} />
                <span className="text-sm">Incorporar</span>
              </a>
            </li>
            <li>
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <Briefcase size={18} />
                <span className="text-sm">Comercializar</span>
              </a>
            </li>
          </ul>
        </nav>

        {/* User */}
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white text-sm font-medium">
              U
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">Usuario</p>
              <p className="text-slate-500 text-xs truncate">Empleado</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b border-white/5 flex items-center px-6">
          <h2 className="text-white font-semibold">Asistente AI</h2>
          <span className="ml-3 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-full">
            Online
          </span>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-amber-500/20 mb-6">
                M
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">¡Bienvenido a Maninos AI!</h3>
              <p className="text-slate-400 text-center max-w-md mb-8">
                Tu asistente inteligente para la gestión de propiedades rent-to-own.
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
                    className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors text-left"
                  >
                    <action.icon size={20} className="text-amber-400" />
                    <span className="text-white text-sm">{action.label}</span>
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
                    <div className={`inline-block px-4 py-3 rounded-2xl ${
                      msg.role === 'user'
                        ? 'bg-amber-500 text-white rounded-tr-sm'
                        : 'bg-white/10 text-white rounded-tl-sm'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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
        <div className="p-6 border-t border-white/5">
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
          <p className="text-center text-slate-600 text-xs mt-3">
            Maninos AI puede cometer errores. Verifica la información importante.
          </p>
        </div>
      </main>
    </div>
  )
}
