import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Briefcase, Calculator, CheckCircle, ChevronDown, Clock, Download,
  Edit, FileText, GraduationCap, Info, Lock, PlusCircle, Printer,
  Search, Star, Trash, Trash2, TrendingUp, Users, Wallet, X
} from 'lucide-react';

import SlipDocument from '../../components/SlipDocument';
import {
  EDU_RATES, FormattedRupiahInput, INSENTIF_LIST, JOB_CATEGORIES,
  JOB_ROLES, KINERJA_LEVELS, KOMPETENSI_FIELDS, KOMPETENSI_LEVELS,
  POTONGAN_LIST, TENURE_RATES, calculatePayroll, exportToPDF,
  formatRp, formatTeacherName, getFormattedPeriod, isTeacherActive
} from '../../utils/payrollUtils';

export default function GajiView({ teachers, setTeachers, externalSelectedId, setExternalSelectedId, externalSelectedTab, setExternalSelectedTab, settings, user, saveAuditLog }) {
  const [activeTabGaji, setActiveTabGaji] = useState('masaKerja');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua');

  // 🪄 TAMBALAN CERDAS: State untuk Pratinjau Slip Gaji
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const bulan = getFormattedPeriod(settings?.payrollPeriod);

  // 🪄 FITUR BARU: State untuk Potongan Massal
  const [isMassPotonganOpen, setIsMassPotonganOpen] = useState(false);
  const [massForm, setMassForm] = useState({ ket: 'Potongan / Iuran Wajib', nominal: '', targetGroup: 'Semua' });
  const [excludedIds, setExcludedIds] = useState([]);
  const [massSearch, setMassSearch] = useState('');
  const [isSavingMass, setIsSavingMass] = useState(false);

  // 🪄 FITUR BARU: Menghitung daftar target potongan massal secara dinamis (Hanya Pegawai Aktif)
  const targetedTeachers = useMemo(() => {
      return teachers.filter(t => {
          if (!isTeacherActive(t)) return false;
          if (massForm.targetGroup === 'L' && t.gender !== 'L') return false;
          if (massForm.targetGroup === 'P' && t.gender !== 'P') return false;
          if (massSearch && !t.name.toLowerCase().includes(massSearch.toLowerCase()) && !t.nipy.includes(massSearch)) return false;
          return true;
      });
  }, [teachers, massForm.targetGroup, massSearch]);

  const toggleExclude = (id) => {
      setExcludedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSaveMassPotongan = (e) => {
      e.preventDefault();
      if(!massForm.ket || !massForm.nominal) return;
      setIsSavingMass(true);
      setTimeout(() => {
          let appliedCount = 0;
          setTeachers(prev => prev.map(t => {
              let match = false;
              if (massForm.targetGroup === 'Semua') match = true;
              else if (massForm.targetGroup === 'L' && t.gender === 'L') match = true;
              else if (massForm.targetGroup === 'P' && t.gender === 'P') match = true;

              // Abaikan jika masuk daftar Exception
              if (excludedIds.includes(t.id)) match = false;

              if (match) {
                  appliedCount++;
                  const p = t.payroll || {};
                  const newPot = [...(p.potonganLainnya || []), { ket: massForm.ket, nominal: Number(massForm.nominal) }];
                  
                  // Rekam jejak di Audit Log jika disetel
                  if (saveAuditLog) {
                     saveAuditLog(t, `Potongan Massal: ${massForm.ket}`, 0, Number(massForm.nominal));
                  }
                  
                  return { ...t, payroll: { ...p, potonganLainnya: newPot } };
              }
              return t;
          }));
          setIsSavingMass(false);
          setIsMassPotonganOpen(false);
          setMassForm({ ket: 'Potongan / Iuran Wajib', nominal: '', targetGroup: 'Semua' });
          setExcludedIds([]);
          setMassSearch('');
          alert(`Luar Biasa! Potongan massal "${massForm.ket}" berhasil diterapkan kepada ${appliedCount} pegawai.`);
      }, 800);
  };

  useEffect(() => {
    if (externalSelectedId) {
      // 🪄 TAMBALAN CERDAS: Mencegat ID dan menukarnya dengan Nama Asli Pegawai
      const targetTeacher = teachers.find(t => t.id === externalSelectedId);
      if (targetTeacher) {
         setSearchTerm(targetTeacher.name); // Menaruh nama asli di kolom pencarian
      } else {
         setSearchTerm(externalSelectedId); // Fallback jika nama tidak ditemukan
      }
      if (setExternalSelectedId) setExternalSelectedId(null);
    }
    
    // 🪄 TAMBALAN CERDAS: Menangkap instruksi untuk membuka tab secara spesifik
    if (externalSelectedTab) {
      setActiveTabGaji(externalSelectedTab);
      if (setExternalSelectedTab) setExternalSelectedTab(null);
    }
  }, [externalSelectedId, setExternalSelectedId, externalSelectedTab, setExternalSelectedTab, teachers]);

  // FUNGSI BARU: Mengubah TMT langsung di tabel Gaji dan mereset override nominal
  const handleInlineTmtChange = (teacherId, newYear) => {
    const targetTeacher = teachers.find(t => t.id === teacherId);
    if (!targetTeacher) return;
    
    const oldDate = new Date(targetTeacher.tmt || new Date());
    const oldYear = oldDate.getFullYear();
    oldDate.setFullYear(newYear);
    const newTmt = oldDate.toISOString().split('T')[0];

    if (saveAuditLog) {
       saveAuditLog(targetTeacher, 'Tahun Masuk (TMT)', oldYear, newYear);
    }

    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        return {
          ...t,
          tmt: newTmt,
          payroll: {
            ...(t.payroll || {}),
            tunjanganMasaKerjaManual: '' // Kunci: Reset nominal agar merujuk otomatis ke Master Tarif
          }
        };
      }
      return t;
    }));
  };

  const handleUpdatePayrollObj = (teacherId, objKey, field, value) => {
    const safeValue = (typeof value === 'number' && isNaN(value)) ? 0 : value;
    const targetTeacher = teachers.find(t => t.id === teacherId);
    if (targetTeacher && saveAuditLog) {
        saveAuditLog(targetTeacher, `${objKey} (${field})`, targetTeacher.payroll?.[objKey]?.[field] || 0, safeValue);
    }
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        const p = t.payroll || {};
        const childObj = p[objKey] || {};
        return { ...t, payroll: { ...p, [objKey]: { ...childObj, [field]: safeValue } } };
      }
      return t;
    }));
  };

  const handleArrayUpdate = (teacherId, arrKey, index, field, value) => {
    const safeValue = (typeof value === 'number' && isNaN(value)) ? 0 : value;
    
    // Pencegahan Double Input pada Insentif & Potongan
    if (field === 'ket' && value !== '') {
       const targetTeacher = teachers.find(t => t.id === teacherId);
       const currentArr = targetTeacher?.payroll?.[arrKey] || [];
       const isDuplicate = currentArr.some((item, i) => i !== index && item.ket.toLowerCase() === value.toLowerCase());
       
       if (isDuplicate) {
          alert(`Peringatan: Komponen dengan keterangan "${value}" sudah ada pada pegawai ini!\n\nMohon gunakan keterangan yang berbeda atau cukup gabungkan nominalnya pada komponen yang sudah ada untuk menghindari duplikasi pelaporan.`);
          return; // Gagalkan update jika duplikat
       }
    }

    const targetTeacher = teachers.find(t => t.id === teacherId);
    if (targetTeacher && saveAuditLog) {
        const oldItem = targetTeacher.payroll?.[arrKey]?.[index] || {};
        saveAuditLog(targetTeacher, `${arrKey} [Item ke-${index + 1}] - ${field}`, oldItem[field] || 0, safeValue);
    }

    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        const p = t.payroll || {};
        const newArr = [...(p[arrKey] || [])];
        newArr[index] = { ...newArr[index], [field]: safeValue };
        return { ...t, payroll: { ...p, [arrKey]: newArr } };
      }
      return t;
    }));
  };

  const handleAddArrayItem = (teacherId, arrKey, defaultObj) => {
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        const p = t.payroll || {};
        return { ...t, payroll: { ...p, [arrKey]: [...(p[arrKey] || []), defaultObj] } };
      }
      return t;
    }));
  };

  const handleRemoveArrayItem = (teacherId, arrKey, index) => {
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        const p = t.payroll || {};
        const newArr = [...(p[arrKey] || [])];
        newArr.splice(index, 1);
        return { ...t, payroll: { ...p, [arrKey]: newArr } };
      }
      return t;
    }));
  };

  // VARIABEL DINAMIS DARI PENGATURAN MASTER
  const mr = settings?.masterRates || {};
  const catList = mr.JOB_CATEGORIES || JOB_CATEGORIES;
  const roleList = mr.JOB_ROLES || JOB_ROLES;
  const kompFields = mr.KOMPETENSI_FIELDS || KOMPETENSI_FIELDS;
  const kompLevels = mr.KOMPETENSI_LEVELS || KOMPETENSI_LEVELS;
  const insentifList = mr.INSENTIF_LIST || INSENTIF_LIST;
  const potonganList = mr.POTONGAN_LIST || POTONGAN_LIST;
  const kinerjaLevels = mr.KINERJA_LEVELS || KINERJA_LEVELS;

  const tabMenus = [
    { id: 'masaKerja', label: 'Tunjangan Masa Kerja', icon: Clock },
    { id: 'jabatan', label: 'Tunjangan Jabatan', icon: Briefcase },
    { id: 'pendidikan', label: 'Tunjangan Pendidikan', icon: GraduationCap },
    { id: 'kompetensi', label: 'Tunjangan Kompetensi', icon: Star },
    { id: 'keluarga', label: 'Tunjangan Keluarga', icon: Users },
    { id: 'disiplin', label: 'Kedisiplinan & Mengajar', icon: Clock },
    { id: 'insentif', label: 'Insentif Tambahan', icon: TrendingUp },
    { id: 'potongan', label: 'Potongan Lainnya', icon: Trash }
  ];

  const filtered = teachers.filter(t => {
    const isAct = isTeacherActive(t);
    const matchSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.nipy.includes(searchTerm);
    const matchStatus = filterStatus === 'Semua' ? isAct : (filterStatus === 'Non-Aktif' ? !isAct : (t.status === filterStatus && isAct));
    return matchSearch && matchStatus;
  });

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative pb-4 min-h-0">
      
      {/* 🪄 MODAL BARU: POTONGAN MASSAL DENGAN EXCEPTION LIST */}
      {isMassPotonganOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><Trash className="text-red-500"/> Penerapan Potongan Massal</h3>
              <button onClick={() => setIsMassPotonganOpen(false)} className="p-2 hover:bg-slate-200 dark:bg-slate-800 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="flex flex-col md:flex-row overflow-hidden flex-1">
               {/* KIRI: Form Pengaturan Potongan */}
               <div className="w-full md:w-[45%] lg:w-1/2 p-5 lg:p-6 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/20">
                  <form id="massPotonganForm" onSubmit={handleSaveMassPotongan} className="space-y-5">
                     <div className="bg-red-50 dark:bg-red-900/10 border-l-4 border-red-500 p-3 rounded-r-lg shadow-sm">
                        <p className="text-[11px] text-red-800 dark:text-red-300 font-medium leading-relaxed">Gunakan fitur ini untuk menerapkan tagihan iuran wajib, sumbangan, atau potongan lainnya ke banyak pegawai secara serentak.</p>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Keterangan / Nama Potongan</label>
                        <input type="text" value={massForm.ket} onChange={e => setMassForm({...massForm, ket: e.target.value})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-red-500 outline-none dark:text-white shadow-sm" required placeholder="Cth: Iuran PGRI" />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nominal Pemotongan (Rp)</label>
                        <div className="relative">
                           <span className="absolute left-3 top-2.5 text-slate-400 font-bold">Rp</span>
                           <input type="number" min="1" value={massForm.nominal} onChange={e => setMassForm({...massForm, nominal: e.target.value})} className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm font-black text-red-600 dark:text-red-400 focus:ring-2 focus:ring-red-500 outline-none shadow-sm" required placeholder="150000" />
                        </div>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Target Golongan</label>
                        <select value={massForm.targetGroup} onChange={e => setMassForm({...massForm, targetGroup: e.target.value})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-red-500 outline-none dark:text-white font-bold cursor-pointer shadow-sm">
                           <option value="Semua">Semua Pegawai (Laki-laki & Perempuan)</option>
                           <option value="L">Hanya Golongan Laki-laki</option>
                           <option value="P">Hanya Golongan Perempuan</option>
                        </select>
                     </div>
                     <div className="flex items-start gap-2 pt-2">
                        <Info size={16} className="text-slate-400 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                           Sistem otomatis memfilter {targetedTeachers.length} target pegawai. Gunakan daftar di sebelah kanan untuk mengecualikan (membebaskan) guru tertentu dari pemotongan massal ini.
                        </p>
                     </div>
                  </form>
               </div>

               {/* KANAN: Daftar Pengecualian */}
               <div className="w-full md:w-[55%] lg:w-1/2 flex flex-col h-full bg-white dark:bg-slate-800 max-h-[50vh] md:max-h-full relative">
                  <div className="p-4 lg:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 shrink-0 flex flex-col gap-3">
                     <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><Users size={16}/> Daftar Pengecualian (Exception)</h4>
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 px-2.5 py-1 rounded-md border border-red-200 dark:border-red-800/50">
                           {excludedIds.length} Dikecualikan
                        </span>
                     </div>
                     <div className="relative">
                        <Search className="absolute left-3 top-2 text-slate-400" size={14} />
                        <input type="text" placeholder="Cari nama untuk dibebaskan dari potongan..." value={massSearch} onChange={e => setMassSearch(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 outline-none dark:text-white focus:ring-1 focus:ring-red-500" />
                     </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                     {targetedTeachers.map(t => {
                        const isExcluded = excludedIds.includes(t.id);
                        return (
                           // PERBAIKAN: Mengganti tag label menjadi div dan menambahkan event onClick untuk memicu checklist pengecualian
                           <div key={t.id} onClick={() => toggleExclude(t.id)} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all hover:-translate-y-0.5 ${isExcluded ? 'border-red-500 bg-red-50 dark:bg-red-900/20 shadow-sm' : 'border-slate-100 dark:border-slate-700 hover:border-red-300 dark:hover:border-red-600 bg-white dark:bg-slate-800'}`}>
                              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${isExcluded ? 'bg-red-500 border-red-500 text-white' : 'border-slate-300 dark:border-slate-500 bg-slate-50 dark:bg-slate-900'}`}>
                                 {isExcluded && <CheckCircle size={14}/>}
                              </div>
                              <div className="flex-1 min-w-0">
                                 <p className={`font-bold text-sm truncate ${isExcluded ? 'text-red-700 dark:text-red-400 line-through opacity-80' : 'text-slate-800 dark:text-slate-200'}`}>{formatTeacherName(t.name)}</p>
                                 <p className="text-[10px] text-slate-500">{t.position} • {t.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</p>
                              </div>
                              {isExcluded && <span className="text-[10px] font-black uppercase tracking-wider text-red-600 dark:text-red-400 mr-1">Dikecualikan</span>}
                           </div>
                        )
                     })}
                     {targetedTeachers.length === 0 && (
                        <div className="text-center py-10 opacity-60">
                           <Users size={32} className="mx-auto mb-2 text-slate-400"/>
                           <p className="text-xs font-bold text-slate-500">Tidak ada pegawai yang cocok dengan filter target.</p>
                        </div>
                     )}
                  </div>
               </div>
            </div>

            <div className="p-4 md:p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsMassPotonganOpen(false)} className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-bold transition-colors text-sm">Batal</button>
              <button type="submit" form="massPotonganForm" disabled={isSavingMass || targetedTeachers.length === 0} className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-md transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed">
                {isSavingMass ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Trash size={16} />}
                {isSavingMass ? 'Memproses...' : `Terapkan ke ${targetedTeachers.length - excludedIds.length} Pegawai`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🪄 TAMBALAN CERDAS: Modal Pratinjau Slip Gaji */}
      {isSlipModalOpen && selectedSlip && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-300 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><FileText className="text-blue-500"/> Pratinjau Slip Gaji</h3>
              <button onClick={() => { setIsSlipModalOpen(false); setSelectedSlip(null); }} className="p-2 hover:bg-slate-200 dark:bg-slate-800 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            <div className="overflow-auto p-4 md:p-8 bg-slate-200 dark:bg-slate-700/50 flex-1">
              <SlipDocument teacher={selectedSlip} bulan={bulan} settings={settings} />
            </div>
            <div className="p-4 border-t border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => window.print()} className="bg-slate-600 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 shadow-sm transition-colors">
                <Printer size={18}/> Print
              </button>
              <button 
                onClick={async () => {
                  setIsExportingPDF(true);
                  try {
                    await exportToPDF('printable-area', `Slip_Gaji_${selectedSlip.name.replace(/\s+/g, '_')}_${bulan}.pdf`);
                  } finally {
                    setIsExportingPDF(false);
                  }
                }} 
                disabled={isExportingPDF}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 shadow-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isExportingPDF ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Download size={18}/>}
                {isExportingPDF ? 'Memproses...' : 'Unduh PDF'}
              </button>
              <button onClick={() => { setIsSlipModalOpen(false); setSelectedSlip(null); }} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      <datalist id="kategori-list">{catList.map(cat => <option key={cat} value={cat} />)}</datalist>
      <datalist id="detail-list">{roleList.map(role => <option key={role} value={role} />)}</datalist>
      <datalist id="kompetensi-list">{kompFields.map(f => <option key={f} value={f} />)}</datalist>
      <datalist id="insentif-list">{insentifList.map(i => <option key={i} value={i} />)}</datalist>
      <datalist id="potongan-list">{potonganList.map(i => <option key={i} value={i} />)}</datalist>

      <div className="bg-gradient-to-r from-emerald-600 to-teal-500 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0 mb-3 sm:mb-5">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1 flex items-center gap-2 sm:gap-3"><Calculator className="text-emerald-100" size={22} /> Input Cepat Komponen Gaji</h1>
          <p className="text-emerald-50 text-xs sm:text-sm">Pilih komponen di menu kiri, lalu sesuaikan nilainya untuk semua pegawai secara berurutan di sebelah kanan.</p>
        </div>
        <Calculator size={100} className="absolute -right-6 -top-6 text-white/10 transform -rotate-12 pointer-events-none hidden sm:block" />
      </div>

      <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
        {/* 🪄 PERBAIKAN RESPONSIVE: Sidebar Tab Menu diubah jadi Dropdown elegan di Mobile */}
        <div className="w-full md:w-56 lg:w-64 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col shrink-0">
          
          {/* Header Sidebar Desktop */}
          <div className="p-4 font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 hidden md:flex items-center gap-2 sticky top-0 bg-white dark:bg-slate-800 z-10 rounded-t-xl">
            <FileText size={18} className="text-emerald-500" /> Pilih Komponen
          </div>

          {/* Dropdown Khusus Mobile */}
          <div className="md:hidden p-2.5 sm:p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-t-xl">
             <label className="block text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Kategori Komponen Gaji</label>
             <div className="relative">
                <select
                   value={activeTabGaji}
                   onChange={(e) => setActiveTabGaji(e.target.value)}
                   className="w-full py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 font-bold outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm appearance-none cursor-pointer text-xs sm:text-sm"
                >
                   {tabMenus.map(tab => (
                      <option key={tab.id} value={tab.id}>{tab.label}</option>
                   ))}
                </select>
                <div className="absolute right-2.5 top-2 bg-emerald-100 dark:bg-emerald-900/50 p-1 rounded pointer-events-none">
                  <ChevronDown size={14} className="text-emerald-600 dark:text-emerald-400" />
               </div>
             </div>
          </div>
          
          {/* Menu Vertikal Desktop */}
          <div className="hidden md:flex flex-col overflow-y-auto hide-scrollbar">
            {tabMenus.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTabGaji(tab.id)}
                className={`w-full flex items-center gap-3 p-4 text-left font-semibold transition-all border-l-4 ${activeTabGaji === tab.id ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)]' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
              >
                <tab.icon size={18} className={activeTabGaji === tab.id ? 'text-emerald-500' : 'opacity-60'} />
                <span className="text-sm">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden min-h-0">
          {/* Header Input Area */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
              >
                <option value="Semua">Semua Pegawai</option>
                <option value="Tetap">Guru Tetap</option>
                <option value="Tidak Tetap">Guru Tidak Tetap</option>
              </select>
              <div className="relative w-full sm:w-56 md:w-64">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Cari Pegawai..." 
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
                />
              </div>
            </div>
            
            {/* 🪄 TOMBOL TRIGGER POTONGAN MASSAL */}
            <div className="w-full md:w-auto flex justify-end">
               <button onClick={() => setIsMassPotonganOpen(true)} className="w-full sm:w-auto bg-red-50 hover:bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 px-4 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors focus:ring-2 focus:ring-red-500 outline-none">
                  <Trash size={16}/> Potongan Massal
               </button>
            </div>
          </div>

          {/* List Pegawai */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <div className="bg-emerald-50/50 dark:bg-emerald-900/10 border-l-4 border-emerald-500 p-3 rounded-r-lg mb-6 sticky top-0 z-10 backdrop-blur-md">
               <p className="text-sm font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">INPUT MODE: {tabMenus.find(m => m.id === activeTabGaji)?.label.toUpperCase()}</p>
               <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5">Perubahan yang Anda ketik akan otomatis tersimpan.</p>
            </div>

            {filtered.map(t => {
              const p = t.payroll || {};
              const liveSlip = calculatePayroll(t, settings); // 🪄 Kalkulasi Live THP
              
              return (
                <div key={t.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm hover:border-emerald-300 dark:hover:border-emerald-700 transition-all focus-within:ring-2 focus-within:ring-emerald-500/20">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shrink-0 text-xs">{t.name.charAt(0)}</div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{formatTeacherName(t.name)}</h4>
                        <p className="text-xs text-slate-500 truncate">{t.nipy} • {t.status}</p>
                      </div>
                    </div>
                    
                    {/* 🪄 TAMBALAN CERDAS: Indikator THP & Tombol Pratinjau Slip */}
                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                       <div className="flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-900/40 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 shrink-0">
                         <Wallet size={14} className="text-emerald-600 dark:text-emerald-400" />
                         <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Est. THP: {formatRp(liveSlip.totalBersih)}</span>
                       </div>
                       <button
                          onClick={() => { setSelectedSlip(t); setIsSlipModalOpen(true); }}
                          className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                       >
                          <FileText size={14} className="text-blue-500" /> <span className="hidden sm:inline">Pratinjau Slip</span><span className="sm:hidden">Slip</span>
                       </button>
                    </div>
                  </div>

                  <div className="p-4 md:p-5">
                    
                    {/* 1. MASA KERJA */}
                    {activeTabGaji === 'masaKerja' && (
                        <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in zoom-in-95 items-end">
                          <div className="w-full sm:w-1/4">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 text-emerald-600 dark:text-emerald-400">Tahun Masuk (TMT)</label>
                            <div className="relative">
                               <select 
                                 value={new Date(t.tmt || new Date()).getFullYear()}
                                 onChange={(e) => handleInlineTmtChange(t.id, e.target.value)}
                                 className="w-full p-2.5 border border-emerald-200 dark:border-emerald-700 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/20 text-sm font-bold text-emerald-700 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer hover:border-emerald-300 transition-colors"
                               >
                                 {/* Batasi rentang dropdown tahun agar mentok di 2010 */}
                                 {Array.from({ length: Math.max(1, new Date().getFullYear() - 2009) }, (_, i) => new Date().getFullYear() - i).map(year => (
                                    <option key={year} value={year}>{year}</option>
                                 ))}
                               </select>
                               <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1">
                                  <span className="text-[10px] bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded font-bold shadow-sm">
                                     {Math.max(0, new Date().getFullYear() - new Date(t.tmt || new Date()).getFullYear())} Thn
                                  </span>
                                  <ChevronDown size={14} className="text-emerald-500" />
                               </div>
                            </div>
                          </div>
                          
                          <div className="w-full sm:w-1/3">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex justify-between">
                              <span>Nominal Override</span>
                              {t.status !== 'Tetap' && <span className="text-amber-500 flex items-center gap-1"><Edit size={10}/> Khusus Manual</span>}
                            </label>
                            <div className="relative">
                               <span className="absolute left-3 top-2.5 text-slate-500 font-medium">Rp</span>
                               <FormattedRupiahInput 
                                 value={(p.tunjanganMasaKerjaManual !== undefined && p.tunjanganMasaKerjaManual !== '') ? p.tunjanganMasaKerjaManual : (t.status === 'Tetap' ? ((settings?.masterRates?.TENURE_RATES || TENURE_RATES)[new Date(t.tmt || new Date()).getFullYear()] || 0) : '')}
                                 onChange={val => {
                                    if (saveAuditLog) saveAuditLog(t, 'Tunjangan Masa Kerja', p.tunjanganMasaKerjaManual || 0, val);
                                    setTeachers(prev => prev.map(tc => tc.id === t.id ? { ...tc, payroll: { ...tc.payroll, tunjanganMasaKerjaManual: val } } : tc));
                                 }}
                                 className={`w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-colors ${t.status !== 'Tetap' && (p.tunjanganMasaKerjaManual === undefined || p.tunjanganMasaKerjaManual === '') ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white'}`}
                                 placeholder={t.status === 'Tetap' ? '' : '0 (Default Tidak Tetap)'}
                               />
                            </div>
                          </div>

                          {t.status !== 'Tetap' && (
                             <div className="hidden lg:flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg border border-amber-200 dark:border-amber-800 text-xs font-medium">
                                <Info size={14} className="shrink-0"/> Non-Tetap: Isi "Override" untuk memberi tunjangan manual.
                             </div>
                          )}
                        </div>
                    )}

                    {/* 2. JABATAN */}
                    {activeTabGaji === 'jabatan' && (
                      <div className="space-y-3 animate-in fade-in zoom-in-95">
                        {p.jabatans?.map((jab, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Kategori</span>
                                <input list="kategori-list" value={jab.kategori} onChange={e => handleArrayUpdate(t.id, 'jabatans', idx, 'kategori', e.target.value)} className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Pilih/Ketik..." />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Detail Jabatan</span>
                                <input list="detail-list" value={jab.detail} onChange={e => handleArrayUpdate(t.id, 'jabatans', idx, 'detail', e.target.value)} className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Pilih/Ketik..." />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Kinerja</span>
                                <select value={jab.kinerja} onChange={e => handleArrayUpdate(t.id, 'jabatans', idx, 'kinerja', e.target.value)} className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-1 focus:ring-emerald-500">
                                  {kinerjaLevels.map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nominal (Rp)</span>
                                <FormattedRupiahInput 
                                  value={jab.nominal} 
                                  onChange={val => handleArrayUpdate(t.id, 'jabatans', idx, 'nominal', val)} 
                                  className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-blue-600 dark:text-blue-400 outline-none focus:ring-1 focus:ring-emerald-500" 
                                />
                              </div>
                            </div>
                            <button onClick={() => handleRemoveArrayItem(t.id, 'jabatans', idx)} className="p-2 text-red-500 hover:bg-red-100 rounded-lg"><Trash2 size={16}/></button>
                          </div>
                        ))}
                        <button onClick={() => handleAddArrayItem(t.id, 'jabatans', { kategori: 'Staff', detail: '', kinerja: 'Baik', nominal: 0 })} className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:text-blue-800"><PlusCircle size={14}/> Tambah Jabatan</button>
                      </div>
                    )}

                    {/* 3. PENDIDIKAN */}
                    {activeTabGaji === 'pendidikan' && (
                      t.status === 'Tetap' ? (
                        <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in zoom-in-95 items-end">
                          <div className="w-full sm:w-1/3">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 text-emerald-600 dark:text-emerald-400">Tingkat Pendidikan</label>
                            <select 
                              value={p.pendidikan?.tingkat || t.education} 
                              onChange={e => {
                                 const newTingkat = e.target.value;
                                 if (saveAuditLog) saveAuditLog(t, 'Tingkat Pendidikan', p.pendidikan?.tingkat || t.education, newTingkat);
                                 setTeachers(prev => prev.map(tc => {
                                    if (tc.id === t.id) {
                                       return {
                                          ...tc, education: newTingkat,
                                          payroll: { ...(tc.payroll || {}), pendidikan: { ...(tc.payroll?.pendidikan || {}), tingkat: newTingkat, nominalOverride: '' } }
                                       };
                                    }
                                    return tc;
                                 }));
                              }}
                              className="w-full p-2.5 border border-emerald-200 dark:border-emerald-700 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/20 text-sm font-bold text-emerald-700 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
                            >
                              {['S2', 'S1', 'Diploma', 'SMA/Pondok'].map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Nominal Override</label>
                            <div className="relative">
                              <span className="absolute left-3 top-2.5 text-slate-500 font-medium">Rp</span>
                              <FormattedRupiahInput 
                                value={(p.pendidikan?.nominalOverride !== undefined && p.pendidikan?.nominalOverride !== '' && p.pendidikan?.nominalOverride !== 0) ? p.pendidikan.nominalOverride : ((settings?.masterRates?.EDU_RATES || EDU_RATES)[t.education] || 0)}
                                onChange={val => handleUpdatePayrollObj(t.id, 'pendidikan', 'nominalOverride', val)}
                                className="w-full pl-10 pr-4 py-2.5 border rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95">
                           <Lock className="text-slate-400 dark:text-slate-500 mr-3" size={24} />
                           <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Tunjangan Pendidikan Terkunci (Hanya Pegawai Tetap)</p>
                        </div>
                      )
                    )}

                    {/* 4. KOMPETENSI */}
                    {activeTabGaji === 'kompetensi' && (
                      <div className="space-y-3 animate-in fade-in zoom-in-95">
                        {p.kompetensi?.map((komp, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Bidang Khusus</span>
                                <input list="kompetensi-list" value={komp.bidang} onChange={e => handleArrayUpdate(t.id, 'kompetensi', idx, 'bidang', e.target.value)} className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none" placeholder="Pilih/Ketik..." />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Level</span>
                                <select value={komp.level} onChange={e => handleArrayUpdate(t.id, 'kompetensi', idx, 'level', e.target.value)} className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none">
                                  {kompLevels.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nominal (Rp)</span>
                                <FormattedRupiahInput 
                                  value={komp.nominal} 
                                  onChange={val => handleArrayUpdate(t.id, 'kompetensi', idx, 'nominal', val)} 
                                  className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-amber-600 dark:text-amber-400 outline-none" 
                                />
                              </div>
                            </div>
                            <button onClick={() => handleRemoveArrayItem(t.id, 'kompetensi', idx)} className="p-2 text-red-500 hover:bg-red-100 rounded-lg"><Trash2 size={16}/></button>
                          </div>
                        ))}
                        <button onClick={() => handleAddArrayItem(t.id, 'kompetensi', { bidang: '', level: 'Cukup Ahli', nominal: 0 })} className="text-xs font-bold text-amber-600 flex items-center gap-1"><PlusCircle size={14}/> Tambah Kompetensi</button>
                      </div>
                    )}

                    {/* 5. KELUARGA */}
                    {activeTabGaji === 'keluarga' && (
                      t.status === 'Tetap' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in zoom-in-95 items-end">
                           <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tarif Pasangan</label>
                              <FormattedRupiahInput 
                                value={p.keluarga?.tarifSuamiIstri !== undefined ? p.keluarga.tarifSuamiIstri : 200000} 
                                onChange={val => handleUpdatePayrollObj(t.id, 'keluarga', 'tarifSuamiIstri', val)} 
                                className="w-full p-2.5 border rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold dark:text-white outline-none" 
                              />
                           </div>
                           <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tarif Per Anak</label>
                              <FormattedRupiahInput 
                                value={p.keluarga?.tarifAnak !== undefined ? p.keluarga.tarifAnak : 100000} 
                                onChange={val => handleUpdatePayrollObj(t.id, 'keluarga', 'tarifAnak', val)} 
                                className="w-full p-2.5 border rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold dark:text-white outline-none" 
                              />
                           </div>
                           <div className="lg:col-span-2 flex items-center gap-4 bg-slate-100 dark:bg-slate-700/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-600">
                              <div className="text-[10px] text-slate-500 font-bold uppercase w-24">Profil Sistem:</div>
                              <div className="flex-1 font-bold text-sm text-slate-700 dark:text-slate-200">
                                 {t.family?.wife === 1 ? 'Menikah' : t.family?.wife === 2 ? 'Menikah (Pasangan 1 Yayasan)' : 'Lajang'}, {t.family?.children || 0} Anak
                              </div>
                           </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95">
                           <Lock className="text-slate-400 dark:text-slate-500 mr-3" size={24} />
                           <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Tunjangan Keluarga Terkunci (Hanya Pegawai Tetap)</p>
                        </div>
                      )
                    )}

                    {/* 6. DISIPLIN & MENGAJAR */}
                    {activeTabGaji === 'disiplin' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in zoom-in-95">
                         <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-800">
                            <label className="block text-[10px] font-bold text-blue-500 uppercase mb-1">Total Jam Mengajar</label>
                            <input type="number" value={p.jamMengajar?.realisasi || 0} onChange={e => handleUpdatePayrollObj(t.id, 'jamMengajar', 'realisasi', Number(e.target.value))} className="w-full p-2 border rounded-md bg-white dark:bg-slate-800 dark:text-white text-sm font-bold" />
                         </div>
                         <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-800">
                            <label className="block text-[10px] font-bold text-red-500 uppercase mb-1">Jumlah Telat</label>
                            <input type="number" value={p.disiplin?.telat || 0} onChange={e => handleUpdatePayrollObj(t.id, 'disiplin', 'telat', Number(e.target.value))} className="w-full p-2 border rounded-md bg-white dark:bg-slate-800 dark:text-white text-sm font-bold" />
                         </div>
                         <div className="p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-800">
                            <label className="block text-[10px] font-bold text-emerald-500 uppercase mb-1">Tarif Bonus Hadir /Hr</label>
                            <FormattedRupiahInput 
                              value={p.disiplin?.tarifHadir !== undefined ? p.disiplin.tarifHadir : 1000} 
                              onChange={val => handleUpdatePayrollObj(t.id, 'disiplin', 'tarifHadir', val)} 
                              className="w-full p-2 border rounded-md bg-white dark:bg-slate-800 text-sm font-bold text-emerald-600 outline-none" 
                            />
                         </div>
                         <div className="p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-100 dark:border-amber-800">
                            <label className="block text-[10px] font-bold text-amber-500 uppercase mb-1">Denda Telat /Hr</label>
                            <FormattedRupiahInput 
                              value={p.disiplin?.tarifTelat !== undefined ? p.disiplin.tarifTelat : 1000} 
                              onChange={val => handleUpdatePayrollObj(t.id, 'disiplin', 'tarifTelat', val)} 
                              className="w-full p-2 border rounded-md bg-white dark:bg-slate-800 text-sm font-bold text-amber-600 outline-none" 
                            />
                         </div>
                      </div>
                    )}

                    {/* 7. INSENTIF TAMBAHAN */}
                    {activeTabGaji === 'insentif' && (
                      <div className="space-y-3 animate-in fade-in zoom-in-95">
                        {p.insentifTambahan?.map((ins, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-emerald-50/30 dark:bg-emerald-900/10">
                            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">Keterangan Tugas / Insentif</span>
                                <input list="insentif-list" value={ins.ket} onChange={e => handleArrayUpdate(t.id, 'insentifTambahan', idx, 'ket', e.target.value)} className="w-full p-2 border border-emerald-200 rounded-lg bg-white dark:bg-slate-800 text-sm dark:text-white outline-none" placeholder="Pilih/Ketik..." />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">Nominal (Rp)</span>
                                <FormattedRupiahInput 
                                  value={ins.nominal} 
                                  onChange={val => handleArrayUpdate(t.id, 'insentifTambahan', idx, 'nominal', val)} 
                                  className="w-full p-2 border border-emerald-200 rounded-lg bg-white dark:bg-slate-800 text-sm font-bold text-emerald-600 outline-none" 
                                />
                              </div>
                            </div>
                            <button onClick={() => handleRemoveArrayItem(t.id, 'insentifTambahan', idx)} className="p-2 text-red-500 hover:bg-red-100 rounded-lg"><Trash2 size={16}/></button>
                          </div>
                        ))}
                        <button onClick={() => handleAddArrayItem(t.id, 'insentifTambahan', { ket: '', nominal: 0 })} className="text-xs font-bold text-emerald-600 flex items-center gap-1"><PlusCircle size={14}/> Tambah Insentif</button>
                      </div>
                    )}

                    {/* 8. POTONGAN */}
                    {activeTabGaji === 'potongan' && (
                      <div className="space-y-3 animate-in fade-in zoom-in-95">
                        {p.potonganLainnya?.map((pot, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-red-50/30 dark:bg-red-900/10">
                            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <span className="text-[10px] font-bold text-red-600 uppercase block mb-1">Keterangan Potongan / Pinjaman</span>
                                <input list="potongan-list" value={pot.ket} onChange={e => handleArrayUpdate(t.id, 'potonganLainnya', idx, 'ket', e.target.value)} className="w-full p-2 border border-red-200 rounded-lg bg-white dark:bg-slate-800 text-sm dark:text-white outline-none" placeholder="Pilih/Ketik..." />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-red-600 uppercase block mb-1">Nominal (Rp) per Bulan</span>
                                <FormattedRupiahInput 
                                  value={pot.nominal} 
                                  onChange={val => handleArrayUpdate(t.id, 'potonganLainnya', idx, 'nominal', val)} 
                                  className="w-full p-2 border border-red-200 rounded-lg bg-white dark:bg-slate-800 text-sm font-bold text-red-600 outline-none" 
                                />
                              </div>
                            </div>
                            <button onClick={() => handleRemoveArrayItem(t.id, 'potonganLainnya', idx)} className="p-2 text-red-500 hover:bg-red-100 rounded-lg"><Trash2 size={16}/></button>
                          </div>
                        ))}
                        <button onClick={() => handleAddArrayItem(t.id, 'potonganLainnya', { ket: '', nominal: 0 })} className="text-xs font-bold text-red-600 flex items-center gap-1"><PlusCircle size={14}/> Tambah Potongan</button>
                      </div>
                    )}

                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center p-10 text-slate-500 bg-slate-50 dark:bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                Tidak ada pegawai yang sesuai pencarian.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Komponen Reusable untuk Template Slip Gaji Terperinci (Format Kertas Folio/F4)
// [MODULARISASI] SlipDocument telah dimodularisasi ke src/components/SlipDocument.jsx
export { GajiView };
