'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AcquisitionStepper } from '@/components/AcquisitionStepper'
import { DealSidebar } from '@/components/DealSidebar'
import { InteractiveChecklist } from '@/components/InteractiveChecklist'
import { PropertiesDrawer } from '@/components/PropertiesDrawer'
import { ContractViewer } from '@/components/ContractViewer'
import { DocumentsCollector } from '@/components/DocumentsCollector'
import { MobileHomeProperty, ChatMessage } from '@/types/maninos'
import { Send, Paperclip, Mic, Bot, User, Menu, CheckSquare, FileText, AlertCircle } from 'lucide-react'

// --- Rich UI Components ---

function RichMessageRenderer({ content, propertyId, property, onPropertyUpdate }: { content: string, propertyId: string | null, property: MobileHomeProperty | null, onPropertyUpdate?: () => void }) {
  // 1. Detect Checklist - ONLY show when agent EXPLICITLY asks user to complete checklist
  // CRITICAL: Must be VERY specific to avoid showing checklist when agent just mentions "inspection" casually
  const contentLower = content.toLowerCase();
  const isChecklistMessage = (
    // ONLY trigger if agent explicitly asks to use/complete the checklist
    // This prevents showing checklist when agent just mentions "inspection" in status or casual conversation
    (content.includes('📋') && (contentLower.includes('marca') || contentLower.includes('usa') || contentLower.includes('completa'))) ||
    (contentLower.includes('checklist') && (
      contentLower.includes('usa el') || 
      contentLower.includes('usa la') ||
      contentLower.includes('completa') || 
      contentLower.includes('rellena') ||
      contentLower.includes('marca los defectos') ||
      contentLower.includes('selecciona los defectos')
    ))
  );
  
  if (isChecklistMessage) {
    if (propertyId) {
        // Show agent's message/summary FIRST, then the InteractiveChecklist below
        // This allows the agent to provide context and summary before showing the interactive UI
        return (
          <div className="space-y-4">
            {/* Agent's message/summary */}
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap">{content}</div>
            </div>
            {/* Interactive Checklist */}
            <InteractiveChecklist propertyId={propertyId} onUpdate={onPropertyUpdate} />
          </div>
        );
    }
    
    // Fallback if no propertyId (shouldn't happen in normal flow)
    return (
        <div className="p-4 bg-amber-50 border-l-4 border-amber-400 rounded">
            <p className="text-sm text-amber-800">
                ⚠️ No hay propiedad activa. Por favor, crea una propiedad primero.
            </p>
        </div>
    );
  }

  // 2. Detect Contract/Document - Use ContractViewer component
  if ((content.includes('📄') || content.includes('PURCHASE AGREEMENT') || content.includes('CONTRACT')) && 
      (content.includes('Contrato') || content.includes('Contract') || content.includes('BUYER') || content.includes('SELLER'))) {
      
      // Try to parse financial data from property state (more reliable than parsing text)
      const purchasePrice = property?.asking_price || 0;
      const repairEstimate = property?.repair_estimate || 0;
      const totalInvestment = purchasePrice + repairEstimate;
      const arv = property?.arv || 0;
      const projectedProfit = arv > 0 ? arv - totalInvestment : 0;
      const roi = totalInvestment > 0 ? (projectedProfit / totalInvestment) * 100 : 0;
      
      // Extract contract text (everything after header markers)
      let contractText = content;
      const startMarkers = ['═════════', '---', 'PURCHASE AGREEMENT', 'CONTRACT'];
      for (const marker of startMarkers) {
          const idx = content.indexOf(marker);
          if (idx !== -1) {
              contractText = content.substring(idx);
              break;
          }
      }
      
      // If we have valid property and financial data, render ContractViewer
      if (property && purchasePrice > 0) {
          return (
              <ContractViewer
                  contractText={contractText}
                  propertyName={property.name || 'Property'}
                  purchasePrice={purchasePrice}
                  totalInvestment={totalInvestment}
                  projectedProfit={projectedProfit}
                  roi={roi}
              />
          );
      }
      
      // Fallback: show as text if property data is missing
      return <div className="whitespace-pre-wrap">{content}</div>;
  }

  // 3. Detect 70% Rule Pass/Fail
  if (content.includes('Regla del 70%') || content.includes('70% Rule')) {
      const isPass = content.includes('✅') || content.includes('PASS');
      return (
          <div>
              <div className={`mb-4 p-3 rounded-lg border-l-4 ${isPass ? 'bg-emerald-50 border-emerald-500' : 'bg-rose-50 border-rose-500'}`}>
                  <div className="flex items-start">
                      <div className={`mt-0.5 mr-3 ${isPass ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isPass ? <CheckSquare size={18} /> : <AlertCircle size={18} />}
                      </div>
                      <div>
                          <h4 className={`font-bold text-sm ${isPass ? 'text-emerald-800' : 'text-rose-800'}`}>
                              {isPass ? '70% Rule Passed' : '70% Rule Warning'}
                          </h4>
                          <p className="text-xs opacity-80 mt-1">
                              {isPass ? 'Price is within safe margin.' : 'Price exceeds recommended offer.'}
                          </p>
                      </div>
                  </div>
              </div>
              <div className="whitespace-pre-wrap">{content}</div>
          </div>
      )
  }

  // Default Markdown
  return <div className="whitespace-pre-wrap">{content}</div>
}

export default function ChatPage() {
  // --- State ---
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [uploading, setUploading] = useState(false)
  
  // Property State - Persist across page refresh
  const [propertyId, setPropertyId] = useState<string | null>(() => {
      if (typeof window !== 'undefined') {
          return localStorage.getItem('maninos_property_id')
      }
      return null
  })
  const [property, setProperty] = useState<MobileHomeProperty | null>(null)
  
  // Session Management - Each property gets its own session for memory isolation
  // Persist sessionId in localStorage to survive page refresh
  const [sessionId, setSessionId] = useState(() => {
      if (typeof window !== 'undefined') {
          return localStorage.getItem('maninos_session_id') || 'web-ui'
      }
      return 'web-ui'
  })
  
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true) // Mobile toggle
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [propertiesList, setPropertiesList] = useState<MobileHomeProperty[]>([])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // --- Configuration ---
  const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'

  // --- Data Fetching ---
  const fetchPropertiesList = useCallback(async () => {
      try {
          const res = await fetch(`${BACKEND_URL}/api/properties`)
          const json = await res.json()
          if (json.ok) setPropertiesList(json.properties)
    } catch (e) {
          console.error('Failed to fetch properties list', e)
      }
  }, [BACKEND_URL])

  const fetchProperty = useCallback(async (pid: string) => {
    if (!pid) return
    try {
      const res = await fetch(`${BACKEND_URL}/api/property/${pid}`)
      const data = await res.json()
      if (data.ok && data.property) {
        setProperty(data.property)
        console.log('[Property] Sync:', data.property)
      }
          } catch (e) {
      console.error('[Property] Fetch Error:', e)
    }
  }, [BACKEND_URL])

  // Persist sessionId and propertyId to localStorage
  useEffect(() => {
      if (typeof window !== 'undefined') {
          localStorage.setItem('maninos_session_id', sessionId)
      }
  }, [sessionId])

  useEffect(() => {
      if (typeof window !== 'undefined') {
          if (propertyId) {
              localStorage.setItem('maninos_property_id', propertyId)
    } else {
              localStorage.removeItem('maninos_property_id')
          }
      }
  }, [propertyId])

  // Initial Sync - Load properties list and sync session
  useEffect(() => {
    fetchPropertiesList()
    
    // If we have a persisted propertyId, load its data
    if (propertyId) {
        fetchProperty(propertyId)
    }
    
    const sync = async () => {
      try {
      const form = new FormData()
        form.append('text', '') 
        form.append('session_id', sessionId)
        if (propertyId) form.append('property_id', propertyId)
        const resp = await fetch('/api/chat', { method: 'POST', body: form })
        const data = await resp.json()
        
        if (data.property_id && data.property_id !== propertyId) {
          setPropertyId(data.property_id)
          fetchProperty(data.property_id)
      }
    } catch (e) {
        console.error('Sync failed', e)
      }
    }
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // NOTE: sessionId intentionally omitted from deps - we only want this to run on mount
  }, [fetchProperty, fetchPropertiesList])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages.length])

  // --- Handlers ---
  const onSend = useCallback(async () => {
    if (!input.trim()) return

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setUploading(true)

    try {
      const form = new FormData()
      form.append('text', userMsg.content)
      form.append('session_id', sessionId)
      if (propertyId) form.append('property_id', propertyId)

      const resp = await fetch('/api/chat', { method: 'POST', body: form })
      const data = await resp.json()

      // Update Property Context
        if (data.property_id) {
        if (data.property_id !== propertyId) setPropertyId(data.property_id)
        fetchProperty(data.property_id)
      } else if (data.property_id === null && propertyId) {
        // Property was deleted - clear state and refresh list
        setPropertyId(null)
        setProperty(null)
        fetchPropertiesList() // Refresh the properties list
        // Clear localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('maninos_property_id')
          localStorage.removeItem('maninos_session_id')
        }
      }

      const aiMsg: ChatMessage = { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: String(data?.answer || 'No response') 
      }
      setMessages(prev => [...prev, aiMsg])

    } catch (e) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Error communicating with agent.' }])
    } finally {
      setUploading(false)
    }
  }, [input, propertyId, fetchProperty, sessionId])

  // --- Property Switching Handlers ---
  const handleSwitchProperty = async (newPropertyId: string) => {
      // Each property gets its own session ID for isolated memory/context
      const newSessionId = `web-ui-${newPropertyId}`
      setSessionId(newSessionId)
      setPropertyId(newPropertyId)
      setMessages([]) // Clear UI messages - new conversation view
      await fetchProperty(newPropertyId)
      // Note: LangGraph will load the conversation history for this session automatically
  }

  const handleNewEvaluation = () => {
      // Generate a unique session for brand new evaluation
      const newSessionId = `web-ui-new-${crypto.randomUUID().slice(0, 8)}`
      setSessionId(newSessionId)
      setPropertyId(null)
      setProperty(null)
      
      // Clear localStorage to start fresh
      if (typeof window !== 'undefined') {
          localStorage.removeItem('maninos_property_id')
      }
      
      // Add a welcome message to guide the user
      const welcomeMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `👋 ¡Hola! Vamos a empezar una nueva evaluación de propiedad.

Para comenzar, dime:
• La dirección de la mobile home
• O el nombre de la propiedad

Por ejemplo: "Quiero evaluar una mobile home en 123 Main St, Sunny Park"`,
          timestamp: new Date().toISOString()
      }
      setMessages([welcomeMessage])
      setIsDrawerOpen(false)
      
      // Focus input after state updates
                            setTimeout(() => {
          inputRef.current?.focus()
      }, 100)
  }

  // --- Render ---
    return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      
      <PropertiesDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          properties={propertiesList}
          onSelectProperty={handleSwitchProperty}
          currentPropertyId={propertyId}
          onNewProperty={handleNewEvaluation}
      />

      {/* 1. LEFT SIDEBAR (Navigation) - Simplified for MVP */}
      <aside className="w-16 bg-slate-900 flex flex-col items-center py-6 gap-6 z-30 flex-shrink-0">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-900/50">
          M
                </div>
        <nav className="flex flex-col gap-4 w-full items-center">
            {/* Nav Items */}
                  <button
                onClick={() => {
                    fetchPropertiesList()
                    setIsDrawerOpen(true)
                }}
                className="p-3 rounded-xl bg-slate-800 text-white hover:bg-slate-700 transition-colors"
            >
                <Menu size={20} />
                  </button>
            <div className="w-8 h-[1px] bg-slate-800" />
            {/* Add more nav icons here if needed */}
        </nav>
      </aside>

      {/* 2. CENTER STAGE (Chat & Stepper) */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        
        {/* Stepper Header */}
        <div className="flex-shrink-0 bg-white shadow-sm z-20">
            {property && (
                <AcquisitionStepper 
                    currentStage={property.acquisition_stage || 'initial'} 
                    status={property.status || 'New'} 
                />
          )}
        </div>
        
        {/* Documents Collector (Paso 0) - Only show when in documents_pending stage */}
        {property && property.acquisition_stage === 'documents_pending' && propertyId && (
            <div className="flex-shrink-0 px-4 py-2 bg-slate-50">
                <DocumentsCollector 
                    propertyId={propertyId}
                    onComplete={() => {
                        // Refresh property to see stage update
                        fetchProperty(propertyId);
                    }}
                />
            </div>
        )}
        
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6" ref={scrollRef}>
            {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                    <Bot size={32} className="text-slate-500" />
                  </div>
                <h3 className="text-xl font-semibold text-slate-700">Maninos AI</h3>
                <p className="text-sm text-slate-500 max-w-xs mt-2">
                    Start by entering a property address to begin the evaluation process.
                    </p>
                  </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''} max-w-4xl mx-auto`}>
                
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-blue-600 text-white'
                }`}>
                    {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              
                {/* Bubble */}
                <div className={`flex flex-col max-w-[80%] ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`px-5 py-3.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                        m.role === 'user' 
                        ? 'bg-slate-900 text-white rounded-tr-sm' 
                        : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'
                    }`}>
                        {m.role === 'user' ? (
                            <div className="whitespace-pre-wrap">{m.content}</div>
                        ) : (
                            <RichMessageRenderer content={m.content} propertyId={propertyId} property={property} onPropertyUpdate={() => propertyId && fetchProperty(propertyId)} />
          )}
                </div>
              </div>
              
                  </div>
            ))
                  )}
          {uploading && (
             <div className="flex gap-4 max-w-4xl mx-auto">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center">
                    <Bot size={16} />
          </div>
                <div className="flex items-center space-x-2 bg-white px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-200 shadow-sm">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                </div>
              )}
            </div>
              
        {/* Input Area */}
        <div className="p-4 md:p-6 bg-white border-t border-slate-200">
            <div className="max-w-4xl mx-auto relative flex items-center gap-3">
                <div className="flex-1 relative">
                    <input
                        ref={inputRef}
                        type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onSend()}
                        placeholder="Type a message..."
                        className="w-full pl-4 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                        disabled={uploading}
                    />
                    <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1">
                        <Paperclip size={18} />
                    </button>
                </div>
              <button
                onClick={onSend}
                    disabled={!input.trim() || uploading}
                    className="p-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl transition-colors shadow-md shadow-blue-600/20"
              >
                    <Send size={18} />
              </button>
            </div>
            <div className="text-center mt-2">
                <p className="text-[10px] text-slate-400">Maninos AI can make mistakes. Verify important info.</p>
        </div>
      </div>
      </main>

      {/* 3. RIGHT SIDEBAR (Deal Context) */}
      <DealSidebar property={property} className="hidden lg:flex" />

    </div>
  )
}