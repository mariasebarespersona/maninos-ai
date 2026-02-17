'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  MessageCircle, X, Send, Mic, MicOff,
  Loader2, ArrowUp, Info, Sparkles, ChevronDown,
} from 'lucide-react'

// ─── Types ───
interface Message {
  role: 'user' | 'assistant'
  content: string
  data?: any
  timestamp: Date
}

// ─── Quick Actions ───
const QUICK_ACTIONS = [
  { label: '🏠 Propiedades', query: '¿Cuántas casas tenemos?' },
  { label: '💰 Ventas del mes', query: '¿Cuánto vendimos este mes?' },
  { label: '👥 Clientes RTO', query: '¿Cuántos clientes tenemos en RTO?' },
  { label: '⚠️ Pagos vencidos', query: '¿Hay pagos vencidos?' },
  { label: '💵 Comisiones', query: '¿Cuánto hay en comisiones este mes?' },
  { label: '🔧 Renovaciones', query: '¿Cuántas renovaciones hay activas?' },
]

export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '¡Hola! 👋 Soy el asistente de Maninos AI.\n\nTengo acceso a **toda** la información de Homes y Capital. Pregúntame lo que necesites:',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(true)
  const [micAvailable, setMicAvailable] = useState(true)
  const [micError, setMicError] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Check mic availability
  useEffect(() => {
    const isSecure = typeof window !== 'undefined' && (
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    )
    if (!isSecure) setMicAvailable(false)
    else if (typeof navigator !== 'undefined' && !navigator.mediaDevices?.getUserMedia) {
      setMicAvailable(false)
    }
  }, [])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200)
      setUnreadCount(0)
    }
  }, [isOpen])

  // Send message
  const sendMessage = useCallback(async (text?: string) => {
    const query = text || input.trim()
    if (!query || isLoading) return

    const userMsg: Message = { role: 'user', content: query, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)
    setShowQuickActions(false)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, context: 'all' }),
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.answer,
        data: data.data,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
      if (!isOpen) setUnreadCount(prev => prev + 1)
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `❌ Error: ${err.message}`, timestamp: new Date() },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, isOpen])

  // Voice recording
  const startRecording = useCallback(async () => {
    if (!micAvailable) {
      setMicError('🔒 El micrófono requiere HTTPS.')
      setTimeout(() => setMicError(null), 5000)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach(t => t.stop())

        setIsLoading(true)
        setShowQuickActions(false)
        try {
          const formData = new FormData()
          formData.append('audio', blob, 'recording.webm')

          const res = await fetch('/api/ai/voice', {
            method: 'POST',
            body: formData,
          })
          if (!res.ok) throw new Error(`Error ${res.status}`)
          const data = await res.json()

          setMessages(prev => [
            ...prev,
            { role: 'user', content: `🎤 ${data.transcription}`, timestamp: new Date() },
            { role: 'assistant', content: data.answer, data: data.data, timestamp: new Date() },
          ])
        } catch (err: any) {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: `❌ Error de voz: ${err.message}`, timestamp: new Date() },
          ])
        } finally {
          setIsLoading(false)
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? '🔒 Permiso de micrófono denegado.'
        : '🔒 No se pudo acceder al micrófono.'
      setMicError(msg)
      setTimeout(() => setMicError(null), 5000)
    }
  }, [micAvailable])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }, [])

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: '¡Hola! 👋 Soy el asistente de Maninos AI.\n\nPregúntame lo que necesites:',
      timestamp: new Date(),
    }])
    setShowQuickActions(true)
  }

  // ─── Render ───
  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          fixed z-[9999] shadow-lg transition-all duration-300 ease-in-out
          flex items-center justify-center
          ${isOpen
            ? 'bottom-[calc(min(80vh,600px)+1rem)] right-4 sm:right-6 w-10 h-10 rounded-full bg-white border border-stone hover:bg-cream'
            : 'bottom-4 right-4 sm:bottom-6 sm:right-6 w-14 h-14 sm:w-16 sm:h-16 rounded-full'
          }
        `}
        style={!isOpen ? {
          background: 'linear-gradient(135deg, var(--navy-800), var(--navy-900))',
          boxShadow: '0 4px 20px rgba(30, 37, 50, 0.4)',
        } : {}}
        aria-label={isOpen ? 'Cerrar chat' : 'Abrir chat IA'}
      >
        {isOpen ? (
          <X className="w-5 h-5" style={{ color: 'var(--slate)' }} />
        ) : (
          <>
            <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div
          className="fixed z-[9998] bottom-4 right-4 sm:bottom-6 sm:right-6 
                     w-[calc(100vw-2rem)] sm:w-[420px] 
                     rounded-2xl overflow-hidden
                     animate-scale-in"
          style={{
            height: 'min(80vh, 600px)',
            background: 'white',
            border: '1px solid var(--sand)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b"
               style={{ borderColor: 'var(--sand)', background: 'var(--navy-900)' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                   style={{ background: 'linear-gradient(135deg, var(--gold-500), var(--gold-600))' }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white" style={{ fontFamily: 'inherit' }}>Maninos AI</h3>
                <p className="text-[10px] text-gray-400">Asistente con datos en tiempo real</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Limpiar chat"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors sm:hidden"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
               style={{ height: 'calc(100% - 56px - 60px)', background: 'var(--ivory)' }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'text-white rounded-br-md'
                      : 'bg-white rounded-bl-md border'
                  }`}
                  style={msg.role === 'user'
                    ? { background: 'var(--navy-800)' }
                    : { borderColor: 'var(--sand)', color: 'var(--charcoal)' }
                  }
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.data && (
                    <details className="mt-2 text-xs opacity-60">
                      <summary className="cursor-pointer select-none">📊 Ver datos</summary>
                      <pre className="mt-1 overflow-x-auto text-[10px] max-h-32" style={{ color: 'var(--ash)' }}>
                        {JSON.stringify(msg.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl px-4 py-3 rounded-bl-md border" style={{ borderColor: 'var(--sand)' }}>
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--gold-600)' }} />
                    <span className="text-xs" style={{ color: 'var(--ash)' }}>Consultando datos...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            {showQuickActions && messages.length <= 1 && (
              <div className="pt-1">
                <p className="text-[11px] mb-2 px-1" style={{ color: 'var(--ash)' }}>Prueba preguntar:</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ACTIONS.map((action, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(action.query)}
                      className="bg-white border text-sm px-3 py-1.5 rounded-full hover:shadow-sm transition-all"
                      style={{ borderColor: 'var(--sand)', color: 'var(--charcoal)', fontSize: '11px' }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className="px-3 py-2.5 border-t" style={{ borderColor: 'var(--sand)', background: 'white' }}>
            {/* Mic error */}
            {micError && (
              <div className="mb-2 rounded-lg px-3 py-2 flex items-start gap-2"
                   style={{ background: 'var(--warning-light)', border: `1px solid var(--gold-300)` }}>
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--warning)' }} />
                <p className="text-[10px] flex-1" style={{ color: 'var(--warning)' }}>{micError}</p>
                <button onClick={() => setMicError(null)} style={{ color: 'var(--ash)' }}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {isRecording && (
              <p className="text-center text-[11px] text-red-500 mb-1.5 animate-pulse">
                🎙️ Grabando... Toca para terminar
              </p>
            )}

            <div className="flex items-center gap-2">
              {/* Voice button */}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isLoading}
                className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  isRecording
                    ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/30'
                    : !micAvailable
                      ? 'opacity-30 cursor-not-allowed'
                      : 'hover:bg-sand/50'
                }`}
                style={!isRecording ? { background: 'var(--cream)', border: `1px solid var(--sand)` } : {}}
                title={!micAvailable ? 'Requiere HTTPS' : isRecording ? 'Parar grabación' : 'Grabar voz'}
              >
                {isRecording ? (
                  <MicOff className="w-4 h-4 text-white" />
                ) : (
                  <Mic className={`w-4 h-4 ${!micAvailable ? 'text-gray-400' : ''}`} style={micAvailable ? { color: 'var(--slate)' } : {}} />
                )}
              </button>

              {/* Text input */}
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Pregunta sobre casas, clientes, pagos..."
                  disabled={isLoading || isRecording}
                  className="w-full rounded-full pl-4 pr-10 py-2.5 text-sm border focus:outline-none transition-colors"
                  style={{
                    borderColor: 'var(--sand)',
                    color: 'var(--charcoal)',
                    background: 'var(--cream)',
                  }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-20 transition-all"
                  style={{ background: 'var(--navy-800)' }}
                >
                  <ArrowUp className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

