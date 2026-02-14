'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Mic, MicOff, Send, MessageCircle, Camera, 
  Bell, Loader2, ClipboardCheck, X, ChevronDown,
  CheckCircle, XCircle, AlertTriangle, HelpCircle, 
  ArrowUp, Trash2, Image as ImageIcon, Info,
  Plus, RotateCcw, ChevronRight, Eye, Wrench,
  ChevronUp, Save, Wand2, Sparkles, FileSpreadsheet,
  Edit3, Hash, StickyNote, FileText, Copy, Share2,
} from 'lucide-react';

// In production, ALL API calls go through Next.js proxy routes (same origin).
// This avoids CORS issues and works perfectly with the PWA.
// The Next.js API routes in /app/api/* proxy requests to the backend.
const API_URL = '';

type Tab = 'chat' | 'notifications' | 'evaluator' | 'renovation';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  data?: any;
  timestamp: Date;
}

// Quick action suggestions for the chat
const QUICK_ACTIONS = [
  { label: '🏠 Propiedades', query: '¿Cuántas casas tenemos?' },
  { label: '💰 Ventas del mes', query: '¿Cuánto vendimos este mes?' },
  { label: '👥 Clientes RTO', query: '¿Cuántos clientes tenemos en RTO?' },
  { label: '⚠️ Pagos vencidos', query: '¿Hay pagos vencidos?' },
  { label: '💵 Comisiones', query: '¿Cuánto hay en comisiones este mes?' },
  { label: '🔧 Renovaciones', query: '¿Cuántas renovaciones hay activas?' },
  { label: '👥 Equipo', query: '¿Quiénes son los miembros del equipo?' },
  { label: '🏗️ Yards', query: '¿Cuántos yards tenemos?' },
];

export default function MobilePage() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  return (
    <div className="flex flex-col h-[100dvh] bg-[#0a0f1a] text-white">
      {/* Top Header */}
      <header className="flex-shrink-0 flex items-center justify-center px-4 pt-3 pb-2 bg-[#0d1424] border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center">
            <span className="text-xs font-bold text-black">M</span>
          </div>
          <h1 className="text-base font-bold bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
            Maninos AI
          </h1>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'notifications' && <NotificationsPanel />}
        {activeTab === 'evaluator' && <EvaluatorPanel />}
        {activeTab === 'renovation' && <RenovationPanel />}
      </div>

      {/* Bottom Navigation */}
      <nav className="flex-shrink-0 flex bg-[#0d1424] border-t border-white/5 safe-area-bottom">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-all ${
            activeTab === 'chat'
              ? 'text-amber-400'
              : 'text-gray-500 active:text-gray-300'
          }`}
        >
          <MessageCircle className={`w-5 h-5 ${activeTab === 'chat' ? 'fill-amber-400/20' : ''}`} />
          <span className="text-[10px] font-medium">Chat</span>
          {activeTab === 'chat' && <div className="absolute top-0 w-12 h-0.5 bg-amber-400 rounded-b" />}
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-all relative ${
            activeTab === 'notifications'
              ? 'text-amber-400'
              : 'text-gray-500 active:text-gray-300'
          }`}
        >
          <Bell className={`w-5 h-5 ${activeTab === 'notifications' ? 'fill-amber-400/20' : ''}`} />
          <span className="text-[10px] font-medium">Alertas</span>
          {/* Coming soon dot */}
          <div className="absolute top-2 right-1/2 translate-x-4 w-1.5 h-1.5 bg-amber-500 rounded-full" />
        </button>
        <button
          onClick={() => setActiveTab('evaluator')}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-all ${
            activeTab === 'evaluator'
              ? 'text-amber-400'
              : 'text-gray-500 active:text-gray-300'
          }`}
        >
          <ClipboardCheck className={`w-5 h-5 ${activeTab === 'evaluator' ? 'fill-amber-400/20' : ''}`} />
          <span className="text-[10px] font-medium">Evaluar</span>
        </button>
        <button
          onClick={() => setActiveTab('renovation')}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-all ${
            activeTab === 'renovation'
              ? 'text-amber-400'
              : 'text-gray-500 active:text-gray-300'
          }`}
        >
          <Wrench className={`w-5 h-5 ${activeTab === 'renovation' ? 'fill-amber-400/20' : ''}`} />
          <span className="text-[10px] font-medium">Renovar</span>
        </button>
      </nav>
    </div>
  );
}


