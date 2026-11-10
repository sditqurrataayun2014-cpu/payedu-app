import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronUp } from 'lucide-react';

export default function TableWrapper({ children, className = "" }) {
  const containerRef = useRef(null);
  const [isScrolledRight, setIsScrolledRight] = useState(false);
  const [isScrolledDown, setIsScrolledDown] = useState(false);

  const handleScroll = () => {
    if (containerRef.current) {
      const scrolledRight = containerRef.current.scrollLeft > 35;
      const scrolledDown = containerRef.current.scrollTop > 45;
      if (scrolledRight !== isScrolledRight) {
        setIsScrolledRight(scrolledRight);
      }
      if (scrolledDown !== isScrolledDown) {
        setIsScrolledDown(scrolledDown);
      }
    }
  };

  const scrollToStart = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="relative group/table my-2">
      {/* Tombol Melayang Navigasi Cepat (Kembali ke Kiri / Ke Atas) */}
      {(isScrolledRight || isScrolledDown) && (
        <div className="sticky left-2 top-2 z-50 flex items-center gap-2 mb-2 animate-in fade-in duration-200 pointer-events-auto">
          {isScrolledRight && (
            <button
              type="button"
              onClick={scrollToStart}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold shadow-lg shadow-blue-500/30 transition-transform active:scale-95 border border-white/20 cursor-pointer"
              title="Kembali ke kolom pertama"
            >
              <ChevronLeft size={15} /> Kembali ke Kiri
            </button>
          )}
          {isScrolledDown && (
            <button
              type="button"
              onClick={scrollToTop}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/90 hover:bg-slate-900 text-white rounded-full text-xs font-bold shadow-lg backdrop-blur-md transition-transform active:scale-95 border border-white/10 cursor-pointer"
              title="Kembali ke baris teratas"
            >
              <ChevronUp size={15} /> Ke Atas
            </button>
          )}
        </div>
      )}
      
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className={`overflow-auto scrollbar-thin rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
export { TableWrapper };
