import React from 'react';

export const ViewLoader = ({ title = 'Memuat Modul...' }) => (
  <div className="flex flex-col items-center justify-center min-h-[320px] p-8 text-center animate-in fade-in duration-300">
    <div className="relative w-12 h-12 mb-3">
      <div className="absolute inset-0 rounded-full border-4 border-teal-200 dark:border-teal-900/40"></div>
      <div className="absolute inset-0 rounded-full border-4 border-teal-600 border-t-transparent animate-spin"></div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-2 h-2 bg-teal-600 rounded-full animate-ping"></div>
      </div>
    </div>
    <p className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 tracking-wide">{title}</p>
    <p className="text-[11px] text-slate-400 mt-0.5">Mengunduh komponen sistem terenkripsi...</p>
  </div>
);

export default ViewLoader;
