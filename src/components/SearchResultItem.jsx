import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Music2, Radio, PlayCircle, ExternalLink, Video } from 'lucide-react';
import { cn } from '../utils/cn';

const SearchResultItem = React.memo(({ item, idx, setUrl, setSearchResults, setPreviewItem }) => {
  const [imgError, setImgError] = useState(false);

  const getPlatformIcon = () => {
    switch (item.platform) {
      case 'spotify':
        return <div className="w-4 h-4 bg-[#1DB954] rounded-full flex items-center justify-center shrink-0"><Music2 size={10} className="text-black" /></div>;
      case 'soundcloud':
        return <div className="w-4 h-4 bg-[#FF5500] rounded-full flex items-center justify-center shrink-0"><Radio size={10} className="text-white" /></div>;
      case 'youtube':
        return <div className="w-4 h-4 bg-[#FF0000] rounded-full flex items-center justify-center shrink-0"><PlayCircle size={10} className="text-white" /></div>;
      default:
        return <div className="w-4 h-4 bg-primary rounded-full flex items-center justify-center shrink-0"><Video size={10} className="text-black" /></div>;
    }
  };

  const getPlatformBadgeStyle = () => {
    switch (item.platform) {
      case 'spotify': return 'bg-[#1DB954]/20 text-[#1DB954]';
      case 'soundcloud': return 'bg-[#FF5500]/20 text-[#FF5500]';
      case 'youtube': return 'bg-red-500/20 text-red-500';
      default: return 'bg-primary/20 text-primary';
    }
  };

  return (
    <motion.div
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.2 }}
      onClick={() => {
        setUrl(item.url);
        setSearchResults([]);
      }}
      className="flex items-center gap-3 p-2 hover:bg-white/10 rounded-lg transition-all group cursor-pointer"
    >
      <div className="relative shrink-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); setPreviewItem(item); }}>
        {item.thumbnail && !imgError ? (
          <img 
            src={item.thumbnail} 
            onError={() => setImgError(true)}
            className="w-24 h-14 object-cover rounded-md shadow-lg bg-black/40" 
            alt={item.title || "thumbnail"} 
          />
        ) : (
          <div className="w-24 h-14 rounded-md shadow-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 flex items-center justify-center">
            <Music2 size={20} className="text-primary/60" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md">
          <PlayCircle size={28} className="text-white drop-shadow-lg" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {getPlatformIcon()}
          <div className="text-sm font-bold truncate">{item.title}</div>
        </div>
        <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-1 font-bold">
          <span className="bg-white/5 px-1.5 py-0.5 rounded uppercase tracking-tighter">
            {item.duration ? `${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}` : '--:--'}
          </span>
          <span className={cn(
            "px-1.5 py-0.5 rounded uppercase tracking-tighter text-[8px]",
            getPlatformBadgeStyle()
          )}>
            {item.platform}
          </span>
          <span className="truncate uppercase opacity-60 ml-1">{item.uploader}</span>
        </div>
      </div>
      <ExternalLink size={14} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
    </motion.div>
  );
});

SearchResultItem.displayName = 'SearchResultItem';

export default SearchResultItem;
