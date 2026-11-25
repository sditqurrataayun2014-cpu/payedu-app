import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  AlertTriangle, CheckCircle2, HelpCircle, Info,
  ShieldAlert, Trash2, X, XCircle
} from 'lucide-react';
import { registerDialogListener } from '../utils/dialogService';
import { registerBackModal } from '../services/navigationService';

const VARIANT_STYLES = {
  danger: {
    bar: 'from-rose-500 via-red-500 to-rose-600',
    iconBg: 'from-rose-500 to-red-600 shadow-rose-500/30',
    tagColor: 'text-rose-600 dark:text-rose-400',
    tagLabel: 'TINDAKAN PERMANEN',
    btnBg: 'from-rose-600 via-red-600 to-rose-700 hover:from-rose-700 hover:to-red-700 shadow-rose-600/30',
    Icon: Trash2,
  },
  error: {
    bar: 'from-rose-500 via-red-500 to-rose-600',
    iconBg: 'from-rose-500 to-red-600 shadow-rose-500/30',
    tagColor: 'text-rose-600 dark:text-rose-400',
    tagLabel: 'PEMBERITAHUAN PENTING',
    btnBg: 'from-rose-600 via-red-600 to-rose-700 hover:from-rose-700 hover:to-red-700 shadow-rose-600/30',
    Icon: XCircle,
  },
  warning: {
    bar: 'from-amber-400 via-orange-500 to-amber-500',
    iconBg: 'from-amber-400 to-orange-500 shadow-amber-500/30',
    tagColor: 'text-amber-600 dark:text-amber-400',
    tagLabel: 'PERHATIAN SISTEM',
    btnBg: 'from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/30',
    Icon: AlertTriangle,
  },
  success: {
    bar: 'from-emerald-400 via-teal-500 to-emerald-600',
    iconBg: 'from-emerald-500 to-teal-600 shadow-emerald-500/30',
    tagColor: 'text-emerald-600 dark:text-emerald-400',
    tagLabel: 'KONFIRMASI BERHASIL',
    btnBg: 'from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-600/30',
    Icon: CheckCircle2,
  },
  primary: {
    bar: 'from-blue-500 via-indigo-500 to-blue-600',
    iconBg: 'from-blue-500 to-indigo-600 shadow-blue-500/30',
    tagColor: 'text-blue-600 dark:text-blue-400',
    tagLabel: 'KONFIRMASI SISTEM',
    btnBg: 'from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 shadow-blue-600/30',
    Icon: HelpCircle,
  },
  info: {
    bar: 'from-sky-500 via-blue-500 to-indigo-600',
    iconBg: 'from-sky-500 to-blue-600 shadow-sky-500/30',
    tagColor: 'text-sky-600 dark:text-sky-400',
    tagLabel: 'INFORMASI SISTEM',
    btnBg: 'from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 shadow-blue-600/30',
    Icon: Info,
  },
};

export default function GlobalDialogHost({ appName }) {
  const [queue, setQueue] = useState([]);
  const primaryBtnRef = useRef(null);

  useEffect(() => {
    return registerDialogListener((dialogItem) => {
      setQueue((prev) => [...prev, dialogItem]);
    });
  }, []);

  const current = queue[0] || null;

  const closeCurrent = useCallback((result) => {
    setQueue((prev) => {
      if (prev.length === 0) return prev;
      const [active, ...rest] = prev;
      if (typeof active.resolve === 'function') {
        active.resolve(active.kind === 'confirm' ? Boolean(result) : undefined);
      }
      return rest;
    });
  }, []);

  // Android hardware back button & Escape key
  useEffect(() => {
    if (!current) return;
    const unregisterBack = registerBackModal(() => closeCurrent(false));
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCurrent(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // Fokus halus ke tombol utama agar aksesibilitas keyboard nyaman
    const t = setTimeout(() => {
      primaryBtnRef.current?.focus();
    }, 60);

    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKeyDown);
      unregisterBack();
    };
  }, [current, closeCurrent]);

  if (!current) return null;

  const isConfirm = current.kind === 'confirm';
  const style = VARIANT_STYLES[current.variant] || (isConfirm ? VARIANT_STYLES.primary : VARIANT_STYLES.info);
  const IconComp = style.Icon;
  const isDangerConfirm = isConfirm && current.variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeCurrent(false);
        }
      }}
    >
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-[0_25px_70px_-15px_rgba(0,0,0,0.5)] border border-slate-200/80 dark:border-slate-700/80 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Garis Aksen Atas */}
        <div className={`h-1.5 w-full bg-gradient-to-r ${style.bar}`} />

        {/* Konten Utama */}
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br ${style.iconBg} shadow-lg flex items-center justify-center shrink-0 text-white`}>
              <IconComp size={22} strokeWidth={2.4} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-black uppercase tracking-widest ${style.tagColor}`}>
                  {style.tagLabel}
                </span>
                {appName && (
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 truncate">
                    • {appName}
                  </span>
                )}
              </div>
              <h3
                id="global-dialog-title"
                className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight leading-snug mt-0.5"
              >
                {current.title}
              </h3>
            </div>

            <button
              type="button"
              onClick={() => closeCurrent(false)}
              aria-label="Tutup dialog"
              className="p-1.5 -mt-1 -mr-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          {/* Kotak Pesan */}
          <div className="mt-4 bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/75 dark:border-slate-700/75 rounded-2xl p-3.5 sm:p-4 max-h-[45vh] overflow-y-auto custom-scrollbar">
            <p className="text-xs sm:text-[13.5px] text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line font-medium">
              {current.message}
            </p>
          </div>

          {isDangerConfirm && (
            <div className="mt-3 px-3 py-2 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-800/50 flex items-center gap-2 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
              <ShieldAlert size={14} className="shrink-0" />
              <span>Tindakan ini bersifat permanen. Pastikan Anda benar-benar yakin sebelum melanjutkan.</span>
            </div>
          )}
        </div>

        {/* Tombol Aksi */}
        <div className="px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50/80 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-2.5">
          {isConfirm ? (
            <>
              <button
                type="button"
                onClick={() => closeCurrent(false)}
                className="px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] transition-all cursor-pointer text-center"
              >
                {current.cancelText || 'Batal'}
              </button>
              <button
                ref={primaryBtnRef}
                type="button"
                onClick={() => closeCurrent(true)}
                className={`px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm text-white bg-gradient-to-r ${style.btnBg} shadow-lg active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5`}
              >
                <IconComp size={15} strokeWidth={2.5} />
                <span>{current.confirmText || 'Ya, Lanjutkan'}</span>
              </button>
            </>
          ) : (
            <button
              ref={primaryBtnRef}
              type="button"
              onClick={() => closeCurrent(true)}
              className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm text-white bg-gradient-to-r ${style.btnBg} shadow-lg active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5`}
            >
              <span>{current.buttonText || 'Mengerti'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
