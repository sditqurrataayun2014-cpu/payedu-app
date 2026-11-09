import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity, Calculator, CreditCard, Download, Edit,
  History, Info, PlusCircle, Save, Search, Trash2,
  Upload, Wallet, X
} from 'lucide-react';

import { FormattedRupiahInput, formatRp } from '../../utils/payrollUtils';

export default function RekapPinjamanView({ teachers, setTeachers, onEditGaji }) {
  const [search, setSearch] = useState('');
  
  // 🪄 TAMBALAN CERDAS: State untuk Fitur Tambah, Detail Riwayat, dan Hapus
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ teacherId: '', ket: 'Kasbon Sekolah', nominal: '', totalPinjaman: '' });
  
  const [selectedLoanHistory, setSelectedLoanHistory] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, teacherId: null, ket: '' });
  const [isSaving, setIsSaving] = useState(false);

  // 🪄 TAMBAHAN: State untuk Fitur Edit & Ref Import
  const fileInputRef = useRef(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);

  // Mengambil daftar guru yang memiliki tanggungan (Sisa Hutang > 0) ATAU pernah tercatat memiliki kasbon
  const loanRecords = useMemo(() => {
    let records = [];
    teachers.forEach(t => {
       const hasLoans = t.payroll?.potonganLainnya && t.payroll.potonganLainnya.length > 0;
       if (hasLoans) {
          // Filter hanya yang bersifat pinjaman/koperasi/kasbon
          const kasbonItems = t.payroll.potonganLainnya.filter(pot => 
            pot.ket.toLowerCase().includes('kasbon') || 
            pot.ket.toLowerCase().includes('koperasi') || 
            pot.ket.toLowerCase().includes('pinjaman')
          );
          
          if (kasbonItems.length > 0) {
             kasbonItems.forEach(item => {
                const sisaHutang = item.sisaHutang !== undefined ? item.sisaHutang : (item.nominal * 4); // Fallback asumsi awal 4 bulan cicilan
                const totalPinjaman = item.totalPinjaman !== undefined ? item.totalPinjaman : (item.nominal * 10); // Plafon fallback
                records.push({
                   teacherId: t.id,
                   name: t.name,
                   nipy: t.nipy,
                   status: t.status,
                   ket: item.ket,
                   nominal: item.nominal,
                   sisaHutang: sisaHutang,
                   totalPinjaman: totalPinjaman,
                   isLunas: sisaHutang <= 0
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

  const filteredLoans = loanRecords.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase()) || 
    r.nipy.includes(search) ||
    r.ket.toLowerCase().includes(search.toLowerCase())
  );

  const totalPiutang = useMemo(() => {
    return loanRecords.reduce((sum, item) => sum + (item.sisaHutang > 0 ? item.sisaHutang : 0), 0);
  }, [loanRecords]);

  const totalPotonganBulanan = useMemo(() => {
    return loanRecords.reduce((sum, item) => sum + (!item.isLunas ? item.nominal : 0), 0);
  }, [loanRecords]);

  // 🪄 FUNGSI BARU: Tambah Pinjaman Baru
  const handleAddSubmit = (e) => {
     e.preventDefault();
     if (!addForm.teacherId || !addForm.nominal || !addForm.totalPinjaman) return;

     setIsSaving(true);
     setTimeout(() => {
        setTeachers(prev => prev.map(t => {
           if (t.id === addForm.teacherId) {
              const p = t.payroll || {};
              const currentPot = p.potonganLainnya || [];
              
              // Mencegah duplikasi nama pinjaman untuk guru yang sama
              if (currentPot.some(x => x.ket.toLowerCase() === addForm.ket.toLowerCase())) {
                 alert('Peringatan: Pinjaman dengan keterangan ini sudah ada. Harap bedakan namanya (cth: Kasbon Tahap 2).');
                 return t;
              }

              const newLoan = {
                 ket: addForm.ket,
                 nominal: Number(addForm.nominal),
                 sisaHutang: Number(addForm.totalPinjaman),
                 totalPinjaman: Number(addForm.totalPinjaman)
              };

              return { ...t, payroll: { ...p, potonganLainnya: [...currentPot, newLoan] } };
           }
           return t;
        }));

        setIsSaving(false);
        setIsAddModalOpen(false);
        setAddForm({ teacherId: '', ket: 'Kasbon Sekolah', nominal: '', totalPinjaman: '' });
     }, 600);
  };

  // 🪄 FUNGSI BARU: Edit Pinjaman Permanen
  const handleEditSubmit = (e) => {
     e.preventDefault();
     // PERBAIKAN: Mengizinkan angka 0 untuk disimpan dengan memeriksa secara spesifik jika nilai string kosong ('')
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
                          totalPinjaman: Number(editForm.totalPinjaman)
                      }
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
     }, 500);
  };

  // 🪄 FUNGSI BARU: Hapus Pinjaman Permanen
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
     }, 500);
  };

  const handleExportCSV = () => {
    const headers = ['ID Pegawai', 'Nama Lengkap', 'NIPY', 'Status', 'Keterangan Pinjaman', 'Plafon Awal', 'Potongan / Bulan', 'Sisa Hutang', 'Status Pelunasan'];
    const csvRows = [headers.join(';')];
    
    filteredLoans.forEach(r => {
      const row = [
        r.teacherId, 
        `"${r.name}"`, 
        `"=""${r.nipy}"""`, 
        r.status, 
        `"${r.ket}"`, 
        r.totalPinjaman,
        r.nominal, 
        r.sisaHutang,
        r.isLunas ? 'LUNAS' : 'Belum Lunas'
      ];
      csvRows.push(row.join(';'));
    });
    
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Rekapitulasi_Pinjaman_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 🪄 FUNGSI BARU: Import Data Pinjaman dari Excel (CSV)
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
                  i++; // Lewati escaped quote
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
         alert("Format file kosong atau tidak valid.");
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
        alert(`Sukses! Berhasil membaca dan meng-update ${successCount} data pinjaman dari file Excel!`);
      } else {
        alert('Tidak ada data pinjaman yang valid (Pastikan ID Pegawai dan Format Keterangan sama).');
      }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative pb-4 min-h-0">
      
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
                  {addForm.totalPinjaman && addForm.nominal && (
                     <div className="mt-2 p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg text-xs text-teal-700 dark:text-teal-400 font-medium flex items-center gap-2">
                        <Info size={14}/>
                        Estimasi Pelunasan: <strong>{Math.ceil(Number(addForm.totalPinjaman) / Number(addForm.nominal))} Bulan</strong>
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
                <Edit className="text-amber-500" /> Edit Detail Pinjaman
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
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Sisa Hutang Saat Ini</label>
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

      {/* 🪄 MODAL BARU: Detail & Riwayat Pinjaman (Visualisasi Progres) */}
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
               
               <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                     <span className="text-sm font-semibold text-slate-500">Plafon Pinjaman Awal</span>
                     <span className="font-bold text-slate-800 dark:text-white">{formatRp(selectedLoanHistory.totalPinjaman)}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-rose-50 dark:bg-rose-900/10 rounded-xl border border-rose-100 dark:border-rose-800/30">
                     <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">Potongan Bulanan</span>
                     <span className="font-bold text-rose-700 dark:text-rose-300">-{formatRp(selectedLoanHistory.nominal)}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-teal-50 dark:bg-teal-900/10 rounded-xl border border-teal-100 dark:border-teal-800/30 shadow-inner">
                     <span className="text-sm font-semibold text-teal-600 dark:text-teal-400">Sisa Hutang Saat Ini</span>
                     <span className="font-black text-lg text-teal-700 dark:text-teal-300">{formatRp(selectedLoanHistory.sisaHutang)}</span>
                  </div>
               </div>

               {/* Progress Bar Visual */}
               <div className="mt-8">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Progres Pelunasan</span>
                    <span className="text-sm font-black text-teal-600 dark:text-teal-400">
                       {selectedLoanHistory.totalPinjaman > 0 ? (((selectedLoanHistory.totalPinjaman - selectedLoanHistory.sisaHutang) / selectedLoanHistory.totalPinjaman) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden shadow-inner">
                    <div className="bg-gradient-to-r from-teal-400 to-emerald-500 h-full rounded-full transition-all duration-1000 relative" style={{ width: `${selectedLoanHistory.totalPinjaman > 0 ? (((selectedLoanHistory.totalPinjaman - selectedLoanHistory.sisaHutang) / selectedLoanHistory.totalPinjaman) * 100) : 0}%` }}>
                    </div>
                  </div>
                  <p className="text-center text-[10px] text-slate-400 font-medium mt-3 flex justify-center items-center gap-1">
                     <Info size={12}/> Estimasi Lunas: <strong className="text-slate-600 dark:text-slate-300">{Math.ceil(selectedLoanHistory.sisaHutang / selectedLoanHistory.nominal)} Bulan Kedepan</strong>
                  </p>
               </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end shrink-0">
              <button onClick={() => setSelectedLoanHistory(null)} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg font-bold transition-colors text-sm shadow-sm w-full sm:w-auto">
                Tutup Detail
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-600 to-emerald-600 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0 mb-3 sm:mb-5">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1 flex items-center gap-2 sm:gap-3"><CreditCard className="text-teal-100" size={22} /> Buku Pemantauan Kasbon</h1>
          <p className="text-teal-50 text-xs sm:text-sm">Monitor transparansi piutang, kelola pinjaman baru, dan sisa hutang pegawai.</p>
        </div>
        <CreditCard size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none hidden sm:block" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-4 shrink-0 mb-3 sm:mb-4">
         <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
               <Wallet size={16} className="sm:hidden" />
               <Wallet size={24} className="hidden sm:block" />
            </div>
            <div className="min-w-0">
               <p className="text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5 truncate">Sisa Piutang</p>
               <h3 className="text-sm sm:text-2xl font-black text-amber-600 dark:text-amber-400 truncate">{formatRp(totalPiutang)}</h3>
            </div>
         </div>
         <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-teal-50 dark:bg-teal-900/30 text-teal-500 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
               <Activity size={16} className="sm:hidden" />
               <Activity size={24} className="hidden sm:block" />
            </div>
            <div className="min-w-0">
               <p className="text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5 truncate">Potongan Bulan Ini</p>
               <h3 className="text-sm sm:text-2xl font-black text-teal-600 dark:text-teal-400 truncate">{formatRp(totalPotonganBulanan)}</h3>
            </div>
         </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col flex-1 min-h-0">
         <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 sm:gap-4 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <h3 className="text-sm sm:text-base font-bold dark:text-white flex items-center gap-2 shrink-0">Daftar Tagihan Pegawai</h3>
          
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
              <button onClick={() => setIsAddModalOpen(true)} className="justify-center bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold transition-colors items-center gap-1 shadow-sm cursor-pointer flex">
                 <PlusCircle size={14} /> <span>Tambah</span>
              </button>
              <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors items-center gap-1 shadow-sm cursor-pointer flex border border-slate-300 dark:border-slate-600">
                 <Upload size={14} /> <span>Impor</span>
              </button>
              <button onClick={handleExportCSV} className="justify-center bg-teal-600 hover:bg-teal-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold transition-colors items-center gap-1 shadow-sm cursor-pointer flex">
                 <Download size={14} /> <span>Ekspor</span>
              </button>
            </div>
          </div>
         </div>

        {/* FITUR BARU: Tampilan Kartu Mobile Rekap Pinjaman (< md) */}
        <div className="md:hidden space-y-2.5 p-2.5 sm:p-4 no-print">
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

                 <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <div><span className="text-slate-400">Total Plafon:</span> <span className="font-bold block dark:text-slate-200">{formatRp(loan.totalPinjaman)}</span></div>
                    <div><span className="text-slate-400">Cicilan/Bulan:</span> <span className="font-bold block text-rose-600 dark:text-rose-400">{formatRp(loan.nominal)}</span></div>
                    <div className="col-span-2"><span className="text-slate-400">Sisa Hutang:</span> <span className="font-black text-xs block text-teal-600 dark:text-teal-400">{formatRp(loan.sisaHutang)}</span></div>
                 </div>

                 <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                    <button onClick={() => setSelectedLoanHistory(loan)} className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                       <History size={13}/> Riwayat
                    </button>
                    <button onClick={() => { setEditForm({ teacherId: loan.teacherId, loanIdx: loan.loanIdx, ket: loan.ket, nominal: loan.nominal, totalPinjaman: loan.totalPinjaman, sisaHutang: loan.sisaHutang, originalKet: loan.ket }); setIsEditModalOpen(true); }} className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                       <Edit size={13}/> Edit
                    </button>
                    <button onClick={() => setConfirmDelete({ isOpen: true, teacherId: loan.teacherId, ket: loan.ket })} className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                       <Trash2 size={13}/> Hapus
                    </button>
                 </div>
              </div>
           ))}
        </div>

        <div className="hidden md:block overflow-x-auto flex-1 relative touch-pan-x scroll-smooth">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
            <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-4 font-bold">Nama Pegawai & Status</th>
                <th className="p-4 font-bold">Keterangan Pinjaman</th>
                <th className="p-4 font-bold text-right text-slate-500 dark:text-slate-400">Plafon</th>
                <th className="p-4 font-bold text-right text-rose-500">Potongan/Bulan</th>
                <th className="p-4 font-bold text-right text-teal-600">Sisa Hutang</th>
                <th className="p-4 font-bold text-center">Status</th>
                <th className="p-4 font-bold text-center">Aksi Manajemen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
               {filteredLoans.map((loan, idx) => (
                  <tr key={`${loan.teacherId}-${idx}`} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group ${loan.isLunas ? 'opacity-60 grayscale-[50%]' : ''}`}>
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
                           <button 
                             onClick={() => setSelectedLoanHistory(loan)}
                             className="p-2 bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 text-teal-600 dark:text-teal-400 rounded-md transition-colors shadow-sm border border-teal-100 dark:border-teal-800"
                             title="Lihat Detail & Riwayat Progres"
                           >
                             <Activity size={16} />
                           </button>
                           
                           {/* 🪄 TOMBOL PINTASAN CERDAS: Kalkulator Biru untuk Redirect Spesifik ke Tab Potongan Gaji Pegawai */}
                           <button 
                             onClick={() => onEditGaji(loan.teacherId, 'potongan')}
                             className="p-2 bg-blue-50 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-300 rounded-md transition-all shadow-sm border border-blue-200 dark:border-blue-700 hover:-translate-y-0.5"
                             title="Buka Form Potongan Gaji Pegawai Ini"
                           >
                             <Calculator size={16} />
                           </button>

                           <button 
                             onClick={() => {
                                setEditForm({
                                   teacherId: loan.teacherId,
                                   originalKet: loan.ket,
                                   ket: loan.ket,
                                   nominal: loan.nominal,
                                   totalPinjaman: loan.totalPinjaman,
                                   sisaHutang: loan.sisaHutang
                                });
                                setIsEditModalOpen(true);
                             }}
                             className="p-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-600 dark:text-amber-400 rounded-md transition-colors shadow-sm border border-amber-100 dark:border-amber-800"
                             title="Edit Sisa Saldo Pinjaman"
                           >
                             <Edit size={16} />
                           </button>
                           <button 
                             onClick={() => setConfirmDelete({ isOpen: true, teacherId: loan.teacherId, ket: loan.ket })}
                             className="p-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-md transition-colors shadow-sm border border-red-100 dark:border-red-800"
                             title="Hapus Tagihan Permanen"
                           >
                             <Trash2 size={16} />
                           </button>
                        </div>
                     </td>
                  </tr>
               ))}
               {filteredLoans.length === 0 && (
                  <tr><td colSpan="7" className="p-8 text-center text-slate-500">Tidak ada tanggungan pinjaman atau kasbon pegawai ditemukan.</td></tr>
               )}
            </tbody>
          </table>
         </div>
      </div>
    </div>
  );
}

// --- VIEW: REKAP ABSENSI (KOMPONEN BARU) ---
export { RekapPinjamanView };
