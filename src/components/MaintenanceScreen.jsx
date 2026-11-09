import React from 'react';
import { CheckCircle, Clock, LogOut, Send, Wrench } from 'lucide-react';

export default function MaintenanceScreen({ onLogout, appName, schoolName, appVersion }) {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-md w-full bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center relative z-10 animate-in zoom-in-95 duration-300">
        <div className="w-20 h-20 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto mb-6 shadow-inner animate-pulse">
           <Wrench size={40} />
        </div>

        <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-[11px] font-extrabold uppercase tracking-widest rounded-full border border-amber-500/30 inline-block mb-3">
           Mode Pemeliharaan Sistem
        </span>

        <h1 className="text-xl sm:text-2xl font-black tracking-tight mb-2 text-white">
           Aplikasi Dalam Perbaikan
        </h1>
        <p className="text-xs text-slate-400 font-medium mb-6 leading-relaxed">
           Sistem Penggajian & Portal Pegawai <strong className="text-slate-200">{schoolName || 'SD-IT QA'}</strong> saat ini sedang dalam pemeliharaan rutin oleh Administrator.
        </p>

        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/50 mb-6 text-left space-y-2">
           <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
              <CheckCircle size={14} className="text-amber-400 shrink-0"/>
              <span>Data gaji Anda aman & tersimpan dengan rapi.</span>
           </div>
           <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
              <Clock size={14} className="text-amber-400 shrink-0"/>
              <span>Akses portal akan dibuka kembali setelah perbaikan selesai.</span>
           </div>
        </div>

        <div className="flex flex-col gap-2.5">
           <a 
             href="https://api.whatsapp.com/send?text=Halo%20Admin,%20saya%20ingin%20menanyakan%20status%20pemeliharaan%20aplikasi" 
             target="_blank" 
             rel="noopener noreferrer"
             className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
           >
              <Send size={16} /> Hubungi Admin TU via WA
           </a>
           <button 
             onClick={onLogout}
             className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
           >
              <LogOut size={16} /> Keluar Sementara
           </button>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-700/50 text-[10px] text-slate-500">
           <p>Desain Aplikasi | Muhamad Husni Akbar</p>
           <p className="font-bold text-blue-400 mt-0.5">{appVersion || 'v1.2.5'}</p>
        </div>
      </div>
    </div>
  );
}

// --- MAIN LAYOUT & NAVIGATION ---
export { MaintenanceScreen };
