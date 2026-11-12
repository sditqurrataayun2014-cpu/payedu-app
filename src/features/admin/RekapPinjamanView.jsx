import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity, Calculator, CreditCard, Download, Edit,
  History, Info, PlusCircle, Save, Search, Trash2,
  Upload, Wallet, X, FileSpreadsheet, Printer, Clock,
  CheckCircle2, Filter, AlertCircle, FileText
} from 'lucide-react';

import { FormattedRupiahInput, formatRp, terbilang } from '../../utils/payrollUtils';
import { exportLoansToExcel } from '../../services/excelExportService';

export default function RekapPinjamanView({ teachers, setTeachers, onEditGaji, settings }) {
  const [search, setSearch] = useState('');
  
  // 🪄 TAB FILTER STATUS PINJAMAN: 'aktif' (default) | 'lunas' | 'semua'
  const [loanTab, setLoanTab] = useState('aktif');

  // State untuk Fitur Tambah, Edit, Detail Riwayat, dan Hapus
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ 
    teacherId: '', 
    ket: 'Kasbon Sekolah', 
    nominal: '', 
    totalPinjaman: '',
    tenorBulan: ''
  });
  
  const [selectedLoanHistory, setSelectedLoanHistory] = useState(null);
  const [selectedReceiptLoan, setSelectedReceiptLoan] = useState(null); // Kwitansi 1/4 A4
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, teacherId: null, ket: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState({ isOpen: false, type: '', message: '' });

  // State untuk Fitur Edit & Ref Import
  const fileInputRef = useRef(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);

  // Auto-dismiss notifikasi setelah 4 detik
  useEffect(() => {
    if (notification.isOpen) {
      const timer = setTimeout(() => {
        setNotification({ isOpen: false, type: '', message: '' });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification.isOpen]);

  // Mengambil daftar guru yang memiliki tanggungan kasbon/pinjaman beserta kalkulasi tenor & angsuran
  const loanRecords = useMemo(() => {
    let records = [];
    teachers.forEach(t => {
       const hasLoans = t.payroll?.potonganLainnya && t.payroll.potonganLainnya.length > 0;
       if (hasLoans) {
          const kasbonItems = t.payroll.potonganLainnya.filter(pot => 
            pot.ket.toLowerCase().includes('kasbon') || 
            pot.ket.toLowerCase().includes('koperasi') || 
            pot.ket.toLowerCase().includes('pinjaman')
          );
          
          if (kasbonItems.length > 0) {
             kasbonItems.forEach(item => {
                const nominal = Number(item.nominal) || 0;
                const totalPinjaman = item.totalPinjaman !== undefined ? Number(item.totalPinjaman) : (nominal * 10);
                const sisaHutang = item.sisaHutang !== undefined ? Number(item.sisaHutang) : (nominal * 4);
                const isLunas = sisaHutang <= 0;
                const sudahBayar = Math.max(0, totalPinjaman - sisaHutang);
                
                // Kalkulasi Tenor & Cicilan
                const tenorTotal = item.tenorBulan ? Number(item.tenorBulan) : (nominal > 0 ? Math.ceil(totalPinjaman / nominal) : 1);
                const cicilanKe = isLunas 
                  ? tenorTotal 
                  : Math.min(tenorTotal, Math.max(1, Math.round(sudahBayar / (nominal || 1)) + 1));
                const sisaBulan = isLunas 
                  ? 0 
                  : Math.max(1, Math.ceil(sisaHutang / (nominal || 1)));
                const progressPct = totalPinjaman > 0 ? Math.min(100, Math.round((sudahBayar / totalPinjaman) * 100)) : 100;

                records.push({
                   teacherId: t.id,
                   name: t.name,
                   nipy: t.nipy,
                   status: t.status,
                   ket: item.ket,
                   nominal,
                   sisaHutang,
                   totalPinjaman,
                   tenorBulan: item.tenorBulan || tenorTotal,
                   tenorTotal,
                   sudahBayar,
                   cicilanKe,
                   sisaBulan,
                   progressPct,
                   isLunas
                });
             });
          }
       }
    });
    
    // Sort records: Belum lunas di atas, Lunas di bawah
    return records.sort((a, b) => {
       if (a.isLunas === b.isLunas) return a.name.localeCompare(b.name);
       return a.isLunas ? 1 : -1;
    });
  }, [teachers]);

  // Tab Filtering & Search
  const filteredLoans = useMemo(() => {
    return loanRecords.filter(r => {
      const matchSearch = (r.name || '').toLowerCase().includes(search.toLowerCase()) || 
                          (r.nipy || '').includes(search) ||
                          (r.ket || '').toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;

      if (loanTab === 'aktif') return !r.isLunas;
      if (loanTab === 'lunas') return r.isLunas;
      return true; // 'semua'
    });
  }, [loanRecords, search, loanTab]);

  // Tab counts
  const countAktif = useMemo(() => loanRecords.filter(r => !r.isLunas).length, [loanRecords]);
  const countLunas = useMemo(() => loanRecords.filter(r => r.isLunas).length, [loanRecords]);
  const countSemua = loanRecords.length;

  const totalPiutang = useMemo(() => {
    return loanRecords.reduce((sum, item) => sum + (item.sisaHutang > 0 ? item.sisaHutang : 0), 0);
  }, [loanRecords]);

  const totalPotonganBulanan = useMemo(() => {
    return loanRecords.reduce((sum, item) => sum + (!item.isLunas ? item.nominal : 0), 0);
  }, [loanRecords]);

  // Auto-hitung Tenor saat input Form Tambah
  const autoTenorEstimate = useMemo(() => {
    if (addForm.totalPinjaman && addForm.nominal && Number(addForm.nominal) > 0) {
      return Math.ceil(Number(addForm.totalPinjaman) / Number(addForm.nominal));
    }
    return '';
  }, [addForm.totalPinjaman, addForm.nominal]);

  // Tambah Pinjaman Baru
  const handleAddSubmit = (e) => {
     e.preventDefault();
     if (!addForm.teacherId || !addForm.nominal || !addForm.totalPinjaman) return;

     setIsSaving(true);
     setTimeout(() => {
        setTeachers(prev => prev.map(t => {
           if (t.id === addForm.teacherId) {
              const p = t.payroll || {};
              const currentPot = p.potonganLainnya || [];
              
              if (currentPot.some(x => x.ket.toLowerCase() === addForm.ket.toLowerCase())) {
                 setNotification({
                   isOpen: true,
                   type: 'error',
                   message: 'Peringatan: Pinjaman dengan keterangan ini sudah ada. Harap bedakan namanya (cth: Kasbon Tahap 2).'
                 });
                 return t;
              }

              const tenor = Number(addForm.tenorBulan) || autoTenorEstimate || 1;

              const newLoan = {
                 ket: addForm.ket,
                 nominal: Number(addForm.nominal),
                 sisaHutang: Number(addForm.totalPinjaman),
                 totalPinjaman: Number(addForm.totalPinjaman),
                 tenorBulan: tenor
              };

              return { ...t, payroll: { ...p, potonganLainnya: [...currentPot, newLoan] } };
           }
           return t;
        }));

        setIsSaving(false);
        setIsAddModalOpen(false);
        setAddForm({ teacherId: '', ket: 'Kasbon Sekolah', nominal: '', totalPinjaman: '', tenorBulan: '' });
        setNotification({
          isOpen: true,
          type: 'success',
          message: 'Data pinjaman baru berhasil disimpan dan terintegrasi ke slip gaji!'
        });
     }, 400);
  };

  // Edit Pinjaman Permanen
  const handleEditSubmit = (e) => {
     e.preventDefault();
     if (editForm.nominal === '' || editForm.totalPinjaman === '' || editForm.sisaHutang === '') return;

     setIsSaving(true);
     setTimeout(() => {
        setTeachers(prev => prev.map(t => {
           if (t.id === editForm.teacherId) {
              const p = t.payroll || {};
              let currentPot = p.potonganLainnya || [];
              
              currentPot = currentPot.map(pot => {
                  if (pot.ket === editForm.originalKet) {
                      return {
                          ...pot,
                          ket: editForm.ket,
                          nominal: Number(editForm.nominal),
                          sisaHutang: Number(editForm.sisaHutang),
                          totalPinjaman: Number(editForm.totalPinjaman),
                          tenorBulan: Number(editForm.tenorBulan) || pot.tenorBulan || Math.ceil(Number(editForm.totalPinjaman) / (Number(editForm.nominal) || 1))
                      };
                  }
                  return pot;
              });

              return { ...t, payroll: { ...p, potonganLainnya: currentPot } };
           }
           return t;
        }));

        setIsSaving(false);
        setIsEditModalOpen(false);
        setEditForm(null);
        setNotification({
          isOpen: true,
          type: 'success',
          message: 'Perubahan data pinjaman berhasil diperbarui secara permanen.'
        });
     }, 400);
  };

  // Hapus Pinjaman Permanen
  const executeDeleteLoan = () => {
     setIsSaving(true);
     setTimeout(() => {
        setTeachers(prev => prev.map(t => {
           if (t.id === confirmDelete.teacherId) {
              const p = t.payroll || {};
              const newPot = (p.potonganLainnya || []).filter(item => item.ket !== confirmDelete.ket);
              return { ...t, payroll: { ...p, potonganLainnya: newPot } };
           }
           return t;
        }));
        setIsSaving(false);
        setConfirmDelete({ isOpen: false, teacherId: null, ket: '' });
        setNotification({
          isOpen: true,
          type: 'success',
          message: 'Data pinjaman telah berhasil dihapus dari sistem.'
        });
     }, 400);
  };

  // 🪄 EKSPOR EXCEL RESMI (.xlsx)
  const handleExportExcel = () => {
    try {
      exportLoansToExcel({
        loanRecords: filteredLoans,
        settings,
        filename: `Rekapitulasi_Pinjaman_${loanTab}_${new Date().toISOString().split('T')[0]}.xlsx`
      });
      setNotification({
        isOpen: true,
        type: 'success',
        message: `Rekap pinjaman (${filteredLoans.length} data) berhasil diekspor ke Excel (.xlsx)!`
      });
    } catch (err) {
      console.error("Gagal ekspor Excel:", err);
      setNotification({
        isOpen: true,
        type: 'error',
        message: 'Gagal mengekspor data ke Excel. Silakan periksa kembali data Anda.'
      });
    }
  };

  // Import Data Pinjaman dari CSV/Excel
  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const parseCSVLine = (line, delimiter) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
              if (inQuotes && line[i + 1] === '"') {
                  current += '"';
                  i++;
              } else {
                  inQuotes = !inQuotes;
              }
          } else if (char === delimiter && !inQuotes) {
              result.push(current);
              current = '';
          } else {
              current += char;
          }
      }
      result.push(current);
      return result.map(val => {
          let cln = val.trim();
          if (cln.startsWith('="') && cln.endsWith('"')) cln = cln.substring(2, cln.length - 1);
          if (cln.startsWith("'")) cln = cln.substring(1); 
          return cln;
      });
    };

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/);
      if(lines.length < 2) {
         setNotification({ isOpen: true, type: 'error', message: 'Format file kosong atau tidak valid.' });
         return;
      }
      
      let separator = ',';
      if (lines[0].includes(';')) separator = ';';
      else if (lines[0].includes('\t')) separator = '\t';
      
      let updatedTeachers = [...teachers];
      let successCount = 0;

      for(let i = 1; i < lines.length; i++) {
        if(!lines[i].trim()) continue;
        
        const values = parseCSVLine(lines[i], separator);
        
        if (values.length >= 8 && values[0] !== "") {
           const impId = values[0];
           const ket = values[4];
           const plafon = Number(values[5]);
           const potongan = Number(values[6]);
           const sisa = Number(values[7]);
           
           const teacherIndex = updatedTeachers.findIndex(t => t.id === impId);
           if (teacherIndex !== -1 && ket) {
               const teacher = updatedTeachers[teacherIndex];
               const currentPot = [...(teacher.payroll?.potonganLainnya || [])];
               const potIndex = currentPot.findIndex(p => p.ket.toLowerCase() === ket.toLowerCase());
               
               if (potIndex !== -1) {
                   currentPot[potIndex] = {
                       ...currentPot[potIndex],
                       nominal: isNaN(potongan) ? currentPot[potIndex].nominal : potongan,
                       sisaHutang: isNaN(sisa) ? currentPot[potIndex].sisaHutang : sisa,
                       totalPinjaman: isNaN(plafon) ? currentPot[potIndex].totalPinjaman : plafon
                   };
               } else {
                   currentPot.push({
                       ket: ket,
                       nominal: isNaN(potongan) ? 0 : potongan,
                       sisaHutang: isNaN(sisa) ? 0 : sisa,
                       totalPinjaman: isNaN(plafon) ? 0 : plafon
                   });
               }
               
               updatedTeachers[teacherIndex] = {
                   ...teacher,
                   payroll: {
                       ...(teacher.payroll || {}),
                       potonganLainnya: currentPot
                   }
               };
               successCount++;
           }
        }
      }

      if (successCount > 0) {
        setTeachers(updatedTeachers);
        setNotification({
          isOpen: true,
          type: 'success',
          message: `Sukses! Berhasil membaca dan memperbarui ${successCount} data pinjaman dari file.`
        });
      } else {
        setNotification({
          isOpen: true,
          type: 'error',
          message: 'Tidak ada data pinjaman yang valid (Pastikan ID Pegawai dan Format Keterangan sesuai).'
        });
      }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative pb-4 min-h-0">
      
      {/* 🪄 NOTIFIKASI TOAST */}
      {notification.isOpen && (
        <div className="fixed top-6 right-6 z-[100] animate-in slide-in-from-top-4 duration-300">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-white text-sm font-medium ${notification.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
            {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{notification.message}</span>
            <button onClick={() => setNotification({ isOpen: false, type: '', message: '' })} className="ml-2 hover:opacity-80">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* 🪄 MODAL BARU: Tambah Pinjaman */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                <PlusCircle className="text-teal-500" /> Input Pinjaman Baru
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-200 dark:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto">
               <form id="addLoanForm" onSubmit={handleAddSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Pilih Pegawai Peminjam</label>
                    <select 
                      value={addForm.teacherId} 
                      onChange={e => setAddForm({...addForm, teacherId: e.target.value})}
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-teal-500 outline-none dark:text-white cursor-pointer font-medium"
                      required
                    >
                      <option value="">-- Pilih Pegawai --</option>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.nipy})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Jenis Pinjaman / Keterangan</label>
                    <input 
                      list="loan-types"
                      value={addForm.ket} 
                      onChange={e => setAddForm({...addForm, ket: e.target.value})}
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-teal-500 outline-none dark:text-white"
                      placeholder="Cth: Kasbon Sekolah" required
                    />
                    <datalist id="loan-types">
                       <option value="Kasbon Sekolah" />
                       <option value="Pinjaman Koperasi" />
                       <option value="Potongan Seragam" />
                       <option value="Potongan Barang" />
                    </datalist>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Total Pinjaman (Plafon)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 font-medium">Rp</span>
                        <FormattedRupiahInput 
                          value={addForm.totalPinjaman} 
                          onChange={val => setAddForm({...addForm, totalPinjaman: val})}
                          className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold text-amber-600 dark:text-amber-400 focus:ring-2 focus:ring-amber-500 outline-none"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Cicilan Per Bulan</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 font-medium">Rp</span>
                        <FormattedRupiahInput 
                          value={addForm.nominal} 
                          onChange={val => setAddForm({...addForm, nominal: val})}
                          className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold text-rose-600 dark:text-rose-400 focus:ring-2 focus:ring-rose-500 outline-none"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* 🪄 INPUT TENOR BULAN */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      Jangka Waktu / Tenor (Bulan)
                    </label>
                    <div className="relative">
                      <input 
                        type="number" 
                        min="1"
                        max="60"
                        placeholder={autoTenorEstimate ? `Auto: ${autoTenorEstimate} Bulan` : "Contoh: 5"}
                        value={addForm.tenorBulan} 
                        onChange={e => setAddForm({...addForm, tenorBulan: e.target.value})}
                        className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                      <span className="absolute right-3 top-2.5 text-slate-400 text-xs font-semibold">Bulan</span>
                    </div>
                  </div>

                  {addForm.totalPinjaman && addForm.nominal && (
                     <div className="p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg text-xs text-teal-700 dark:text-teal-400 font-medium flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><Info size={14}/> Skema Tenor:</span>
                        <strong>{addForm.tenorBulan || autoTenorEstimate} Kali Angsuran</strong>
                     </div>
                  )}
               </form>
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsAddModalOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors text-sm">Batal</button>
              <button type="submit" form="addLoanForm" disabled={isSaving} className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold shadow-sm transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70">
                {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}
                {isSaving ? 'Menyimpan...' : 'Simpan Pinjaman'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🪄 MODAL BARU: Edit Pinjaman */}
      {isEditModalOpen && editForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                <Edit className="text-amber-500" /> Edit Detail Pinjaman & Tenor
              </h3>
              <button onClick={() => {setIsEditModalOpen(false); setEditForm(null);}} className="p-2 hover:bg-slate-200 dark:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto">
               <form id="editLoanForm" onSubmit={handleEditSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Keterangan Pinjaman</label>
                    <input 
                      type="text"
                      value={editForm.ket} 
                      onChange={e => setEditForm({...editForm, ket: e.target.value})}
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-amber-500 outline-none dark:text-white"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Plafon (Total Pinjaman)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 font-medium">Rp</span>
                        <FormattedRupiahInput 
                          value={editForm.totalPinjaman} 
                          onChange={val => setEditForm({...editForm, totalPinjaman: val})}
                          className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none dark:text-white"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Cicilan Per Bulan</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 font-medium">Rp</span>
                        <FormattedRupiahInput 
                          value={editForm.nominal} 
                          onChange={val => setEditForm({...editForm, nominal: val})}
                          className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold text-rose-600 dark:text-rose-400 focus:ring-2 focus:ring-rose-500 outline-none"
                          required
                        />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Sisa Hutang Pokok Saat Ini</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 font-medium">Rp</span>
                        <FormattedRupiahInput 
                          value={editForm.sisaHutang} 
                          onChange={val => setEditForm({...editForm, sisaHutang: val})}
                          className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-black text-teal-600 dark:text-teal-400 focus:ring-2 focus:ring-teal-500 outline-none"
                          required
                        />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Total Tenor (Bulan)</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          min="1"
                          max="60"
                          value={editForm.tenorBulan} 
                          onChange={e => setEditForm({...editForm, tenorBulan: e.target.value})}
                          className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                        <span className="absolute right-3 top-2.5 text-slate-400 text-xs font-semibold">Bulan</span>
                      </div>
                    </div>
                  </div>
               </form>
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => {setIsEditModalOpen(false); setEditForm(null);}} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors text-sm">Batal</button>
              <button type="submit" form="editLoanForm" disabled={isSaving} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold shadow-sm transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70">
                {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}
                {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🪄 MODAL BARU: Hapus Pinjaman */}
      {confirmDelete.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Hapus Pinjaman?</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 leading-relaxed">
                Anda yakin ingin menghapus data <strong className="text-slate-700 dark:text-slate-200">"{confirmDelete.ket}"</strong> secara permanen dari sistem?
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmDelete({ isOpen: false, teacherId: null, ket: '' })} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeDeleteLoan} disabled={isSaving} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2 disabled:opacity-70">
                {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Trash2 size={16} />}
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🪄 MODAL BARU: Detail & Riwayat Pinjaman (Visualisasi Progres Tenor) */}
      {selectedLoanHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-teal-50 dark:bg-teal-900/30 shrink-0">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 rounded-lg shadow-sm">
                    <Activity size={20} />
                 </div>
                 <div>
                    <h3 className="font-bold text-teal-800 dark:text-teal-300 leading-tight">Detail Riwayat Pinjaman</h3>
                    <p className="text-[10px] text-teal-600/80 dark:text-teal-500 font-medium">{selectedLoanHistory.name}</p>
                 </div>
              </div>
              <button onClick={() => setSelectedLoanHistory(null)} className="p-2 hover:bg-teal-100 dark:hover:bg-teal-800/50 rounded-full text-teal-600 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto">
               <h4 className="text-xl font-black text-slate-800 dark:text-white text-center mb-1">{selectedLoanHistory.ket}</h4>
               <p className="text-xs text-slate-500 text-center mb-6">Informasi progres pelunasan dan sisa saldo hutang pegawai.</p>
               
               <div className="space-y-3">
                  <div className="flex justify-between items-center p-3.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                     <span className="text-xs font-semibold text-slate-500">Plafon Pinjaman Awal</span>
                     <span className="font-bold text-slate-800 dark:text-white">{formatRp(selectedLoanHistory.totalPinjaman)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3.5 bg-rose-50 dark:bg-rose-900/10 rounded-xl border border-rose-100 dark:border-rose-800/30">
                     <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">Potongan Bulanan</span>
                     <span className="font-bold text-rose-700 dark:text-rose-300">-{formatRp(selectedLoanHistory.nominal)} / bln</span>
                  </div>
                  <div className="flex justify-between items-center p-3.5 bg-teal-50 dark:bg-teal-900/10 rounded-xl border border-teal-100 dark:border-teal-800/30 shadow-inner">
                     <span className="text-xs font-semibold text-teal-600 dark:text-teal-400">Sisa Hutang Pokok</span>
                     <span className="font-black text-base text-teal-700 dark:text-teal-300">{formatRp(selectedLoanHistory.sisaHutang)}</span>
                  </div>
               </div>

               {/* Progress Bar Visual & Tenor Tracking */}
               <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <Clock size={13} className="text-teal-600"/> Pelacakan Tenor
                    </span>
                    <span className="text-xs font-extrabold text-teal-600 dark:text-teal-400">
                      Angsuran ke-{selectedLoanHistory.cicilanKe} dari {selectedLoanHistory.tenorTotal} bln ({selectedLoanHistory.progressPct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden shadow-inner">
                    <div 
                      className="bg-gradient-to-r from-teal-500 to-emerald-500 h-full rounded-full transition-all duration-700" 
                      style={{ width: `${selectedLoanHistory.progressPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-200 dark:border-slate-700/60 text-[11px]">
                     <span className="text-slate-500">Estimasi Selesai:</span>
                     <strong className={selectedLoanHistory.isLunas ? "text-emerald-600" : "text-amber-600"}>
                       {selectedLoanHistory.isLunas ? 'Sudah Lunas Penuh' : `${selectedLoanHistory.sisaBulan} Bulan Pemotongan Lagi`}
                     </strong>
                  </div>
               </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-between items-center shrink-0">
              <button 
                onClick={() => {
                  setSelectedReceiptLoan(selectedLoanHistory);
                }} 
                className="px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors border border-teal-200 dark:border-teal-700"
              >
                <Printer size={14} /> Cetak Bukti Tanda Terima
              </button>
              <button onClick={() => setSelectedLoanHistory(null)} className="px-5 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg font-bold transition-colors text-xs shadow-sm">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🪄 MODAL BARU: Cetak Bukti Tanda Terima Kasbon (Kwitansi 1/4 A4) */}
      {selectedReceiptLoan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/80 shrink-0 no-print">
              <h3 className="font-bold text-base sm:text-lg dark:text-white flex items-center gap-2">
                <FileText className="text-teal-600" size={18} /> Kwitansi Tanda Terima Pinjaman / Kasbon
              </h3>
              <button onClick={() => setSelectedReceiptLoan(null)} className="p-1.5 hover:bg-slate-200 dark:bg-slate-700 rounded-full text-slate-500 transition-colors">
                <X size={18}/>
              </button>
            </div>

            {/* AREA CETAK KWITANSI (STANDAR 1/4 A4) */}
            <div className="p-5 sm:p-8 overflow-y-auto flex-1 bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100" id="receipt-printable-area">
              <div className="border-2 border-slate-800 dark:border-slate-400 p-5 rounded-xl bg-white dark:bg-slate-900 shadow-sm relative">
                {/* Kop Sekolah */}
                <div className="border-b-2 border-slate-800 dark:border-slate-400 pb-3 mb-4 flex justify-between items-start">
                  <div>
                    <h2 className="text-base sm:text-lg font-black tracking-wider uppercase text-slate-900 dark:text-white">
                      {settings?.schoolName || 'SD IT QURRATA A\'YUN KANDIS'}
                    </h2>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                      Unit Keuangan & Penggajian • Dokumen Resmi Pencairan Kasbon / Pinjaman
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">No. Kwitansi</span>
                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                      KB/{new Date().getFullYear()}/{selectedReceiptLoan.nipy || 'REF'}/{Math.floor(100 + Math.random() * 900)}
                    </span>
                  </div>
                </div>

                <div className="text-center my-3">
                  <h3 className="text-sm sm:text-base font-extrabold uppercase underline tracking-wider text-slate-900 dark:text-white">
                    KUITANSI TANDA TERIMA KASBON / PINJAMAN
                  </h3>
                </div>

                {/* Rincian Kwitansi */}
                <div className="space-y-2 text-xs sm:text-sm mt-4">
                  <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                    <span className="w-36 text-slate-500 shrink-0">Telah Terima Dari</span>
                    <span className="hidden sm:inline">:</span>
                    <span className="font-bold text-slate-900 dark:text-white">Bendahara {settings?.schoolName || 'SD IT Qurrata A\'yun'}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                    <span className="w-36 text-slate-500 shrink-0">Nama Penerima</span>
                    <span className="hidden sm:inline">:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{selectedReceiptLoan.name} (NIPY: {selectedReceiptLoan.nipy || '-'})</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                    <span className="w-36 text-slate-500 shrink-0">Uang Sejumlah</span>
                    <span className="hidden sm:inline">:</span>
                    <span className="font-black text-emerald-700 dark:text-emerald-400 text-sm sm:text-base">
                      {formatRp(selectedReceiptLoan.totalPinjaman)}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 italic">
                    <span className="w-36 text-slate-500 not-italic shrink-0">Terbilang</span>
                    <span className="hidden sm:inline not-italic">:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      # {terbilang(selectedReceiptLoan.totalPinjaman)} Rupiah #
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                    <span className="w-36 text-slate-500 shrink-0">Untuk Keperluan</span>
                    <span className="hidden sm:inline">:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{selectedReceiptLoan.ket}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                    <span className="w-36 text-slate-500 shrink-0">Skema Angsuran</span>
                    <span className="hidden sm:inline">:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Dipotong slip gaji sebesar <strong className="text-rose-600">{formatRp(selectedReceiptLoan.nominal)} / bulan</strong> selama <strong>{selectedReceiptLoan.tenorTotal} bulan</strong>
                    </span>
                  </div>
                </div>

                {/* Kolom Tanda Tangan */}
                <div className="mt-8 pt-4 border-t border-dashed border-slate-300 dark:border-slate-700 grid grid-cols-2 text-center text-xs">
                  <div>
                    <p className="text-slate-500 mb-12">Mengetahui / Menyetujui,<br/><strong>Bendahara Sekolah</strong></p>
                    <p className="font-bold underline text-slate-800 dark:text-slate-200">( ........................................ )</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-12">Kandis, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br/><strong>Penerima Pinjaman</strong></p>
                    <p className="font-bold underline text-slate-800 dark:text-slate-200">{selectedReceiptLoan.name}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tombol Aksi */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex justify-end gap-2.5 shrink-0 no-print">
              <button 
                onClick={() => window.print()} 
                className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg text-xs sm:text-sm font-bold shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Printer size={16} /> Cetak Kwitansi
              </button>
              <button 
                onClick={() => setSelectedReceiptLoan(null)} 
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-xs sm:text-sm font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-600 to-emerald-600 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0 mb-3 sm:mb-4">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1 flex items-center gap-2 sm:gap-3">
            <CreditCard className="text-teal-100" size={22} /> Buku Pemantauan Kasbon & Pinjaman
          </h1>
          <p className="text-teal-50 text-xs sm:text-sm">
            Monitor transparansi piutang, pelacakan tenor angsuran bulanan, dan penerbitan kwitansi tanda terima kasbon.
          </p>
        </div>
        <CreditCard size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none hidden sm:block" />
      </div>

      {/* Kartu Ringkasan KPI */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 shrink-0 mb-3 sm:mb-4">
         <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
               <Wallet size={16} className="sm:hidden" />
               <Wallet size={24} className="hidden sm:block" />
            </div>
            <div className="min-w-0">
               <p className="text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5 truncate">Total Sisa Piutang Pokok</p>
               <h3 className="text-sm sm:text-2xl font-black text-amber-600 dark:text-amber-400 truncate">{formatRp(totalPiutang)}</h3>
            </div>
         </div>
         <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-teal-50 dark:bg-teal-900/30 text-teal-500 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
               <Activity size={16} className="sm:hidden" />
               <Activity size={24} className="hidden sm:block" />
            </div>
            <div className="min-w-0">
               <p className="text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5 truncate">Total Potongan Bulan Ini</p>
               <h3 className="text-sm sm:text-2xl font-black text-teal-600 dark:text-teal-400 truncate">{formatRp(totalPotonganBulanan)}</h3>
            </div>
         </div>
      </div>

      {/* 🪄 TAB FILTER STATUS PINJAMAN */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
        <button
          onClick={() => setLoanTab('aktif')}
          className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs ${
            loanTab === 'aktif'
              ? 'bg-teal-600 text-white shadow-teal-500/20 shadow-md'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Clock size={15} />
          <span>Pinjaman Aktif</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            loanTab === 'aktif' ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300'
          }`}>
            {countAktif}
          </span>
        </button>

        <button
          onClick={() => setLoanTab('lunas')}
          className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs ${
            loanTab === 'lunas'
              ? 'bg-emerald-600 text-white shadow-emerald-500/20 shadow-md'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <CheckCircle2 size={15} />
          <span>Riwayat Lunas</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            loanTab === 'lunas' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
          }`}>
            {countLunas}
          </span>
        </button>

        <button
          onClick={() => setLoanTab('semua')}
          className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs ${
            loanTab === 'semua'
              ? 'bg-slate-700 text-white shadow-slate-500/20 shadow-md'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Filter size={15} />
          <span>Semua ({countSemua})</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col flex-1 min-h-0">
         <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 sm:gap-4 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold dark:text-white flex items-center gap-2 shrink-0">
              Daftar Tagihan & Angsuran Pegawai
            </h3>
            <span className="text-[11px] font-medium text-slate-400">
              ({filteredLoans.length} catatan ditampilkan)
            </span>
          </div>
          
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 w-full sm:w-auto items-center justify-end">
            <div className="relative w-full sm:w-64 flex-1">
              <Search className="absolute left-2.5 top-2 text-slate-400" size={15} />
              <input 
                type="text" 
                placeholder="Cari Pegawai atau Keterangan..." 
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-teal-500 outline-none dark:text-white transition-all shadow-sm"
              />
            </div>
            
            <div className="grid grid-cols-3 gap-1.5 w-full sm:flex sm:w-auto">
              <button onClick={() => setIsAddModalOpen(true)} className="justify-center bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors items-center gap-1 shadow-sm cursor-pointer flex">
                 <PlusCircle size={14} /> <span>Tambah</span>
              </button>
              <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors items-center gap-1 shadow-sm cursor-pointer flex border border-slate-300 dark:border-slate-600">
                 <Upload size={14} /> <span>Impor</span>
              </button>
              {/* 🪄 EKSPOR EXCEL RESMI (.xlsx) */}
              <button onClick={handleExportExcel} className="justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors items-center gap-1.5 shadow-sm cursor-pointer flex" title="Unduh Rekap Format Excel Resmi (.xlsx)">
                 <FileSpreadsheet size={14} /> <span>Excel (.xlsx)</span>
              </button>
            </div>
          </div>
         </div>

        {/* Tampilan Kartu Mobile (< md) */}
        <div className="md:hidden space-y-2.5 p-2.5 sm:p-4 no-print overflow-y-auto">
           {filteredLoans.map((loan, idx) => (
              <div key={`${loan.teacherId}-${idx}`} className={`bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-2.5 ${loan.isLunas ? 'opacity-75 bg-slate-50/50' : ''}`}>
                 <div className="flex justify-between items-start">
                    <div>
                       <h4 className="font-bold text-sm text-slate-800 dark:text-white">{loan.name}</h4>
                       <div className="text-[11px] text-slate-500 mt-0.5">{loan.nipy} • {loan.ket}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${loan.isLunas ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>
                       {loan.isLunas ? 'LUNAS' : 'Belum Lunas'}
                    </span>
                 </div>

                 {/* Baris Tenor Progress Mobile */}
                 <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Tenor:</span>
                      <strong className="text-slate-700 dark:text-slate-300">
                        Angsuran ke-{loan.cicilanKe} dari {loan.tenorTotal} bln
                      </strong>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-teal-500 h-full rounded-full" style={{ width: `${loan.progressPct}%` }} />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <div><span className="text-slate-400">Total Plafon:</span> <span className="font-bold block dark:text-slate-200">{formatRp(loan.totalPinjaman)}</span></div>
                    <div><span className="text-slate-400">Cicilan/Bulan:</span> <span className="font-bold block text-rose-600 dark:text-rose-400">{formatRp(loan.nominal)}</span></div>
                    <div className="col-span-2"><span className="text-slate-400">Sisa Hutang Pokok:</span> <span className="font-black text-xs block text-teal-600 dark:text-teal-400">{formatRp(loan.sisaHutang)}</span></div>
                 </div>

                 <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                    <button onClick={() => setSelectedReceiptLoan(loan)} className="px-2 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors" title="Cetak Kwitansi">
                       <Printer size={12}/> Kwitansi
                    </button>
                    <button onClick={() => setSelectedLoanHistory(loan)} className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                       <History size={12}/> Riwayat
                    </button>
                    <button onClick={() => { setEditForm({ teacherId: loan.teacherId, originalKet: loan.ket, ket: loan.ket, nominal: loan.nominal, totalPinjaman: loan.totalPinjaman, sisaHutang: loan.sisaHutang, tenorBulan: loan.tenorTotal }); setIsEditModalOpen(true); }} className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                       <Edit size={12}/> Edit
                    </button>
                    <button onClick={() => setConfirmDelete({ isOpen: true, teacherId: loan.teacherId, ket: loan.ket })} className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                       <Trash2 size={12}/> Hapus
                    </button>
                 </div>
              </div>
           ))}
        </div>

        {/* Tampilan Tabel Desktop (>= md) */}
        <div className="hidden md:block overflow-x-auto flex-1 relative touch-pan-x scroll-smooth">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
            <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-4 font-bold">Nama Pegawai & Status</th>
                <th className="p-4 font-bold">Keterangan Pinjaman</th>
                <th className="p-4 font-bold text-right text-slate-500 dark:text-slate-400">Plafon Awal</th>
                <th className="p-4 font-bold text-right text-rose-500">Angsuran / Bulan</th>
                {/* 🪄 KOLOM TENOR & ANGSURAN */}
                <th className="p-4 font-bold text-center">Tenor & Progres</th>
                <th className="p-4 font-bold text-right text-teal-600">Sisa Hutang Pokok</th>
                <th className="p-4 font-bold text-center">Status</th>
                <th className="p-4 font-bold text-center">Aksi Manajemen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
               {filteredLoans.map((loan, idx) => (
                  <tr key={`${loan.teacherId}-${idx}`} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group ${loan.isLunas ? 'opacity-65 grayscale-[40%]' : ''}`}>
                     <td className="p-4">
                        <div className={`font-bold ${loan.isLunas ? 'text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>{loan.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{loan.nipy} • {loan.status}</div>
                     </td>
                     <td className="p-4">
                        <div className="font-semibold text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title={loan.ket}>{loan.ket}</div>
                     </td>
                     <td className="p-4 text-right font-medium text-slate-500 dark:text-slate-400">
                        {formatRp(loan.totalPinjaman)}
                     </td>
                     <td className="p-4 text-right font-medium text-rose-500">
                        {formatRp(loan.nominal)}
                     </td>

                     {/* 🪄 PROGRES TENOR */}
                     <td className="p-4 text-center">
                        <div className="inline-flex flex-col items-center gap-1 min-w-[140px]">
                           <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                              Bulan ke-{loan.cicilanKe} dari {loan.tenorTotal}
                           </span>
                           <div className="w-28 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="bg-teal-500 h-full rounded-full transition-all duration-500" 
                                style={{ width: `${loan.progressPct}%` }}
                              />
                           </div>
                           <span className="text-[9px] font-semibold text-slate-400">
                              {loan.isLunas ? 'Lunas Selesai' : `Sisa ${loan.sisaBulan} bln lagi`}
                           </span>
                        </div>
                     </td>

                     <td className="p-4 text-right">
                        <span className={`font-black tracking-tight text-[13px] px-3 py-1.5 rounded-lg border shadow-sm ${loan.isLunas ? 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700' : 'bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-900/30 dark:border-teal-800 dark:text-teal-400'}`}>
                           {formatRp(loan.sisaHutang)}
                        </span>
                     </td>
                     <td className="p-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold ${loan.isLunas ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                           {loan.isLunas ? 'LUNAS' : 'Belum Lunas'}
                        </span>
                     </td>
                     <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                           {/* 🪄 TOMBOL CETAK KWITANSI */}
                           <button 
                             onClick={() => setSelectedReceiptLoan(loan)}
                             className="p-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-md transition-colors shadow-sm border border-emerald-100 dark:border-emerald-800"
                             title="Cetak Kwitansi / Tanda Terima Kasbon"
                           >
                             <Printer size={15} />
                           </button>

                           <button 
                             onClick={() => setSelectedLoanHistory(loan)}
                             className="p-2 bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 text-teal-600 dark:text-teal-400 rounded-md transition-colors shadow-sm border border-teal-100 dark:border-teal-800"
                             title="Lihat Detail & Riwayat Progres"
                           >
                             <Activity size={15} />
                           </button>
                           
                           {/* Shortcut ke edit form potongan pegawai */}
                           <button 
                             onClick={() => onEditGaji(loan.teacherId, 'potongan')}
                             className="p-2 bg-blue-50 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-300 rounded-md transition-all shadow-sm border border-blue-200 dark:border-blue-700 hover:-translate-y-0.5"
                             title="Buka Form Potongan Gaji Pegawai Ini"
                           >
                             <Calculator size={15} />
                           </button>

                           <button 
                             onClick={() => {
                                setEditForm({
                                   teacherId: loan.teacherId,
                                   originalKet: loan.ket,
                                   ket: loan.ket,
                                   nominal: loan.nominal,
                                   totalPinjaman: loan.totalPinjaman,
                                   sisaHutang: loan.sisaHutang,
                                   tenorBulan: loan.tenorTotal
                                });
                                setIsEditModalOpen(true);
                             }}
                             className="p-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-600 dark:text-amber-400 rounded-md transition-colors shadow-sm border border-amber-100 dark:border-amber-800"
                             title="Edit Sisa Saldo & Tenor Pinjaman"
                           >
                             <Edit size={15} />
                           </button>
                           <button 
                             onClick={() => setConfirmDelete({ isOpen: true, teacherId: loan.teacherId, ket: loan.ket })}
                             className="p-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-md transition-colors shadow-sm border border-red-100 dark:border-red-800"
                             title="Hapus Tagihan Permanen"
                           >
                             <Trash2 size={15} />
                           </button>
                        </div>
                     </td>
                  </tr>
               ))}
               {filteredLoans.length === 0 && (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-slate-500">
                      Tidak ada catatan pinjaman yang cocok dengan filter {loanTab === 'aktif' ? 'Pinjaman Aktif' : loanTab === 'lunas' ? 'Riwayat Lunas' : 'Semua'}.
                    </td>
                  </tr>
               )}
            </tbody>
          </table>
         </div>
      </div>
    </div>
  );
}

export { RekapPinjamanView };
