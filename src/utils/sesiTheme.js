export const getSesiTheme = (sesi) => {
  const name = String(sesi?.nama || sesi?.id || sesi || '').toLowerCase();
  
  // Sesi Sore / Halaqoh (Nuansa Malam/Ungu/Indigo/Quran yang Tenang & Elegan)
  if (name.includes('sore') || name.includes('halaqoh') || name.includes('malam') || name.includes('maghrib') || name.includes('isya')) {
    return {
      type: 'sore',
      namaSingkat: 'Sore (Halaqoh)',
      iconEmoji: '🌙',
      bgActive: 'bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-700 text-white shadow-md shadow-purple-500/30 ring-2 ring-purple-400 border border-purple-400',
      bgInactive: 'bg-purple-50 text-purple-800 hover:bg-purple-100 hover:text-purple-900 dark:bg-purple-950/60 dark:text-purple-300 dark:hover:bg-purple-900/80 border border-purple-300 dark:border-purple-700 font-bold',
      tabBorder: 'border-purple-300 dark:border-purple-700',
      badge: 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800',
      badgeText: 'text-purple-700 dark:text-purple-300',
      cardGradient: 'from-indigo-800 via-purple-800 to-violet-950',
      dotColor: 'bg-purple-400',
      dotPulse: 'bg-purple-400 animate-pulse',
      ringColor: 'ring-purple-500',
      accentColor: 'purple'
    };
  }
  
  // Sesi Rapat / Kajian (Nuansa Rose / Ruby / Pink yang Elegan & Tegas)
  if (name.includes('rapat') || name.includes('kajian') || name.includes('musyawarah') || name.includes('evaluasi') || name.includes('workshop') || name.includes('briefing') || name.includes('khusus')) {
    return {
      type: 'rapat',
      namaSingkat: 'Rapat / Kajian',
      iconEmoji: '👥',
      bgActive: 'bg-gradient-to-r from-rose-600 via-pink-600 to-rose-700 text-white shadow-md shadow-rose-500/30 ring-2 ring-rose-400 border border-rose-400',
      bgInactive: 'bg-rose-50 text-rose-800 hover:bg-rose-100 hover:text-rose-900 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/80 border border-rose-300 dark:border-rose-700 font-bold',
      tabBorder: 'border-rose-300 dark:border-rose-700',
      badge: 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
      badgeText: 'text-rose-700 dark:text-rose-300',
      cardGradient: 'from-rose-800 via-pink-800 to-red-950',
      dotColor: 'bg-rose-400',
      dotPulse: 'bg-rose-400 animate-pulse',
      ringColor: 'ring-rose-500',
      accentColor: 'rose'
    };
  }

  // Sesi Siang / Dzuhur (Nuansa Amber / Oranye Surya Cerah)
  if (name.includes('siang') || name.includes('dzuhur')) {
    return {
      type: 'siang',
      namaSingkat: 'Siang',
      iconEmoji: '☀️',
      bgActive: 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white shadow-md shadow-amber-500/30 ring-2 ring-amber-400 border border-amber-400',
      bgInactive: 'bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900/80 border border-amber-300 dark:border-amber-700 font-bold',
      tabBorder: 'border-amber-300 dark:border-amber-700',
      badge: 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
      badgeText: 'text-amber-700 dark:text-amber-300',
      cardGradient: 'from-amber-700 via-orange-700 to-amber-950',
      dotColor: 'bg-orange-400',
      dotPulse: 'bg-orange-400 animate-pulse',
      ringColor: 'ring-amber-500',
      accentColor: 'amber'
    };
  }

  // Default: Sesi Pagi (KBM) (Nuansa Hijau Emerald / Toska Segar)
  return {
    type: 'pagi',
    namaSingkat: 'Pagi (KBM)',
    iconEmoji: '🌅',
    bgActive: 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400 border border-emerald-400',
    bgInactive: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/80 border border-emerald-300 dark:border-emerald-700 font-bold',
    tabBorder: 'border-emerald-300 dark:border-emerald-700',
    badge: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    cardGradient: 'from-emerald-800 via-teal-800 to-cyan-950',
    dotColor: 'bg-emerald-400',
    dotPulse: 'bg-emerald-400 animate-pulse',
    ringColor: 'ring-emerald-500',
    accentColor: 'emerald'
  };
};
