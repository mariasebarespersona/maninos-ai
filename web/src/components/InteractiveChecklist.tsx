'use client'

import React, { useEffect, useState } from 'react'
import { Check, Download, Loader2, CheckSquare } from 'lucide-react'
import { InspectionItem, InspectionRecord, TitleStatus } from '@/types/maninos'

interface InteractiveChecklistProps {
  propertyId: string;
}

interface ChecklistData {
    checklist: InspectionItem[];
    defect_costs: Record<string, number>;
    current_inspection?: InspectionRecord;
}

export function InteractiveChecklist({ propertyId }: InteractiveChecklistProps) {
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDefects, setSelectedDefects] = useState<Set<string>>(new Set());
  const [currentTitleStatus, setCurrentTitleStatus] = useState<TitleStatus>('Clean/Blue');

  useEffect(() => {
    if (propertyId) {
        fetchData();
    }
  }, [propertyId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/property/${propertyId}/inspection`);
      const json = await res.json();
      if (json.ok) {
        setData(json);
        if (json.current_inspection) {
             // If we have saved data, use it
             const savedDefects = json.current_inspection.defects || [];
             setSelectedDefects(new Set(savedDefects));
             setCurrentTitleStatus(json.current_inspection.title_status || 'Clean/Blue');
        }
      }
    } catch (err) {
      console.error("Failed to fetch inspection data", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleDefect = async (key: string) => {
      const newDefects = new Set(selectedDefects);
      if (newDefects.has(key)) {
          newDefects.delete(key);
      } else {
          newDefects.add(key);
      }
      setSelectedDefects(newDefects);
      
      // Auto-save
      await saveInspection(Array.from(newDefects), currentTitleStatus);
  };
  
  const handleTitleChange = async (status: TitleStatus) => {
      setCurrentTitleStatus(status);
      await saveInspection(Array.from(selectedDefects), status);
  };

  const saveInspection = async (defects: string[], titleStatus: string) => {
      setSaving(true);
      try {
          await fetch(`/api/property/${propertyId}/inspection`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  defects,
                  title_status: titleStatus
              })
          });
      } catch (err) {
          console.error("Failed to save", err);
      } finally {
          setSaving(false);
      }
  };
  
  const handleDownload = () => {
      if (!data) return;
      const defectsList = Array.from(selectedDefects).map(k => {
          const item = data.checklist.find(i => i.key === k);
          const cost = data.defect_costs[k] || 0;
          return `- ${item?.category || k}: $${cost.toLocaleString()}`;
      }).join('\n');
      
      const totalCost = Array.from(selectedDefects).reduce((acc, k) => acc + (data.defect_costs[k] || 0), 0);
      
      const content = `
MANINOS AI - INSPECTION REPORT
Property ID: ${propertyId}
Date: ${new Date().toLocaleDateString()}
Title Status: ${currentTitleStatus}

DEFECTS FOUND:
${defectsList || 'No defects reported.'}

TOTAL REPAIR ESTIMATE: $${totalCost.toLocaleString()}
      `.trim();
      
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Inspection_Report_${propertyId.slice(0,8)}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
  };

  if (loading) return <div className="p-4 flex items-center gap-2 text-slate-500 bg-slate-50 rounded-lg border border-slate-100 my-2"><Loader2 className="animate-spin" size={16}/> Loading checklist...</div>;
  if (!data) return <div className="p-4 text-rose-500 bg-rose-50 rounded-lg border border-rose-100 my-2">Failed to load checklist. Please try again.</div>;

  const totalCost = Array.from(selectedDefects).reduce((acc, key) => acc + (data.defect_costs[key] || 0), 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden my-4 w-full">
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
            <div className="flex items-center gap-2">
                <CheckSquare className="text-blue-600" size={20} />
                <h3 className="font-bold text-slate-800">Inspection Checklist</h3>
            </div>
             <button onClick={handleDownload} className="text-slate-500 hover:text-blue-600 p-1.5 rounded hover:bg-slate-200 transition-colors" title="Download Report">
                <Download size={18} />
            </button>
        </div>
        
        <div className="p-4 space-y-4">
             <p className="text-xs text-slate-500">Selecciona los defectos encontrados. Los cambios se guardan automáticamente.</p>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                 {data.checklist.map((item) => {
                     const isChecked = selectedDefects.has(item.key);
                     const cost = data.defect_costs[item.key];
                     
                     return (
                         <div 
                            key={item.key}
                            onClick={() => toggleDefect(item.key)}
                            className={`
                                cursor-pointer rounded-lg p-3 border transition-all flex items-start gap-3 select-none
                                ${isChecked 
                                    ? 'bg-rose-50 border-rose-200 shadow-sm' 
                                    : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'}
                            `}
                         >
                             <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white border-slate-300'}`}>
                                 {isChecked && <Check size={14} strokeWidth={3} />}
                             </div>
                             <div className="flex-1">
                                 <div className="flex justify-between w-full">
                                    <h4 className={`text-sm font-semibold ${isChecked ? 'text-rose-900' : 'text-slate-700'}`}>{item.category}</h4>
                                    {isChecked && <span className="text-xs font-bold text-rose-600">+${cost.toLocaleString()}</span>}
                                 </div>
                                 <p className="text-xs text-slate-500 mt-0.5 leading-snug">{item.description}</p>
                             </div>
                         </div>
                     );
                 })}
             </div>
             
             <div className="mt-6 pt-4 border-t border-slate-100">
                 <div className="flex flex-col gap-4">
                     
                     {/* Title Status Selector */}
                     <div className="w-full">
                         <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Title Status</label>
                         <div className="flex flex-wrap gap-2">
                             {(['Clean/Blue', 'Missing', 'Lien', 'Other'] as TitleStatus[]).map(status => (
                                 <button
                                    key={status}
                                    onClick={() => handleTitleChange(status)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                                        currentTitleStatus === status
                                        ? status === 'Clean/Blue' ? 'bg-emerald-100 text-emerald-800 border-emerald-200 ring-2 ring-emerald-500/20' : 'bg-slate-800 text-white border-slate-800 ring-2 ring-slate-500/20'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                    }`}
                                 >
                                     {status}
                                 </button>
                             ))}
                         </div>
                     </div>
                     
                     {/* Total */}
                     <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                         <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wide font-bold">Total Estimated Repairs</p>
                            <div className="flex items-center gap-2 mt-1">
                                {saving ? (
                                    <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 size={10} className="animate-spin"/> Saving...</span>
                                ) : (
                                    <span className="text-xs text-emerald-600 flex items-center gap-1"><Check size={10}/> Saved to DB</span>
                                )}
                            </div>
                         </div>
                         <p className="text-2xl font-bold text-slate-900">${totalCost.toLocaleString()}</p>
                     </div>
                 </div>
             </div>
        </div>
    </div>
  );
}

