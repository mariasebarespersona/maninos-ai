'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AcquisitionStepper } from '@/components/AcquisitionStepper'
import { DealSidebar } from '@/components/DealSidebar'
import { InteractiveChecklist } from '@/components/InteractiveChecklist'
import { PropertiesDrawer } from '@/components/PropertiesDrawer'
import { ContractViewer } from '@/components/ContractViewer'
import { DocumentsCollector } from '@/components/DocumentsCollector'
import { MobileHomeProperty, ChatMessage } from '@/types/maninos'
import { Send, Paperclip, Mic, Bot, User, Menu, CheckSquare, FileText, AlertCircle, Search, PenTool, Zap, MicOff } from 'lucide-react'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'

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
      // Robust detection based on keywords
      const contentLower = content.toLowerCase();
      
      // FAIL indicators
      const hasFail = contentLower.includes('no cumple') || 
                      contentLower.includes('excede el 70%') || 
                      contentLower.includes('excede el límite') ||
                      contentLower.includes('70% rule fail') ||
                      contentLower.includes('precio de venta excede') ||
                      contentLower.includes('supera el 70%') ||
                      contentLower.includes('no pasa');
      
      // PASS indicators
      const hasPass = (contentLower.includes('cumplió con la regla del 70%') ||
                       contentLower.includes('cumple con la regla del 70%') ||
                       contentLower.includes('está dentro del 70%') ||
                       contentLower.includes('dentro del 70% del valor') ||
                       contentLower.includes('70% rule: pass') ||
                       contentLower.includes('pasó la regla del 70%')) && !hasFail;
      
      const isPass = hasPass && !hasFail;
      
      return (
          <div>
              <div className={`mb-4 p-3 rounded-lg border-l-4 ${isPass ? 'bg-emerald-50 border-emerald-500' : 'bg-rose-50 border-rose-500'}`}>
                  <div className="flex items-start">
                      <div className={`mt-0.5 mr-3 ${isPass ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isPass ? <CheckSquare size={18} /> : <AlertCircle size={18} />}
                      </div>
                      <div>
                          <h4 className={`font-bold text-sm ${isPass ? 'text-emerald-800' : 'text-rose-800'}`}>
                              {isPass ? '70% Rule Passed' : '70% Rule Failed'}
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

  // Voice Recording State
  const { 
    isRecording, 
    isProcessing, 
    audioBlob, 
    error: voiceError, 
    recordingTime,
    startRecording, 
    stopRecording, 
    cancelRecording,
    clearAudio 
  } = useVoiceRecorder();

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
  }, [input, propertyId, fetchProperty, sessionId, fetchPropertiesList])

  // Voice Handler - Send audio to backend for transcription
  const handleVoiceSubmit = useCallback(async (blob: Blob) => {
    // Add placeholder message immediately for instant feedback
    const placeholderId = crypto.randomUUID();
    const placeholderMsg: ChatMessage = {
      id: placeholderId,
      role: 'user',
      content: '🎤 Transcribiendo...'
    };
    setMessages(prev => [...prev, placeholderMsg]);
    setUploading(true);
    
    try {
      const form = new FormData();
      form.append('audio', blob, 'recording.webm');
      form.append('session_id', sessionId);
      form.append('property_id', propertyId || '');
      form.append('text', ''); // Empty text for voice-only
      
      const resp = await fetch('/api/chat', { method: 'POST', body: form });
      const data = await resp.json();
      
      // Replace placeholder with actual transcribed text
      if (data.transcript) {
        setMessages(prev => prev.map(msg => 
          msg.id === placeholderId 
            ? { ...msg, content: data.transcript }
            : msg
        ));
      } else {
        // Remove placeholder if no transcript
        setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
      }
      
      // Update Property Context
      if (data.property_id) {
        if (data.property_id !== propertyId) setPropertyId(data.property_id);
        fetchProperty(data.property_id);
      } else if (data.property_id === null && propertyId) {
        // Property was deleted
        setPropertyId(null);
        setProperty(null);
        fetchPropertiesList();
        if (typeof window !== 'undefined') {
          localStorage.removeItem('maninos_property_id');
          localStorage.removeItem('maninos_session_id');
        }
      }
      
      // Add agent response
      const aiMsg: ChatMessage = { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: String(data?.answer || 'No response') 
      };
      setMessages(prev => [...prev, aiMsg]);
      
      // Clear audio blob after successful send
      clearAudio();
      
    } catch (err) {
      console.error('Voice submission error:', err);
      // Remove placeholder on error
      setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: 'Error procesando el audio. Por favor, intenta de nuevo o escribe tu mensaje.' 
      }]);
      clearAudio();
    } finally {
      setUploading(false);
    }
  }, [sessionId, propertyId, fetchProperty, fetchPropertiesList, clearAudio]);

  // Auto-submit when recording stops
  useEffect(() => {
    if (audioBlob && !isRecording) {
      handleVoiceSubmit(audioBlob);
    }
  }, [audioBlob, isRecording, handleVoiceSubmit]);

  // Handler for sending email requests from DealSidebar
  const handleSendEmailRequest = useCallback((data: {
    type: 'document';
    documentId: string;
    documentName: string;
    documentType: string;
    propertyId: string;
    propertyName: string;
  }) => {
    // Construct a natural language message for the agent
    const message = `Quiero enviar el documento "${data.documentName}" por email.`;
    
    // Set the message in input and trigger send
    setInput(message);
    
    // Auto-send after a brief delay to let the UI update
    setTimeout(() => {
      if (message.trim()) {
        const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: message };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setUploading(true);

        const sendEmail = async () => {
          try {
            const form = new FormData();
            form.append('text', message);
            form.append('session_id', sessionId);
            form.append('property_id', data.propertyId);

            const resp = await fetch('/api/chat', { method: 'POST', body: form });
            const respData = await resp.json();

            const aiMsg: ChatMessage = { 
              id: crypto.randomUUID(), 
              role: 'assistant', 
              content: String(respData?.answer || 'No response') 
            };
            setMessages(prev => [...prev, aiMsg]);
          } catch (e) {
            setMessages(prev => [...prev, { 
              id: crypto.randomUUID(), 
              role: 'assistant', 
              content: 'Error al procesar tu solicitud de email.' 
            }]);
          } finally {
            setUploading(false);
          }
        };

        sendEmail();
      }
    }, 100);
  }, [sessionId]);

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
          onPropertyDeleted={fetchPropertiesList}
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
            <div className="h-full flex flex-col items-center justify-center p-8 animate-fade-in">
                {/* Hero Icon */}
                <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-slate-200">
                    <Bot size={40} className="text-slate-600" />
                </div>
                
                {/* Welcome Text */}
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Welcome to Maninos AI</h3>
                <p className="text-slate-500 max-w-md text-center mb-10 leading-relaxed">
                    Your expert assistant for mobile home acquisitions. Start by entering a property address or uploading documents.
                </p>

                {/* Feature Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl w-full">
                    {/* Card 1: Doc Analysis - Blue Theme (Brand) */}
                    <div className="p-4 bg-white border border-blue-200 rounded-xl shadow-sm transition-all cursor-default group">
                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-3">
                            <FileText size={20} className="text-blue-700" />
                        </div>
                        <h4 className="font-semibold text-slate-800 mb-1">Doc Analysis</h4>
                        <p className="text-xs text-slate-500">Extracts data from PDFs and listings instantly.</p>
                    </div>

                    {/* Card 2: Inspection - Slate/Navy Theme (Professional) */}
                    <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm transition-all cursor-default group">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mb-3">
                            <Search size={20} className="text-slate-700" />
                        </div>
                        <h4 className="font-semibold text-slate-800 mb-1">Inspection</h4>
                        <p className="text-xs text-slate-500">Evaluates repairs and estimates renovation costs.</p>
                    </div>

                    {/* Card 3: Contracts - Indigo/Dark Blue Theme (Trust) */}
                    <div className="p-4 bg-white border border-indigo-200 rounded-xl shadow-sm transition-all cursor-default group">
                        <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center mb-3">
                            <PenTool size={20} className="text-indigo-700" />
                        </div>
                        <h4 className="font-semibold text-slate-800 mb-1">Contracts</h4>
                        <p className="text-xs text-slate-500">Generates purchase agreements ready to sign.</p>
                    </div>
                </div>
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
            {/* Recording Indicator */}
            {isRecording && (
              <div className="max-w-4xl mx-auto mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between animate-in slide-in-from-bottom duration-200">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    <div className="absolute inset-0 w-3 h-3 bg-red-500 rounded-full animate-ping" />
                  </div>
                  <span className="text-sm font-medium text-red-900">Grabando...</span>
                  <span className="text-sm text-red-700 font-mono">{recordingTime}s</span>
                </div>
                <button
                  onClick={cancelRecording}
                  className="text-red-700 hover:text-red-900 text-xs font-medium px-3 py-1 hover:bg-red-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* Voice Error Message */}
            {voiceError && (
              <div className="max-w-4xl mx-auto mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 flex items-center gap-2 animate-in slide-in-from-bottom duration-200">
                <AlertCircle size={16} className="text-amber-600" />
                <span className="text-xs text-amber-900">{voiceError}</span>
              </div>
            )}

            <div className="max-w-4xl mx-auto relative flex items-center gap-3">
                <div className="flex-1 relative">
                    <input
                        ref={inputRef}
                        type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onSend()}
                        placeholder={isRecording ? "Grabando..." : "Type a message..."}
                        className="w-full pl-4 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                        disabled={uploading || isRecording}
                    />
                    <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1">
                        <Paperclip size={18} />
                    </button>
                </div>
              
              {/* Mic Button - ChatGPT Style */}
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={uploading || isProcessing}
                className={`p-3.5 rounded-xl transition-all shadow-md ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30 animate-pulse' 
                    : uploading || isProcessing
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-slate-700 hover:bg-slate-800 text-white shadow-slate-700/20'
                }`}
                title={isRecording ? "Detener grabación" : "Grabar mensaje de voz"}
              >
                {isProcessing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : isRecording ? (
                  <MicOff size={18} className="text-white" />
                ) : (
                  <Mic size={18} />
                )}
              </button>

              <button
                onClick={onSend}
                    disabled={!input.trim() || uploading || isRecording}
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
      <DealSidebar 
        property={property} 
        className="hidden lg:flex" 
        onSendEmailRequest={handleSendEmailRequest}
      />

    </div>
  )
}