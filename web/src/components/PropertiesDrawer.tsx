'use client'

import React, { useState } from 'react'
import { X, Home, Building2, Plus, Trash2 } from 'lucide-react'
import { MobileHomeProperty, STAGE_CONFIG } from '@/types/maninos'

interface PropertiesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  properties: MobileHomeProperty[];
  onSelectProperty: (propertyId: string) => void;
  currentPropertyId: string | null;
  onNewProperty: () => void;
  onPropertyDeleted: () => void; // Callback to refresh properties list
}

export function PropertiesDrawer({ 
    isOpen, 
    onClose, 
    properties, 
    onSelectProperty, 
    currentPropertyId,
    onNewProperty,
    onPropertyDeleted
}: PropertiesDrawerProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent, property: MobileHomeProperty) => {
    e.stopPropagation(); // Prevent selecting the property
    setDeleteConfirm({ id: property.id, name: property.name || 'Unnamed Property' });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    
    setIsDeleting(true);
    try {
      const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080';
      const response = await fetch(`${BACKEND_URL}/api/property/${deleteConfirm.id}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (result.ok) {
        // Success - refresh properties list
        onPropertyDeleted();
        setDeleteConfirm(null);
      } else {
        alert(`Error: ${result.error || 'Failed to delete property'}`);
      }
    } catch (error) {
      console.error('Error deleting property:', error);
      alert('Error deleting property. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

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
                    <div
                        key={prop.id}
                        className={`w-full text-left p-4 rounded-xl border transition-all group relative overflow-hidden ${
                            isActive 
                            ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-500/20' 
                            : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md'
                        }`}
                    >
                        {/* Delete button - positioned absolutely to avoid button nesting */}
                        <button
                            onClick={(e) => handleDeleteClick(e, prop)}
                            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 z-10"
                            title="Delete property"
                        >
                            <Trash2 size={14} />
                        </button>

                        {/* Main content button */}
                        <button
                            onClick={() => {
                                onSelectProperty(prop.id);
                                onClose();
                            }}
                            className="w-full text-left"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                    <Home size={18} />
                                </div>
                                <div className="flex items-center gap-2 pr-8">
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${
                                        isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                        {stage.label}
                                    </span>
                                </div>
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
                    </div>
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

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 rounded-full bg-red-100">
                <Trash2 className="text-red-600" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg text-slate-800 mb-1">Delete Property?</h3>
                <p className="text-sm text-slate-600">
                  Are you sure you want to delete <span className="font-semibold">"{deleteConfirm.name}"</span>?
                </p>
              </div>
            </div>
            
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-6">
              <p className="text-xs text-red-800">
                ⚠️ This action cannot be undone. All data, documents, and history for this property will be permanently deleted.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
