import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Music2, SkipBack, Play, Pause, SkipForward, VolumeX, Volume2, X } from 'lucide-react';

const AudioPlayer = ({ player, onClose }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!player.src || !audioRef.current) return;
    audioRef.current.src = player.src;
    audioRef.current.volume = volume;
    audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [player.src]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (s) => {
    const m = Math.floor((s || 0) / 60);
    const sec = Math.floor((s || 0) % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const seek = (delta) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + delta));
  };

  const onVolumeChange = (v) => {
    setVolume(v);
    setIsMuted(v === 0);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const next = !isMuted;
    setIsMuted(next);
    audioRef.current.volume = next ? 0 : volume;
  };

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed bottom-0 left-0 right-0 z-[90] flex items-center gap-4 px-6 py-3 backdrop-blur-xl border-t border-white/10 shadow-2xl"
      style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(15,23,42,0.95) 60%, rgba(124,58,237,0.08) 100%)' }}
    >
      <audio
        ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Track info */}
      <div className="flex items-center gap-3 min-w-0 w-44 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
          <Music2 size={16} className="text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-white truncate">{player.title || 'Bilinmeyen'}</div>
          <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">MP3</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col flex-1 items-center gap-1.5 min-w-0">
        <div className="flex items-center gap-3">
          <button onClick={() => seek(-10)} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
            <SkipBack size={16} />
          </button>
          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30 hover:bg-primary/80 transition-all"
          >
            {isPlaying ? <Pause size={18} className="text-black" /> : <Play size={18} className="text-black ml-0.5" />}
          </button>
          <button onClick={() => seek(10)} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
            <SkipForward size={16} />
          </button>
        </div>

        {/* Scrubber */}
        <div className="flex items-center gap-2 w-full max-w-md">
          <span className="text-[10px] text-slate-500 font-bold tabular-nums w-8 text-right">{fmt(currentTime)}</span>
          <div className="flex-1 relative group">
            <input
              type="range" min={0} max={duration || 1} step={0.5}
              value={currentTime}
              onChange={e => {
                if (audioRef.current) {
                  audioRef.current.currentTime = Number(e.target.value);
                  setCurrentTime(Number(e.target.value));
                }
              }}
              className="w-full h-1 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #00D4FF ${(currentTime/(duration||1))*100}%, rgba(255,255,255,0.1) 0%)`,
                accentColor: '#00D4FF'
              }}
            />
          </div>
          <span className="text-[10px] text-slate-500 font-bold tabular-nums w-8">{fmt(duration)}</span>
        </div>
      </div>

      {/* Volume + Close */}
      <div className="flex items-center gap-3 w-36 shrink-0 justify-end">
        <button onClick={toggleMute} className="text-slate-400 hover:text-white transition-colors">
          {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range" min={0} max={1} step={0.05}
          value={isMuted ? 0 : volume}
          onChange={e => onVolumeChange(Number(e.target.value))}
          className="w-20 h-1 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #00D4FF ${(isMuted ? 0 : volume)*100}%, rgba(255,255,255,0.1) 0%)`,
            accentColor: '#00D4FF'
          }}
        />
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-slate-400 hover:text-white transition-all border border-white/10">
          <X size={12} />
        </button>
      </div>
    </motion.div>
  );
};

export default AudioPlayer;
