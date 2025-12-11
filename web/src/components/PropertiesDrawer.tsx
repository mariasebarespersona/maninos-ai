'use client'

import React from 'react'
import { X, Home, Building2, ChevronRight, Plus } from 'lucide-react'
import { MobileHomeProperty, STAGE_CONFIG } from '@/types/maninos'

interface PropertiesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  properties: MobileHomeProperty[];
  onSelectProperty: (propertyId: string) => void;
  currentPropertyId: string | null;
  onNewProperty: () => void;
}

export function PropertiesDrawer({ 
    isOpen, 
    onClose, 
    properties, 
    onSelectProperty, 
    currentPropertyId,
    onNewProperty
}: PropertiesDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      {/* Drawer Panel */}
      <div className="relative w-80 bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-left duration-300">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div>
                <h2 className="font-bold text-lg text-slate-800">My Properties</h2>
                <p className="text-xs text-slate-500">{properties.length} Active Deals</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                <X size={20} />
            </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {properties.map(prop => {
                const stage = STAGE_CONFIG[prop.acquisition_stage] || STAGE_CONFIG['initial'];
                const isActive = prop.id === currentPropertyId;
                
                return (
                    <button
                        key={prop.id}
                        onClick={() => {
                            onSelectProperty(prop.id);
                            onClose();
                        }}
                        className={`w-full text-left p-4 rounded-xl border transition-all group relative overflow-hidden ${
                            isActive 
                            ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-500/20' 
                            : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md'
                        }`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                <Home size={18} />
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${
                                isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                                {stage.label}
                            </span>
                        </div>
                        
                        <h3 className={`font-bold text-sm mb-1 ${isActive ? 'text-blue-900' : 'text-slate-800'}`}>
                            {prop.name || 'Unnamed Property'}
                        </h3>
                        <p className="text-xs text-slate-500 line-clamp-1 mb-3">
                            {prop.address || 'No address provided'}
                        </p>
                        
                        <div className="flex items-center justify-between pt-3 border-t border-dashed border-slate-200">
                            <span className="text-xs font-mono font-medium text-slate-600">
                                {prop.asking_price ? `$${prop.asking_price.toLocaleString()}` : '$ -'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                                {new Date(prop.created_at || Date.now()).toLocaleDateString()}
                            </span>
                        </div>
                    </button>
                )
            })}
            
            {properties.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                    <Building2 size={48} className="mx-auto mb-4 opacity-20" />
                    <p>No properties found.</p>
                </div>
            )}
        </div>
        
        <div className="p-4 border-t border-slate-100 bg-slate-50">
            <button 
                onClick={() => {
                    onNewProperty();
                    onClose();
                }}
                className="w-full bg-slate-900 text-white p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg"
            >
                <Plus size={18} />
                New Evaluation
            </button>
        </div>
      </div>
    </div>
  );
}