// ============================================================================
// CHAT PANEL — General AI Assistant with full DB access
// ============================================================================
function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '¡Hola! 👋 Soy el asistente de Maninos AI.\n\nTengo acceso a **toda** la información de Homes y Capital. Pregúntame lo que necesites:',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [micAvailable, setMicAvailable] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if microphone is available (requires HTTPS or localhost)
  useEffect(() => {
    const isSecure = typeof window !== 'undefined' && (
      window.location.protocol === 'https:' || 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1'
    );
    if (!isSecure) {
      setMicAvailable(false);
    } else if (typeof navigator !== 'undefined' && !navigator.mediaDevices?.getUserMedia) {
      setMicAvailable(false);
    }
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const sendMessage = useCallback(async (text?: string) => {
    const query = text || input.trim();
    if (!query || isLoading) return;

    const userMsg: Message = { role: 'user', content: query, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setShowQuickActions(false);

    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, context: 'all' }),
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer, data: data.data, timestamp: new Date() },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `❌ Error: ${err.message}. ¿Está el servidor encendido?`, timestamp: new Date() },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading]);

  // Voice recording
  const startRecording = useCallback(async () => {
    if (!micAvailable) {
      setMicError('🔒 El micrófono requiere HTTPS. Usa el texto por ahora, o en Chrome ve a chrome://flags → "Insecure origins treated as secure" → añade http://192.168.68.140:3000');
      setTimeout(() => setMicError(null), 8000);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());

        setIsLoading(true);
        setShowQuickActions(false);
        try {
          const formData = new FormData();
          formData.append('audio', blob, 'recording.webm');

          const res = await fetch(`${API_URL}/api/ai/voice`, {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) throw new Error(`Error ${res.status}`);
          const data = await res.json();

          setMessages((prev) => [
            ...prev,
            { role: 'user', content: `🎤 ${data.transcription}`, timestamp: new Date() },
            { role: 'assistant', content: data.answer, data: data.data, timestamp: new Date() },
          ]);
        } catch (err: any) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `❌ Error de voz: ${err.message}`, timestamp: new Date() },
          ]);
        } finally {
          setIsLoading(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError' 
        ? '🔒 Permiso de micrófono denegado. Ve a ajustes del navegador y permite el acceso al micrófono para este sitio.'
        : '🔒 No se pudo acceder al micrófono. En HTTP, el micrófono no funciona — usa HTTPS o escribe tu pregunta.';
      setMicError(msg);
      setTimeout(() => setMicError(null), 6000);
    }
  }, [micAvailable]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-amber-500 text-black rounded-br-md'
                  : 'bg-[#151d2e] text-gray-100 rounded-bl-md border border-white/5'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.data && (
                <details className="mt-2 text-xs opacity-60">
                  <summary className="cursor-pointer select-none">📊 Ver datos raw</summary>
                  <pre className="mt-1 overflow-x-auto text-[10px] max-h-32 text-gray-400">
                    {JSON.stringify(msg.data, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#151d2e] rounded-2xl px-4 py-3 rounded-bl-md border border-white/5">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span className="text-xs text-gray-400">Consultando datos...</span>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {showQuickActions && messages.length <= 1 && (
          <div className="pt-1">
            <p className="text-[11px] text-gray-500 mb-2 px-1">Prueba preguntar:</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((action, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(action.query)}
                  className="bg-[#151d2e] border border-white/5 text-gray-300 text-[11px] px-3 py-1.5 rounded-full hover:bg-[#1a2540] hover:border-amber-500/20 active:scale-95 transition-all"
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
      <div className="flex-shrink-0 px-3 pb-2 pt-2 bg-[#0d1424] border-t border-white/5">
        {/* Mic error banner */}
        {micError && (
          <div className="mb-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-amber-300 leading-relaxed flex-1">{micError}</p>
            <button onClick={() => setMicError(null)} className="text-gray-500 flex-shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Voice button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              isRecording
                ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/40'
                : !micAvailable 
                  ? 'bg-[#151d2e] border border-white/5 opacity-40'
                  : 'bg-[#151d2e] border border-white/10 active:scale-95'
            }`}
            title={!micAvailable ? 'Micrófono no disponible (requiere HTTPS)' : 'Grabar voz'}
          >
            {isRecording ? (
              <MicOff className="w-4 h-4 text-white" />
            ) : (
              <Mic className={`w-4 h-4 ${!micAvailable ? 'text-gray-600' : 'text-gray-400'}`} />
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
              className="w-full bg-[#151d2e] text-white rounded-full pl-4 pr-11 py-2.5 text-[13px] placeholder-gray-500 border border-white/10 focus:border-amber-500/50 focus:outline-none transition-colors"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center disabled:opacity-20 active:scale-90 transition-all"
            >
              <ArrowUp className="w-4 h-4 text-black" />
            </button>
          </div>
        </div>
        
        {isRecording && (
          <p className="text-center text-[11px] text-red-400 mt-1.5 animate-pulse">
            🎙️ Grabando... Toca para terminar
          </p>
        )}
      </div>
    </div>
  );
}


// ============================================================================
// NOTIFICATIONS PANEL — Coming Soon Placeholder
// ============================================================================
function NotificationsPanel() {
  const upcomingFeatures = [
    { icon: '💳', title: 'Alertas de Pagos', desc: 'Notificación cuando un cliente paga o se atrasa' },
    { icon: '📋', title: 'Tareas Pendientes', desc: 'Recordatorios de documentos por recoger, casas por evaluar' },
    { icon: '🏠', title: 'Nuevas Casas', desc: 'Alerta cuando el buscador encuentra una casa que califica' },
    { icon: '📝', title: 'Contratos', desc: 'Recordatorio de contratos por vencer o renovar' },
    { icon: '💰', title: 'Comisiones', desc: 'Notificación de comisiones ganadas al cerrar una venta' },
    { icon: '🔧', title: 'Renovaciones', desc: 'Actualizaciones de estado de renovaciones activas' },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-6" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-amber-400/20 to-amber-600/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
          <Bell className="w-8 h-8 text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Notificaciones</h2>
        <div className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1">
          <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
          <span className="text-[11px] font-medium text-amber-400">Próximamente</span>
        </div>
      </div>

      {/* Features preview */}
      <div className="space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium px-1">
          Funcionalidades que llegarán
        </p>
        {upcomingFeatures.map((feature, i) => (
          <div
            key={i}
            className="bg-[#151d2e] border border-white/5 rounded-xl p-4 flex items-start gap-3"
          >
            <span className="text-xl mt-0.5">{feature.icon}</span>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white">{feature.title}</h3>
              <p className="text-[12px] text-gray-400 mt-0.5">{feature.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Info box */}
      <div className="mt-6 bg-[#0d1424] border border-white/5 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-gray-400 leading-relaxed">
            Las notificaciones en tiempo real llegarán aquí automáticamente. 
            Incluirán pagos de clientes, casas nuevas del buscador, recordatorios 
            de documentos, y alertas del equipo.
          </p>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// EVALUATOR PANEL — AI Property Condition Evaluation (28-point Checklist)
// Only evaluates the STATE/CONDITION of the house. No renovation estimates.
// The AI evaluates what it can see, then ASKS for specific missing photos.
// ============================================================================
function EvaluatorPanel() {
  // Core state
  const [evaluationId, setEvaluationId] = useState<string | null>(null);
  const [reportNumber, setReportNumber] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [extraNotes, setExtraNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'draft' | 'completed'>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [completedReport, setCompletedReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [showChecklist, setShowChecklist] = useState(true);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showExtraNotes, setShowExtraNotes] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Start a new evaluation (creates draft in DB)
  const startEvaluation = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/evaluations`, { method: 'POST' });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setEvaluationId(data.id);
      setReportNumber(data.report_number);
      setChecklist(data.checklist || []);
      setExtraNotes(data.extra_notes || []);
      setStatus('draft');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle file selection
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    setPhotos(prev => [...prev, ...newFiles]);
    newFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => setPreviews(prev => [...prev, e.target?.result as string]);
      reader.readAsDataURL(file);
    });
  };

  // Upload photos for AI analysis
  const analyzePhotos = async () => {
    if (!evaluationId || photos.length === 0) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const formData = new FormData();
      photos.forEach(p => formData.append('files', p));
      const res = await fetch(`${API_URL}/api/evaluations/${evaluationId}/analyze-photos`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `Error ${res.status}` }));
        throw new Error(err.detail || `Error ${res.status}`);
      }
      const data = await res.json();
      setChecklist(data.checklist || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Update a single checklist item
  const updateChecklistItem = async (itemId: string, newStatus: string, note?: string) => {
    const updated = checklist.map(item =>
      item.id === itemId
        ? { ...item, status: newStatus, confidence: 'high', note: note !== undefined ? note : item.note }
        : item
    );
    setChecklist(updated);
    setEditingItem(null);
    // Save to backend
    if (evaluationId) {
      fetch(`${API_URL}/api/evaluations/${evaluationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      }).catch(() => {});
    }
  };

  // Add extra note
  const addExtraNote = async () => {
    if (!newNote.trim() || !evaluationId) return;
    const updated = [...extraNotes, newNote.trim()];
    setExtraNotes(updated);
    setNewNote('');
    fetch(`${API_URL}/api/evaluations/${evaluationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extra_notes: updated }),
    }).catch(() => {});
  };

  const removeExtraNote = (idx: number) => {
    const updated = extraNotes.filter((_, i) => i !== idx);
    setExtraNotes(updated);
    if (evaluationId) {
      fetch(`${API_URL}/api/evaluations/${evaluationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extra_notes: updated }),
      }).catch(() => {});
    }
  };

  // Generate final report
  const generateReport = async () => {
    if (!evaluationId) return;
    setIsGenerating(true);
    setError(null);
    try {
      // Save final checklist + notes before generating
      await fetch(`${API_URL}/api/evaluations/${evaluationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist, extra_notes: extraNotes }),
      });
      const res = await fetch(`${API_URL}/api/evaluations/${evaluationId}/generate-report`, { method: 'POST' });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setCompletedReport(data);
      setStatus('completed');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const resetAll = () => {
    setEvaluationId(null);
    setReportNumber(null);
    setChecklist([]);
    setExtraNotes([]);
    setNewNote('');
    setStatus('idle');
    setCompletedReport(null);
    setPhotos([]);
    setPreviews([]);
    setError(null);
    setEditingItem(null);
    setCopiedNumber(false);
  };

  const copyReportNumber = () => {
    if (reportNumber) {
      navigator.clipboard?.writeText(reportNumber).catch(() => {});
      setCopiedNumber(true);
      setTimeout(() => setCopiedNumber(false), 2000);
    }
  };

  const getStatusIcon = (s: string) => {
    switch (s) {
      case 'pass': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'fail': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'needs_photo': return <Camera className="w-4 h-4 text-blue-400" />;
      case 'not_evaluable': return <HelpCircle className="w-4 h-4 text-gray-500" />;
      case 'pending': return <HelpCircle className="w-4 h-4 text-gray-600" />;
      default: return <HelpCircle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'pass': return 'border-green-500/20 bg-green-500/5';
      case 'fail': return 'border-red-500/20 bg-red-500/5';
      case 'warning': return 'border-amber-500/20 bg-amber-500/5';
      case 'needs_photo': return 'border-blue-500/20 bg-blue-500/5';
      case 'pending': return 'border-gray-500/10 bg-gray-500/5';
      default: return 'border-white/5 bg-white/5';
    }
  };

  const STATUS_OPTIONS = [
    { value: 'pass', label: '✅ Aprobado', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    { value: 'fail', label: '❌ Falla', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    { value: 'warning', label: '⚠️ Alerta', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    { value: 'needs_photo', label: '📸 Necesita foto', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { value: 'not_evaluable', label: '—  N/A', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  ];

  const categoryIcons: Record<string, string> = {
    'Estructura': '🏗️', 'Instalaciones': '⚡', 'Documentación': '📄',
    'Financiero': '💰', 'Especificaciones': '📋', 'Cierre': '🔑',
  };

  // Group checklist
  const groupedChecklist = checklist.reduce((acc: Record<string, any[]>, item: any) => {
    const cat = item.category || 'Otro';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  // Summary stats
  const summary = {
    total: checklist.length,
    passed: checklist.filter(i => i.status === 'pass').length,
    failed: checklist.filter(i => i.status === 'fail').length,
    warnings: checklist.filter(i => i.status === 'warning').length,
    needs_photo: checklist.filter(i => i.status === 'needs_photo').length,
    pending: checklist.filter(i => i.status === 'pending').length,
    not_evaluable: checklist.filter(i => i.status === 'not_evaluable').length,
  };

  const getRecStyle = (rec: string) => {
    if (rec === 'COMPRAR') return 'from-green-500 to-emerald-600';
    if (rec === 'NO COMPRAR') return 'from-red-500 to-rose-600';
    return 'from-amber-500 to-orange-500';
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* Hidden file inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" multiple capture="environment"
        onChange={(e) => { handleFiles(e.target.files); if (e.target) e.target.value = ''; }} className="hidden" />
      <input ref={galleryInputRef} type="file" accept="image/*" multiple
        onChange={(e) => { handleFiles(e.target.files); if (e.target) e.target.value = ''; }} className="hidden" />

      {/* ═══════════ IDLE STATE: Start new evaluation ═══════════ */}
      {status === 'idle' && !isLoading && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-2 border-amber-500/20 rounded-2xl p-5 text-center">
            <ClipboardCheck className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-2">Evaluación de Casa</h3>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Evalúa una casa móvil con el checklist de 28 puntos.<br />
              Puedes subir fotos para que la IA rellene o editar manualmente.
            </p>
              <button
              onClick={startEvaluation}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold py-3 rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm"
              >
              <Plus className="w-4 h-4" />
              Iniciar Nueva Evaluación
              </button>
          </div>
          <div className="bg-[#151d2e] border border-white/5 rounded-2xl p-4">
            <h4 className="text-sm font-semibold text-amber-400 mb-2">¿Cómo funciona?</h4>
            <div className="space-y-2">
              {[
                { n: '1', t: 'Inicias la evaluación', d: 'Se crea un borrador con número único' },
                { n: '2', t: 'Sube fotos o edita manual', d: 'La IA rellena lo que puede; tú editas el resto' },
                { n: '3', t: 'Añade notas extras', d: 'Puntos adicionales que no estén en el checklist' },
                { n: '4', t: 'Genera el reporte final', d: 'La IA crea un resumen con score y recomendación' },
                { n: '5', t: 'Comparte el número', d: 'Pon el número en el ordenador para vincular la casa' },
              ].map(step => (
                <div key={step.n} className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{step.n}</div>
                  <div><p className="text-xs font-medium text-gray-200">{step.t}</p><p className="text-[10px] text-gray-500">{step.d}</p></div>
            </div>
          ))}
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="bg-[#151d2e] border border-amber-500/20 rounded-2xl p-6 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-gray-300">Creando evaluación...</p>
        </div>
      )}

      {/* ═══════════ DRAFT STATE: Active evaluation ═══════════ */}
      {status === 'draft' && (
        <>
          {/* Report Number Banner */}
          <div className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-indigo-300 uppercase tracking-wider font-medium">Número de Reporte</p>
                <p className="text-xl font-black text-white tracking-wider">{reportNumber}</p>
              </div>
              <button onClick={copyReportNumber} className="bg-indigo-500/20 border border-indigo-500/30 rounded-xl px-3 py-2 active:scale-95 transition-all">
                {copiedNumber ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-indigo-400" />}
              </button>
            </div>
            <p className="text-[10px] text-indigo-300/70 mt-1">
              {copiedNumber ? '¡Copiado!' : 'Comparte este número para vincular en el ordenador'}
            </p>
          </div>

          {/* Summary Stats */}
          {checklist.length > 0 && (
            <div className="grid grid-cols-6 gap-1">
              {[
                { n: summary.passed, l: 'OK', c: 'text-green-400 bg-green-500/10 border-green-500/20' },
                { n: summary.failed, l: 'Falla', c: 'text-red-400 bg-red-500/10 border-red-500/20' },
                { n: summary.warnings, l: 'Alerta', c: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                { n: summary.needs_photo, l: 'Foto', c: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
                { n: summary.pending, l: 'Pend.', c: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
                { n: summary.not_evaluable, l: 'N/A', c: 'text-gray-500 bg-gray-500/5 border-gray-500/10' },
              ].map((s, i) => (
                <div key={i} className={`border rounded-lg p-1.5 text-center ${s.c}`}>
                  <p className="text-sm font-bold">{s.n}</p>
                  <p className="text-[8px]">{s.l}</p>
                </div>
              ))}
            </div>
          )}

          {/* PHOTOS SECTION */}
          <div className="bg-[#151d2e] border border-white/5 rounded-2xl overflow-hidden">
            <button onClick={() => setShowPhotos(!showPhotos)}
              className="w-full px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">Fotos ({photos.length})</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showPhotos ? 'rotate-180' : ''}`} />
            </button>
            {showPhotos && (
              <div className="px-4 pb-4 space-y-3">
                {previews.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {previews.map((p, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                        <img src={p} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                        <button onClick={() => { setPhotos(prev => prev.filter((_, j) => j !== i)); setPreviews(prev => prev.filter((_, j) => j !== i)); }}
                          className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 rounded-full text-white text-xs flex items-center justify-center"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 py-3 rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center gap-1 text-gray-400 active:border-amber-500/30 transition-all">
                    <Camera className="w-4 h-4" /><span className="text-[10px]">Cámara</span>
                  </button>
                  <button onClick={() => galleryInputRef.current?.click()}
                    className="flex-1 py-3 rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center gap-1 text-gray-400 active:border-amber-500/30 transition-all">
                    <ImageIcon className="w-4 h-4" /><span className="text-[10px]">Galería</span>
                  </button>
                </div>
                <button onClick={analyzePhotos} disabled={photos.length === 0 || isAnalyzing}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs">
                  {isAnalyzing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analizando...</> : <><Wand2 className="w-3.5 h-3.5" />IA Analizar Fotos ({photos.length})</>}
                </button>
                <p className="text-[10px] text-gray-500 text-center">La IA rellena el checklist con lo que detecte. Tú siempre puedes editar.</p>
              </div>
            )}
          </div>

          {isAnalyzing && (
            <div className="bg-[#151d2e] border border-blue-500/20 rounded-2xl p-5 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-white">Analizando {photos.length} fotos con IA...</p>
              <p className="text-[11px] text-gray-400">15-30 segundos. Los ítems que ya editaste se mantienen.</p>
            </div>
          )}

          {/* EDITABLE CHECKLIST */}
          <div className="bg-[#151d2e] border border-white/5 rounded-2xl overflow-hidden">
            <button onClick={() => setShowChecklist(!showChecklist)}
              className="w-full px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">Checklist ({checklist.length} puntos)</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showChecklist ? 'rotate-180' : ''}`} />
            </button>
            {showChecklist && (
              <div className="space-y-0.5">
                {Object.entries(groupedChecklist).map(([category, items]: [string, any[]]) => {
                  const catPassed = items.filter(i => i.status === 'pass').length;
                  return (
                    <div key={category}>
                      <div className="bg-white/5 px-3 py-2 flex items-center gap-2">
                        <span className="text-sm">{categoryIcons[category] || '📌'}</span>
                        <span className="text-xs font-semibold text-gray-200">{category}</span>
                        <span className="text-[10px] text-gray-500 ml-auto">{catPassed}/{items.length} ✓</span>
                      </div>
                      <div className="divide-y divide-white/5">
                        {items.map((item: any) => (
                          <div key={item.id} className={`px-3 py-2 ${getStatusColor(item.status)}`}>
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5 flex-shrink-0">{getStatusIcon(item.status)}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-medium text-gray-200 flex-1">{item.label}</p>
                                  <button onClick={() => { setEditingItem(editingItem === item.id ? null : item.id); setEditNote(item.note || ''); }}
                                    className="p-1 rounded-lg active:bg-white/10">
                                    <Edit3 className="w-3 h-3 text-gray-500" />
                                  </button>
                                </div>
                                {item.note && editingItem !== item.id && (
                                  <p className="text-[10px] text-gray-400 mt-0.5">{item.note}</p>
                                )}
                              </div>
                            </div>
                            {/* Inline edit */}
                            {editingItem === item.id && (
                              <div className="mt-2 ml-6 space-y-2">
                                <div className="flex flex-wrap gap-1">
                                  {STATUS_OPTIONS.map(opt => (
                                    <button key={opt.value}
                                      onClick={() => updateChecklistItem(item.id, opt.value, editNote || item.note)}
                                      className={`text-[10px] px-2 py-1 rounded-lg border ${item.status === opt.value ? opt.color + ' font-bold' : 'bg-white/5 text-gray-400 border-white/10'} active:scale-95 transition-all`}>
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex gap-1.5">
                                  <input type="text" value={editNote} onChange={e => setEditNote(e.target.value)}
                                    placeholder="Nota (opcional)"
                                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/30" />
                                  <button onClick={() => updateChecklistItem(item.id, item.status, editNote)}
                                    className="bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg px-2 py-1.5 text-[10px] font-medium active:scale-95">
                                    <Save className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* EXTRA NOTES SECTION */}
          <div className="bg-[#151d2e] border border-white/5 rounded-2xl overflow-hidden">
            <button onClick={() => setShowExtraNotes(!showExtraNotes)}
              className="w-full px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-white">Notas Extra ({extraNotes.length})</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showExtraNotes ? 'rotate-180' : ''}`} />
            </button>
            {showExtraNotes && (
              <div className="px-4 pb-4 space-y-2">
                <p className="text-[10px] text-gray-500">Añade observaciones que no estén en el checklist estándar</p>
                {extraNotes.map((note, i) => (
                  <div key={i} className="flex items-start gap-2 bg-purple-500/5 border border-purple-500/10 rounded-lg p-2.5">
                    <span className="text-[10px] text-purple-400 font-bold mt-0.5">{i + 1}.</span>
                    <p className="text-xs text-gray-300 flex-1">{note}</p>
                    <button onClick={() => removeExtraNote(i)} className="text-gray-500 active:text-red-400 p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addExtraNote(); }}
                    placeholder="Ej: Hay que cambiar todo el suelo de la cocina"
                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/30" />
                  <button onClick={addExtraNote} disabled={!newNote.trim()}
                    className="bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-lg px-3 py-2 disabled:opacity-30 active:scale-95 transition-all">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ACTION BUTTONS */}
          <div className="space-y-2">
            <button onClick={generateReport} disabled={isGenerating || summary.pending === summary.total}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold py-3 rounded-xl disabled:opacity-30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm">
              {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" />Generando Reporte...</> : <><FileText className="w-4 h-4" />Generar Reporte Final</>}
            </button>
            {summary.pending > 0 && summary.pending < summary.total && (
              <p className="text-[10px] text-amber-400/70 text-center">{summary.pending} puntos pendientes — puedes generar el reporte así o completarlos</p>
            )}
            {summary.pending === summary.total && (
              <p className="text-[10px] text-gray-500 text-center">Sube fotos o edita el checklist para poder generar el reporte</p>
            )}
          </div>
        </>
      )}

      {/* ═══════════ COMPLETED STATE: Final report ═══════════ */}
      {status === 'completed' && completedReport && (
        <>
          {/* Report Number — PROMINENT */}
          <div className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border-2 border-indigo-500/30 rounded-2xl p-5 text-center">
            <Hash className="w-6 h-6 text-indigo-400 mx-auto mb-1" />
            <p className="text-[10px] text-indigo-300 uppercase tracking-wider font-medium mb-1">Número de Reporte</p>
            <p className="text-3xl font-black text-white tracking-wider">{completedReport.report_number}</p>
            <p className="text-[11px] text-indigo-300/70 mt-2">
              Pon este número en el ordenador en &quot;Revisar Casa&quot; → Evaluación
            </p>
            <button onClick={copyReportNumber}
              className="mt-3 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-medium rounded-xl px-4 py-2 text-xs active:scale-95 transition-all flex items-center gap-2 mx-auto">
              {copiedNumber ? <><CheckCircle className="w-3.5 h-3.5" />Copiado</> : <><Copy className="w-3.5 h-3.5" />Copiar Número</>}
            </button>
          </div>

          {/* Score */}
          <div className={`bg-gradient-to-br ${getRecStyle(completedReport.recommendation)} rounded-2xl p-4 text-center relative overflow-hidden`}>
            <div className="absolute inset-0 bg-black/20" />
            <div className="relative">
              <p className="text-white/70 text-xs uppercase tracking-wider mb-1">Resultado</p>
              <p className="text-5xl font-black text-white mb-1">{completedReport.score}</p>
              <p className="text-white/80 text-xs">de 100 puntos</p>
              <div className="mt-2 inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                <span className="text-white font-bold text-sm">{completedReport.recommendation}</span>
              </div>
              {completedReport.recommendation_reason && (
                <p className="text-white/70 text-[11px] mt-2">{completedReport.recommendation_reason}</p>
              )}
            </div>
          </div>

          {/* AI Summary */}
          {completedReport.ai_summary && (
            <div className="bg-[#151d2e] border border-white/5 rounded-2xl p-4">
              <h4 className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" /> Resumen del AI
              </h4>
              <p className="text-xs text-gray-300 leading-relaxed">{completedReport.ai_summary}</p>
            </div>
          )}

          {/* Extra Notes in Report */}
          {(completedReport.extra_notes || []).length > 0 && (
            <div className="bg-[#151d2e] border border-purple-500/10 rounded-2xl p-4">
              <h4 className="text-xs font-semibold text-purple-400 mb-2 flex items-center gap-2">
                <StickyNote className="w-3.5 h-3.5" /> Notas Extra del Empleado
              </h4>
              {(completedReport.extra_notes as string[]).map((note: string, i: number) => (
                <p key={i} className="text-xs text-gray-300 mb-1">• {note}</p>
              ))}
            </div>
          )}

          {/* New Evaluation */}
          <button onClick={resetAll}
            className="w-full bg-[#151d2e] border border-white/10 text-gray-300 font-medium py-3 rounded-xl active:bg-[#1a2540] transition-colors flex items-center justify-center gap-2 text-sm">
            <RotateCcw className="w-4 h-4" /> Nueva Evaluación
        </button>
        </>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
          <div className="flex items-start gap-2">
            <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-red-400">Error</h3>
              <p className="text-[12px] text-gray-400 mt-1">{error}</p>
              <button onClick={() => setError(null)} className="mt-2 text-xs text-amber-400 font-medium">Cerrar</button>
      </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================================
// RENOVATION PANEL V2 — Simplified: concepto + precio + notas + voice
// ============================================================================

interface MobileProperty {
  id: string;
  address: string;
  status: string;
  square_feet: number | null;
  purchase_price: number | null;
}

interface MobileRenovationItem {
  id: string;
  partida: number;
  concepto: string;
  precio: number;
  notas: string;
  is_custom?: boolean;
}

interface MobileQuoteV2 {
  version: number;
  property_id: string;
  renovation_id: string | null;
  address: string;
  square_feet: number | null;
  purchase_price: number | null;
  has_inspection: boolean;
  items: MobileRenovationItem[];
  total_proyecto: number;
}

function RenovationPanel() {
  const [properties, setProperties] = useState<MobileProperty[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<MobileProperty | null>(null);
  const [quote, setQuote] = useState<MobileQuoteV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [aiFilling, setAiFilling] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [showImportReport, setShowImportReport] = useState(false);
  const [importReportNumber, setImportReportNumber] = useState('');
  const [importingReport, setImportingReport] = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customConcepto, setCustomConcepto] = useState('');
  const [customPrecio, setCustomPrecio] = useState('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  // Voice
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadProperties(); }, []);

  const loadProperties = async () => {
    try {
      const res = await fetch(`${API_URL}/api/properties`);
      if (res.ok) {
        const data = await res.json();
        const purchased = (data.properties || data || []).filter(
          (p: MobileProperty) => ['purchased', 'renovating', 'ready_to_sell'].includes(p.status)
        );
        setProperties(purchased);
      }
    } catch (err) { console.error('Error loading properties:', err); }
    finally { setLoading(false); }
  };

  const selectProperty = async (prop: MobileProperty) => {
    setSelectedProperty(prop);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/renovation/${prop.id}/quote`);
      if (res.ok) setQuote(await res.json());
    } catch (err) { console.error('Error loading quote:', err); }
    finally { setLoading(false); }
  };

  const updateItemPrice = (itemId: string, precio: number) => {
    setQuote(prev => {
      if (!prev) return prev;
      const items = prev.items.map(i => i.id === itemId ? { ...i, precio } : i);
      return { ...prev, items, total_proyecto: Math.round(items.reduce((s, i) => s + (i.precio || 0), 0) * 100) / 100 };
    });
    setHasUnsavedChanges(true);
  };

  const updateItemNotas = (itemId: string, notas: string) => {
    setQuote(prev => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, notas } : i) };
    });
    setHasUnsavedChanges(true);
  };

  const addCustomItem = () => {
    if (!customConcepto.trim()) return;
    const nextPartida = (quote?.items.length || 19) + 1;
    const newItem: MobileRenovationItem = {
      id: `custom_${Date.now()}`, partida: nextPartida, concepto: customConcepto.trim(),
      precio: parseFloat(customPrecio) || 0, notas: '', is_custom: true,
    };
    setQuote(prev => {
      if (!prev) return prev;
      const items = [...prev.items, newItem];
      return { ...prev, items, total_proyecto: Math.round(items.reduce((s, i) => s + (i.precio || 0), 0) * 100) / 100 };
    });
    setCustomConcepto(''); setCustomPrecio(''); setShowAddCustom(false);
    setHasUnsavedChanges(true);
  };

  const removeCustomItem = (itemId: string) => {
    setQuote(prev => {
      if (!prev) return prev;
      const items = prev.items.filter(i => i.id !== itemId);
      return { ...prev, items, total_proyecto: Math.round(items.reduce((s, i) => s + (i.precio || 0), 0) * 100) / 100 };
    });
    setHasUnsavedChanges(true);
  };

  const saveQuote = async () => {
    if (!quote || !selectedProperty) return;
    setSaving(true);
    try {
      const itemsPayload: Record<string, any> = {};
      const customItems: any[] = [];
      for (const item of quote.items) {
        if (item.is_custom) {
          customItems.push({ id: item.id, partida: item.partida, concepto: item.concepto, precio: item.precio, notas: item.notas });
        } else {
          itemsPayload[item.id] = { precio: item.precio || 0, notas: item.notas || '' };
        }
      }
      const res = await fetch(`${API_URL}/api/renovation/${selectedProperty.id}/quote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsPayload, custom_items: customItems }),
      });
      if (res.ok) setHasUnsavedChanges(false);
    } catch (err) { console.error('Save error:', err); }
    finally { setSaving(false); }
  };

  const runAiFill = async (files?: FileList | null) => {
    if (!selectedProperty) return;
    setAiFilling(true);
    try {
      const formData = new FormData();
      if (files) Array.from(files).forEach(f => formData.append('files', f));
      const res = await fetch(`${API_URL}/api/renovation/${selectedProperty.id}/ai-fill`, { method: 'POST', body: formData });
      if (res.ok) {
        const result = await res.json();
        setAiResult(result);
        if (Object.keys(result.suggestions).length > 0) {
          setQuote(prev => {
            if (!prev) return prev;
            const items = prev.items.map(item => {
              const sug = result.suggestions[item.id];
              if (sug) return { ...item, precio: sug.precio || item.precio, notas: sug.notas || item.notas };
              return item;
            });
            return { ...prev, items, total_proyecto: Math.round(items.reduce((s, i) => s + (i.precio || 0), 0) * 100) / 100 };
          });
          setHasUnsavedChanges(true);
        }
      }
    } catch (err) { console.error('AI fill error:', err); }
    finally { setAiFilling(false); }
  };

  const handleComplete = async () => {
    if (!quote || !selectedProperty) return;
    setSaving(true);
    try {
      if (hasUnsavedChanges) await saveQuote();
      const salePrice = (quote.purchase_price || 0) + quote.total_proyecto + 7000;
      await fetch(`${API_URL}/api/properties/${selectedProperty.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'renovating' }),
      });
      const res = await fetch(`${API_URL}/api/properties/${selectedProperty.id}/complete-renovation?new_sale_price=${salePrice}`, { method: 'POST' });
      if (res.ok) { setQuote(null); setSelectedProperty(null); loadProperties(); }
    } catch (err) { console.error('Complete error:', err); }
    finally { setSaving(false); }
  };

  const importEvaluationReport = async () => {
    if (!importReportNumber.trim() || !selectedProperty) return;
    setImportingReport(true);
    try {
      const lookupRes = await fetch(`${API_URL}/api/evaluations/by-number/${importReportNumber.trim()}`);
      if (!lookupRes.ok) { setImportingReport(false); return; }
      const reportData = await lookupRes.json();
      const importRes = await fetch(`${API_URL}/api/renovation/${selectedProperty.id}/import-report?report_id=${reportData.id}`, { method: 'POST' });
      if (!importRes.ok) { setImportingReport(false); return; }
      const result = await importRes.json();
      if (Object.keys(result.suggestions).length > 0) {
        setQuote(prev => {
          if (!prev) return prev;
          const items = prev.items.map(item => {
            const sug = result.suggestions[item.id];
            if (sug) return { ...item, precio: sug.precio || item.precio, notas: sug.notas || item.notas };
            return item;
          });
          return { ...prev, items, total_proyecto: Math.round(items.reduce((s, i) => s + (i.precio || 0), 0) * 100) / 100 };
        });
        setHasUnsavedChanges(true);
      }
      setAiResult({ ai_analysis: `Reporte #${result.report_number} importado`, items_suggested: result.items_suggested });
      setShowImportReport(false); setImportReportNumber('');
    } catch (err) { console.error('Import report error:', err); }
    finally { setImportingReport(false); }
  };

  // Voice commands — simplified: "partida [#] precio [monto]"
  const startVoice = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'es-MX'; recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setVoiceTranscript(transcript);
      if (event.results[event.resultIndex].isFinal) { processVoiceCommand(transcript.toLowerCase().trim()); setVoiceTranscript(''); }
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition; recognition.start(); setIsListening(true);
  };
  const stopVoice = () => { recognitionRef.current?.stop(); setIsListening(false); setVoiceTranscript(''); };

  const processVoiceCommand = (text: string) => {
    if (!quote) return;
    const partidaMatch = text.match(/partida\s+(\d+)/);
    let targetItem: MobileRenovationItem | undefined;
    if (partidaMatch) targetItem = quote.items.find(i => i.partida === parseInt(partidaMatch[1]));
    if (!targetItem) {
      for (const item of quote.items) {
        if (text.includes(item.concepto.toLowerCase().substring(0, 12))) { targetItem = item; break; }
      }
    }
    if (!targetItem) return;

    const precioMatch = text.match(/precio\s+(\d[\d,.]*)/);
    const notasMatch = text.match(/nota[s]?\s+(.+)/);
    if (precioMatch) updateItemPrice(targetItem.id, parseFloat(precioMatch[1].replace(/,/g, '')));
    if (notasMatch) updateItemNotas(targetItem.id, notasMatch[1]);
  };

  const activeItems = quote?.items.filter(i => i.precio > 0).length || 0;
  const suggestedSalePrice = quote ? (quote.purchase_price || 0) + quote.total_proyecto + 7000 : 0;

  // =================== RENDER ===================

  if (loading && !selectedProperty) {
    return (<div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></div>);
  }

  // Property selector
  if (!selectedProperty) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-amber-400/20 to-amber-600/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
            <Wrench className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-lg font-bold text-white">Renovación</h2>
          <p className="text-xs text-gray-400 mt-1">Selecciona la propiedad para cotizar</p>
        </div>
        {properties.length === 0 ? (
          <div className="bg-[#151d2e] border border-white/5 rounded-2xl p-6 text-center">
            <p className="text-gray-400 text-sm">No hay propiedades compradas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium px-1 mb-2">{properties.length} propiedad{properties.length !== 1 ? 'es' : ''}</p>
            {properties.map(prop => (
              <button key={prop.id} onClick={() => selectProperty(prop)}
                className="w-full bg-[#151d2e] border border-white/5 rounded-xl p-4 flex items-center gap-3 active:bg-[#1a2540] transition-all text-left">
                <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center flex-shrink-0"><span className="text-lg">🏠</span></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{prop.address || 'Sin dirección'}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${prop.status === 'purchased' ? 'bg-blue-500/20 text-blue-400' : prop.status === 'renovating' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {prop.status === 'purchased' ? 'Comprada' : prop.status === 'renovating' ? 'En renovación' : 'Lista'}
                </span>
              </div>
                <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
          </div>
    );
  }

  if (loading || !quote) {
    return (<div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto" /></div>);
  }

  // Simplified V2 Quote View — concepto + precio
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { if (e.target.files) runAiFill(e.target.files); }} />

      {/* Header */}
      <div className="flex-shrink-0 bg-[#0d1424] border-b border-white/5 px-3 py-2">
        <div className="flex items-center justify-between">
          <button onClick={() => { setSelectedProperty(null); setQuote(null); setHasUnsavedChanges(false); setAiResult(null); }}
            className="text-gray-400 active:text-white p-1">
            <ChevronDown className="w-5 h-5 rotate-90" />
          </button>
          <div className="flex-1 mx-2 min-w-0 text-center">
            <p className="text-xs text-gray-400 truncate">{quote.address}</p>
            <p className="text-sm font-bold text-amber-400">${quote.total_proyecto.toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={isListening ? stopVoice : startVoice}
              className={`p-1.5 rounded-lg ${isListening ? 'bg-red-500/30 text-red-400 animate-pulse' : 'bg-[#151d2e] text-gray-500 border border-white/5'}`}>
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button onClick={saveQuote} disabled={saving || !hasUnsavedChanges}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${hasUnsavedChanges ? 'bg-amber-500 text-black animate-pulse' : 'bg-[#151d2e] text-gray-500 border border-white/5'}`}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 inline mr-1" />}
              Guardar
            </button>
          </div>
        </div>
        {isListening && (
          <div className="mt-1 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1 flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-[10px] text-red-300">{voiceTranscript || 'Di "partida [#] precio [monto]"'}</span>
        </div>
      )}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3" style={{ WebkitOverflowScrolling: 'touch' }}>

        {/* Summary */}
        <div className="bg-[#151d2e] border border-white/5 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">🏠 {quote.square_feet || '?'} sqft</span>
            <span className="text-xs text-gray-500">{activeItems} partidas activas</span>
          </div>
          {suggestedSalePrice > 0 && quote.purchase_price && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 mt-1">
              <div className="flex justify-between text-[10px] text-emerald-400">
                <span>Compra: ${(quote.purchase_price || 0).toLocaleString()}</span>
                <span>+ Reno: ${quote.total_proyecto.toLocaleString()}</span>
              </div>
              <p className="text-center text-sm font-bold text-emerald-400 mt-1">Venta: ${suggestedSalePrice.toLocaleString()}</p>
        </div>
      )}
        </div>

        {/* AI Actions */}
        <div className="flex gap-2">
          <button onClick={() => fileInputRef.current?.click()} disabled={aiFilling}
            className="flex-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium py-2.5 rounded-xl active:bg-blue-500/20 transition-all flex items-center justify-center gap-1.5 text-xs">
            {aiFilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            📸 AI Fotos
          </button>
          <button onClick={() => setShowImportReport(true)} disabled={importingReport}
            className="flex-1 bg-teal-500/10 border border-teal-500/20 text-teal-400 font-medium py-2.5 rounded-xl active:bg-teal-500/20 transition-all flex items-center justify-center gap-1.5 text-xs">
            <FileText className="w-3.5 h-3.5" />
            📋 Importar Reporte
          </button>
            </div>

        {/* AI Result */}
        {aiResult?.ai_analysis && (
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-medium text-purple-300">{aiResult.ai_analysis}</span>
            </div>
          </div>
        )}

        {/* 19 ITEMS — Simplified: tap to edit precio + notas */}
        {quote.items.map(item => (
          <div key={item.id} className={`bg-[#151d2e] border rounded-xl overflow-hidden ${
            item.precio > 0 ? 'border-amber-500/20' : 'border-white/5'
          } ${item.is_custom ? 'border-amber-300/30' : ''}`}>
            <button onClick={() => setEditingItem(editingItem === item.id ? null : item.id)}
              className="w-full flex items-center justify-between p-3 active:bg-white/5 transition-colors">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs font-bold text-gray-500 w-5">{item.partida}</span>
                <p className="text-xs font-medium text-white truncate flex-1">{item.concepto}</p>
              </div>
              <span className={`text-sm font-bold ml-2 ${item.precio > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                ${(item.precio || 0).toLocaleString()}
              </span>
            </button>

            {editingItem === item.id && (
              <div className="border-t border-white/5 p-3 space-y-2">
                <div>
                  <label className="text-[9px] text-gray-500 uppercase">Precio ($)</label>
                  <input type="number" min={0} step={0.01} value={item.precio || ''}
                    onChange={e => updateItemPrice(item.id, parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#0a0f1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white text-right font-mono" placeholder="$0.00" />
                </div>
                <div>
                  <label className="text-[9px] text-gray-500 uppercase">Notas</label>
                  <input type="text" value={item.notas || ''} onChange={e => updateItemNotas(item.id, e.target.value)}
                    className="w-full bg-[#0a0f1a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" placeholder="Notas..." />
                </div>
                {item.is_custom && (
                  <button onClick={() => removeCustomItem(item.id)} className="text-[10px] text-red-400 flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Eliminar partida
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Add custom item */}
        {!showAddCustom ? (
          <button onClick={() => setShowAddCustom(true)}
            className="w-full py-2.5 border border-dashed border-amber-500/30 rounded-xl text-amber-400 text-xs font-medium flex items-center justify-center gap-1.5 active:bg-amber-500/5">
            <Plus className="w-3.5 h-3.5" /> Agregar partida personalizada
          </button>
        ) : (
          <div className="bg-[#151d2e] border border-amber-500/30 rounded-xl p-3 space-y-2">
            <input type="text" value={customConcepto} onChange={e => setCustomConcepto(e.target.value)} autoFocus
              className="w-full bg-[#0a0f1a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" placeholder="Nombre del concepto..." />
            <div className="flex gap-2">
              <input type="number" value={customPrecio} onChange={e => setCustomPrecio(e.target.value)}
                className="flex-1 bg-[#0a0f1a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" placeholder="Precio" />
              <button onClick={addCustomItem} className="bg-amber-500 text-black font-bold px-4 py-2 rounded-lg text-xs">Agregar</button>
              <button onClick={() => setShowAddCustom(false)} className="text-gray-500 p-2"><X className="w-4 h-4" /></button>
      </div>
          </div>
        )}

        {/* Total */}
        <div className="bg-[#151d2e] border border-white/5 rounded-xl p-3">
          <div className="flex justify-between text-sm font-bold">
            <span className="text-white">Total:</span>
            <span className="text-amber-400">${quote.total_proyecto.toLocaleString()}</span>
          </div>
        </div>

        {/* Complete button */}
        <button onClick={handleComplete} disabled={quote.total_proyecto <= 0 || saving}
          className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold py-3.5 rounded-xl disabled:opacity-30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Terminar Renovación (Venta: ${suggestedSalePrice.toLocaleString()})
        </button>

        <div className="h-2" />
      </div>

      {/* Import Report Modal */}
      {showImportReport && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
          <div className="bg-[#151d2e] border border-white/10 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-base font-bold text-white mb-2 text-center">📋 Importar Reporte</h3>
            <input type="text" value={importReportNumber} onChange={e => setImportReportNumber(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') importEvaluationReport(); }}
              className="w-full bg-[#0a0f1a] border-2 border-white/10 rounded-xl px-4 py-3 text-lg font-bold text-center text-white focus:border-teal-500/50 focus:outline-none"
              placeholder="EVL-XXXXXX-XXX" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowImportReport(false); setImportReportNumber(''); }}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 text-xs font-medium">Cancelar</button>
              <button onClick={importEvaluationReport} disabled={importingReport || !importReportNumber.trim()}
                className="flex-1 bg-teal-500 text-black font-bold py-2.5 rounded-xl disabled:opacity-30 text-xs flex items-center justify-center gap-1.5">
                {importingReport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
