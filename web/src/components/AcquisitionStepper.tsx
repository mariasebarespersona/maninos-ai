import React from 'react';
import { CheckCircle2, Circle, Clock, AlertCircle } from 'lucide-react';
import { AcquisitionStage } from '@/types/maninos';

interface Step {
  id: string;
  label: string;
  status: 'completed' | 'current' | 'pending' | 'rejected';
}

interface AcquisitionStepperProps {
  currentStage: AcquisitionStage;
  status: string; // To check for 'Rejected'
}

export function AcquisitionStepper({ currentStage, status }: AcquisitionStepperProps) {
  const steps: { id: AcquisitionStage | 'contract'; label: string }[] = [
    { id: 'documents_pending' as AcquisitionStage, label: '0. Documents' },
    { id: 'initial', label: '1. Initial Check (70%)' },
    { id: 'passed_70_rule', label: '2. Inspection' },
    { id: 'inspection_done', label: '3. Repairs Calc' },
    { id: 'passed_80_rule', label: '4. Final Review (80%)' },
    // 'contract' is conceptually the final goal, represented by passed_80_rule + decision
    { id: 'contract' as any, label: '5. Contract' }, 
  ];

  // Helper to determine step status
  const getStepStatus = (stepId: string, index: number): Step['status'] => {
    // Map database stages to indices for linear comparison
    const stageOrder: Record<string, number> = {
      'documents_pending': 0,
      'initial': 1,
      'passed_70_rule': 2,
      'inspection_done': 3,
      'passed_80_rule': 4,
      'contract_generated': 5,
      'rejected': -1 // Special case
    };

    const currentIndex = stageOrder[currentStage] ?? 0;

    if (status === 'Rejected') return 'rejected';

    if (index < currentIndex) return 'completed';
    if (index === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <div className="w-full py-4 px-2 bg-white border-b border-slate-200">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {steps.map((step, index) => {
          const stepStatus = getStepStatus(step.id, index);
          
          return (
            <div key={step.id} className="flex flex-col items-center relative z-10 group">
              <div className="flex items-center justify-center transition-all duration-300">
                {stepStatus === 'completed' && (
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center border border-emerald-200">
                    <CheckCircle2 size={18} />
                  </div>
                )}
                {stepStatus === 'current' && (
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md ring-4 ring-blue-100">
                    <Clock size={18} className="animate-pulse" />
                  </div>
                )}
                {stepStatus === 'pending' && (
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-200">
                    <Circle size={18} />
                  </div>
                )}
                {stepStatus === 'rejected' && (
                  <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center border border-rose-200">
                    <AlertCircle size={18} />
                  </div>
                )}
              </div>
              
              <span className={`mt-2 text-xs font-medium max-w-[80px] text-center ${
                stepStatus === 'current' ? 'text-blue-700' : 
                stepStatus === 'completed' ? 'text-emerald-700' : 
                'text-slate-400'
              }`}>
                {step.label}
              </span>

              {/* Connecting Line */}
              {index < steps.length - 1 && (
                <div className={`absolute top-4 left-1/2 h-[3px] -z-10 ${
                  stepStatus === 'completed' 
                    ? 'bg-emerald-400' 
                    : 'bg-slate-200'
                }`} style={{ width: 'calc(100% + 2rem)', transform: 'translateX(50%)' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

