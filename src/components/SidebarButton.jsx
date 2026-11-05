import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';

export function SidebarButton({ active, onClick, icon, label, badge }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-4 rounded-2xl transition-all relative overflow-hidden group w-full text-left",
        active ? 'text-primary font-semibold' : 'text-slate-500 hover:text-white'
      )}
    >
      {active && <motion.div layoutId="sidebar-active-bg" className="absolute inset-0 bg-primary/5 z-0" />}
      <span className="relative z-10">{icon}</span>
      <span className="relative z-10 uppercase text-[9px] font-semibold tracking-wider">{label}</span>
      {badge != null && (
        <span className="relative z-10 ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary text-black text-[8px] font-black px-1">
          {badge}
        </span>
      )}
      {active && <motion.div layoutId="active-marker" className="absolute left-0 w-1.5 h-6 bg-primary rounded-r-full" />}
    </button>
  );
}

export function FormatBtn({ active, onClick, icon, label, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
          "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all font-semibold uppercase text-[9px] tracking-wider border border-transparent",
          disabled
            ? 'opacity-30 cursor-not-allowed text-slate-600'
            : active
              ? 'bg-primary text-white shadow-xl shadow-primary/10'
              : 'text-slate-500 hover:bg-white/5 hover:text-white'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
