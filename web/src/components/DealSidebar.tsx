import React from 'react';
import { MobileHomeProperty } from '@/types/maninos';
import { 
  Building2, MapPin, DollarSign, Hammer, TrendingUp, 
  FileText, AlertTriangle, CheckCircle, XCircle 
} from 'lucide-react';

interface DealSidebarProps {
  property: MobileHomeProperty | null;
  className?: string;
}

export function DealSidebar({ property, className = '' }: DealSidebarProps) {
  if (!property) {
    return (
      <div className={`w-80 border-l border-slate-200 bg-slate-50 p-6 flex flex-col items-center justify-center text-slate-400 ${className}`}>
        <Building2 size={48} className="mb-4 opacity-20" />
        <p className="text-sm font-medium">No Active Deal</p>
        <p className="text-xs text-center mt-2">Start a chat to evaluate a property</p>
      </div>
    );
  }

  // Calculate Metrics
  const askingPrice = property.asking_price || 0;
  const repairEst = property.repair_estimate || 0;
  const arv = property.arv || 0;
  const marketValue = property.market_value || 0;
  
  const totalInvestment = askingPrice + repairEst;
  const projectedProfit = (arv > 0) ? (arv - totalInvestment) : 0;
  const roi = (totalInvestment > 0) ? ((projectedProfit / totalInvestment) * 100).toFixed(1) : '0.0';

  // Badges Logic
  const isTitleClean = property.title_status === 'Clean/Blue';
  const isTitleRisk = property.title_status && !isTitleClean;

  const maxOffer70 = marketValue * 0.70;
  const passed70 = askingPrice > 0 && marketValue > 0 && askingPrice <= maxOffer70;
  
  const maxInvestment80 = arv * 0.80;
  const passed80 = totalInvestment > 0 && arv > 0 && totalInvestment <= maxInvestment80;

  return (
    <div className={`w-96 border-l border-slate-200 bg-white flex flex-col h-full shadow-xl z-20 ${className}`}>
      
      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-slate-50">
        <div className="flex items-start justify-between">
            <div>
                <h2 className="text-lg font-bold text-slate-800 leading-tight">{property.name}</h2>
                <div className="flex items-center text-slate-500 text-sm mt-1">
                    <MapPin size={14} className="mr-1" />
                    <span className="truncate max-w-[200px]">{property.address || 'No Address'}</span>
                </div>
            </div>
            <div className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                property.status === 'Ready to Buy' ? 'bg-emerald-100 text-emerald-700' :
                property.status === 'Rejected' ? 'bg-rose-100 text-rose-700' :
                'bg-blue-100 text-blue-700'
            }`}>
                {property.status}
            </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Financial KPIs */}
        <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Financials</h3>
            <div className="grid grid-cols-2 gap-3">
                <MetricCard 
                    label="Asking Price" 
                    value={`$${askingPrice.toLocaleString()}`} 
                    icon={DollarSign} 
                    color="text-slate-900" 
                />
                <MetricCard 
                    label="Repair Est." 
                    value={`$${repairEst.toLocaleString()}`} 
                    icon={Hammer} 
                    color="text-amber-600" 
                />
                <MetricCard 
                    label="ARV" 
                    value={`$${arv.toLocaleString()}`} 
                    icon={TrendingUp} 
                    color="text-blue-600" 
                />
                <MetricCard 
                    label="Proj. ROI" 
                    value={`${roi}%`} 
                    valueClass={Number(roi) > 15 ? 'text-emerald-600' : 'text-slate-600'}
                    subValue={`$${projectedProfit.toLocaleString()} Profit`}
                />
            </div>
        </section>

        {/* Deal Health / Risks */}
        <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Deal Health</h3>
            <div className="space-y-2">
                <HealthRow 
                    label="70% Rule" 
                    passed={passed70} 
                    detail={`Max Offer: $${maxOffer70.toLocaleString()}`} 
                />
                <HealthRow 
                    label="Title Status" 
                    passed={isTitleClean} 
                    failColor="text-rose-600"
                    detail={property.title_status || 'Pending Check'} 
                    icon={isTitleRisk ? AlertTriangle : undefined}
                />
                <HealthRow 
                    label="80% ARV Rule" 
                    passed={passed80} 
                    detail={`Max Inv: $${maxInvestment80.toLocaleString()}`} 
                />
            </div>
        </section>

        {/* Documents Snippet */}
        <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Documents</h3>
            {/* Placeholder for document list - in a real app this would map property.documents */}
            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-500 flex items-center justify-center border border-dashed border-slate-200">
                <FileText size={16} className="mr-2 opacity-50" />
                <span>No documents attached</span>
            </div>
        </section>

      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <button className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-sm font-medium transition-colors flex items-center justify-center">
            <FileText size={16} className="mr-2" />
            Generate Contract
        </button>
      </div>
    </div>
  );
}

// Sub-components for cleaner code
function MetricCard({ label, value, icon: Icon, color, valueClass, subValue }: any) {
    return (
        <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase text-slate-400 font-semibold">{label}</span>
                {Icon && <Icon size={14} className="text-slate-300" />}
            </div>
            <div className={`text-lg font-bold ${color || 'text-slate-900'} ${valueClass || ''}`}>
                {value}
            </div>
            {subValue && (
                <div className="text-[10px] text-emerald-600 font-medium mt-1">
                    {subValue}
                </div>
            )}
        </div>
    );
}

function HealthRow({ label, passed, detail, failColor, icon: Icon }: any) {
    return (
        <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
            <div className="flex items-center">
                {Icon ? (
                    <Icon size={16} className={`mr-2 ${passed ? 'text-emerald-500' : 'text-rose-500'}`} />
                ) : (
                    passed ? 
                    <CheckCircle size={16} className="text-emerald-500 mr-2" /> : 
                    <XCircle size={16} className="text-slate-300 mr-2" />
                )}
                <span className={`text-sm font-medium ${!passed && failColor ? failColor : 'text-slate-700'}`}>{label}</span>
            </div>
            <span className="text-xs text-slate-500">{detail}</span>
        </div>
    );
}

