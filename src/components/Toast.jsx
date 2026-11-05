import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

const Toast = ({ message, visible }) => {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] bg-primary/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl border border-white/20 font-bold uppercase tracking-widest text-[10px] flex items-center gap-3"
        >
          <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center">
            <Check size={12} />
          </div>
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Toast;
