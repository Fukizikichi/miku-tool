import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const DynamicMikuLogo = ({ isPlaying, isDownloading }) => {
  return (
    <motion.div 
      animate={{ 
        y: [0, -3, 0],
      }}
      transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
      className="w-16 h-16 flex items-center justify-center shrink-0 relative overflow-visible"
    >
      {/* Background Glow */}
      <AnimatePresence>
        {(isPlaying || isDownloading) && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.3, scale: 1.6 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ repeat: Infinity, duration: 2, repeatType: "reverse" }}
            className="absolute inset-0 bg-primary blur-3xl rounded-full z-0 pointer-events-none"
          />
        )}
      </AnimatePresence>

      <svg viewBox="0 0 40 40" className="w-14 h-14 z-10 overflow-visible" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="miku-hair-main" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#39C5BB" />
            <stop offset="100%" stopColor="#1E90FF" />
          </linearGradient>
          <filter id="miku-glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        {/* Left Twin Tail Group */}
        <motion.g
          animate={{ rotate: isPlaying || isDownloading ? [0, -12, 0, -12, 0] : [0, -2, 0, -2, 0] }}
          style={{ transformOrigin: '14px 15px' }}
          transition={{ repeat: Infinity, duration: isPlaying || isDownloading ? 1.5 : 4, ease: "easeInOut" }}
        >
          <path d="M14 15C14 15 2 15 2 32C2 38 12 38 12 32V15Z" fill="url(#miku-hair-main)" />
          <rect x="10" y="11" width="5" height="7" rx="1" fill="#FF5D8F" filter="url(#miku-glow)" />
        </motion.g>

        {/* Right Twin Tail Group */}
        <motion.g
          animate={{ rotate: isPlaying || isDownloading ? [0, 12, 0, 12, 0] : [0, 2, 0, 2, 0] }}
          style={{ transformOrigin: '26px 15px' }}
          transition={{ repeat: Infinity, duration: isPlaying || isDownloading ? 1.5 : 4, ease: "easeInOut", delay: 0.1 }}
        >
          <path d="M26 15C26 15 38 15 38 32C38 38 28 38 28 32V15Z" fill="url(#miku-hair-main)" />
          <rect x="25" y="11" width="5" height="7" rx="1" fill="#FF5D8F" filter="url(#miku-glow)" />
        </motion.g>

        {/* Head Group - Refined Anime Shape (V-Line) */}
        <g className="head-group">
          {/* Face (Realistic Skin Tone - Pale Porcelain) */}
          <path d="M12 15C12 9 15 7 20 7C25 7 28 9 28 15C28 22 25 29 20 29.5C15 29 12 22 12 15Z" fill="#FFF9F0" />
          
          {/* Hair Bangs (Fringe) - Adjusted to new head width */}
          <path d="M12 15C12 9 15 7 20 7C25 7 28 9 28 15L27 19.5L20 17.5L13 19.5L12 15Z" fill="url(#miku-hair-main)" />
          <path d="M19.5 7V17.5" stroke="url(#miku-hair-main)" strokeWidth="1.5" strokeLinecap="round" />
          
          {/* Cyber Eyes - Centered horizontally in the new face shape */}
          <motion.g 
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            {/* Left Eye */}
            <path d="M15.5 20.5L17.5 22.5L15.5 24.5" stroke="#39C5BB" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            {/* Right Eye */}
            <path d="M24.5 20.5L22.5 22.5L24.5 24.5" stroke="#39C5BB" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </motion.g>

          {/* Animated Mouth (Smile during download) */}
          <path
            d={isDownloading ? "M17 25 Q20 28 23 25" : "M18.5 26 Q20 26.5 21.5 26"}
            stroke="#FF5D8F"
            strokeWidth="0.8"
            strokeLinecap="round"
            fill={isDownloading ? "rgba(255,93,143,0.1)" : "none"}
          />
        </g>
        
        {/* Visible 01 Tattoo */}
        <motion.text 
            x="33" y="32" fill="#FF5D8F" fontSize="7" fontWeight="900" textAnchor="middle" style={{ fontFamily: 'sans-serif', filter: 'drop-shadow(0 0 2px rgba(255,93,143,0.5))' }}
            animate={isDownloading ? { opacity: [0.5, 1, 0.5], scale: [1, 1.1, 1] } : { opacity: 0.8 }}
            transition={{ repeat: Infinity, duration: 0.8 }}
        >01</motion.text>

        {/* Energy Flow Rings (Active Only) */}
        {isDownloading && (
            <motion.g>
                {[0, 1, 2].map(i => (
                    <motion.circle
                        key={i}
                        cx="20" cy="20" r="19"
                        stroke="#39C5BB"
                        strokeWidth="1"
                        strokeDasharray="4 10"
                        initial={{ rotate: 0, opacity: 0 }}
                        animate={{ rotate: 360, opacity: [0, 0.7, 0], scale: [0.8, 1.4, 0.8] }}
                        transition={{ repeat: Infinity, duration: 2.5, delay: i * 0.8, ease: "linear" }}
                    />
                ))}
            </motion.g>
        )}
      </svg>
    </motion.div>
  );
};

export default DynamicMikuLogo;
