import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronUp } from 'lucide-react';

export default function TableWrapper({ children, className = "" }) {
  const containerRef = useRef(null);
  const [isScrolledRight, setIsScrolledRight] = useState(false);

  const handleScroll = () => {
    if (containerRef.current) {
      const scrolledRight = containerRef.current.scrollLeft > 35;
      if (scrolledRight !== isScrolledRight) {
        setIsScrolledRight(scrolledRight);
      }
    }
  };

  const scrollToStart = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (containerRef.current) {
      containerRef.current.parentElement?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="relative group/table my-3">
      {/* Tombol Melayang Kembali ke Kiri & Ke Atas jika Tabel Di-scroll ke Kanan di HP */}
      {isScrolledRight && (
        <div className="sticky left-2 top-2 z-30 flex items-center gap-2 mb-2 animate-in fade-in duration-200">
          <button
            type="button"
            onClick={scrollToStart}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold shadow-lg shadow-blue-500/30 transition-transform active:scale-95 border border-white/20 cursor-pointer"
          >
            <ChevronLeft size={16} /> Kembali ke Kiri
          </button>
          <button
            type="button"
            onClick={scrollToTop}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800/90 hover:bg-slate-900 text-white rounded-full text-xs font-bold shadow-lg backdrop-blur-md transition-transform active:scale-95 border border-white/10 cursor-pointer"
          >
            <ChevronUp size={16} /> Ke Atas
          </button>
        </div>
      )}
      
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className={`overflow-x-auto scrollbar-thin rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
export { TableWrapper };

