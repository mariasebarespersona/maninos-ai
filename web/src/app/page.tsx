'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AcquisitionStepper } from '@/components/AcquisitionStepper'
import { DealSidebar } from '@/components/DealSidebar'
import { InteractiveChecklist } from '@/components/InteractiveChecklist'
import { PropertiesDrawer } from '@/components/PropertiesDrawer'
import { MobileHomeProperty, ChatMessage } from '@/types/maninos'
import { Send, Paperclip, Mic, Bot, User, Menu, CheckSquare, FileText, AlertCircle } from 'lucide-react'

// --- Rich UI Components ---

function RichMessageRenderer({ content, propertyId, onPropertyUpdate }: { content: string, propertyId: string | null, onPropertyUpdate?: () => void }) {
  // 1. Detect Checklist
  if (content.includes('📋') && (content.includes('Checklist') || content.includes('Inspección'))) {
    if (propertyId) {
        return <InteractiveChecklist propertyId={propertyId} onUpdate={onPropertyUpdate} />;
    }

    const lines = content.split('\n');
    return (
      <div className="space-y-3">
        {lines.map((line, i) => {
          if (line.trim().startsWith('- [ ]') || line.trim().startsWith('- [x]')) {
             const isChecked = line.includes('[x]');
             const text = line.replace(/- \[[x ]\]/, '').trim();
             return (
               <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 border border-slate-100">
                 <div className={`w-5 h-5 rounded border flex items-center justify-center ${isChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
                   {isChecked && <CheckSquare size={12} />}
                 </div>
                 <span className="text-sm text-slate-700 font-medium">{text}</span>
               </div>
             )
          }
          // Header or normal text
          return <p key={i} className="mb-1">{line}</p>
        })}
      </div>
    )
  }

  // 2. Detect Contract/Document
  if (content.includes('📄') && (content.includes('Contrato') || content.includes('Contract'))) {
      const handleDownload = () => {
          const blob = new Blob([content], { type: 'text/plain' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'Purchase_Agreement_Draft.txt';
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
      };

      return (
          <div>
              <div className="whitespace-pre-wrap mb-4">{content}</div>
              <div onClick={handleDownload} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-300 transition-colors group cursor-pointer">
                  <div className="w-12 h-12 bg-white rounded-lg border border-slate-200 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
                      <FileText size={24} className="text-rose-500" />
                  </div>
                  <div className="flex-1">
                      <h4 className="font-bold text-slate-800 text-sm">Purchase_Agreement_Draft.txt</h4>
                      <p className="text-xs text-slate-500">Ready for review</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDownload(); }} className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800">
                      Download
                  </button>
              </div>
          </div>
      )
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
  
  // Property State
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [property, setProperty] = useState<MobileHomeProperty | null>(null)
  
  // Session Management - Each property gets its own session for memory isolation
  const [sessionId, setSessionId] = useState('web-ui')
  
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true) // Mobile toggle
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [propertiesList, setPropertiesList] = useState<MobileHomeProperty[]>([])
  const scrollRef = useRef<HTMLDivElement | null>(null)

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

  // Initial Sync - Load properties list and sync session
  useEffect(() => {
    fetchPropertiesList()
    const sync = async () => {
      try {
        const form = new FormData()
        form.append('text', '') 
        form.append('session_id', sessionId)
        const resp = await fetch('/api/chat', { method: 'POST', body: form })
        const data = await resp.json()
        
        if (data.property_id) {
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
      setMessages([])
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
                            <RichMessageRenderer content={m.content} propertyId={propertyId} onPropertyUpdate={() => propertyId && fetchProperty(propertyId)} />
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