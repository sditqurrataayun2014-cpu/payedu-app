import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Download, Edit, Eye, PlusCircle, Save, Search,
  Sparkles, Trash2, Upload, Users, X
} from 'lucide-react';

import {
  calculateYearsFromDate, formatDateId, formatToInputDate,
  generateTeacherId, generateUniqueId, isTeacherActive,
  safeStorageSet, sanitizeTeacherData
} from '../../utils/payrollUtils';
import {
  deduplicateTeachers, sortTeachersById,
  pushCloudData as pushToSupabase
} from '../../services/dbService';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const sanitizeTeacherList = (list) => {
  if (!Array.isArray(list)) return [];
  const sanitized = list.map(sanitizeTeacherData);
  return sortTeachersById(deduplicateTeachers(sanitized));
};

export default function DataGuruView({ teachers, setTeachers, user, saveAuditLog }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua'); // TAMBAHAN: Filter Dropdown
  const [filterWorkStatus, setFilterWorkStatus] = useState('Aktif'); // 🪄 FITUR BARU: Filter Keaktifan (Aktif/Tidak Aktif/Resign)
  const [modal, setModal] = useState({ isOpen: false, type: null, data: null });
  const fileInputRef = useRef(null);
  
  // FITUR BARU: State untuk Micro-Interaction Tombol Simpan
  const [isSaving, setIsSaving] = useState(false);

  const sortedTeachers = useMemo(() => sortTeachersById(teachers), [teachers]);

  const filtered = sortedTeachers.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.nipy.includes(search);
    const matchStatus = filterStatus === 'Semua' ? true : t.status === filterStatus;
    
    // 🪄 FITUR BARU: Logika Pencarian & Filter Keaktifan Pegawai
    const isAct = isTeacherActive(t);
    let matchWorkStatus = true;
    if (filterWorkStatus === 'Aktif') {
      matchWorkStatus = isAct;
    } else if (filterWorkStatus === 'Non-Aktif' || filterWorkStatus === 'Resign' || filterWorkStatus === 'Tidak Aktif') {
      matchWorkStatus = !isAct;
    }
    
    return matchSearch && matchStatus && matchWorkStatus;
  });

  const openModal = (type, data) => setModal({ isOpen: true, type, data });
  const closeModal = () => setModal({ isOpen: false, type: null, data: null });

  const handleDelete = async () => {
    if (!modal.data) return;
    const targetId = modal.data.id;
    const targetName = modal.data.name;
    const updated = teachers.filter(t => t.id !== targetId);
    setTeachers(updated);
    safeStorageSet('payedu_teachers', updated);
    closeModal();

    saveAuditLog?.(
      user?.name || 'Administrator',
      'Hapus Data Pegawai',
      targetName,
      `Menghapus data pegawai ${targetName} (ID: ${targetId}, NIPY: ${modal.data.nipy || '-'})`,
      'pegawai'
    );

    try {
      await pushToSupabase('SAVE_TEACHERS', updated);
      if (isSupabaseConfigured() && supabase) {
        await supabase.from('teachers').delete().eq('id', String(targetId));
      }
    } catch (err) {
      console.warn('Gagal menghapus data guru di Cloud:', err);
    }
  };

  // 🪄 FITUR BARU: Pembersihan Data Guru Ganda Seketika (1-Klik Anti-Duplikasi)
  const handleCleanDuplicates = async () => {
    const cleanList = deduplicateTeachers(teachers);
    const countRemoved = teachers.length - cleanList.length;
    if (countRemoved <= 0) {
      alert("✅ Data Pegawai Bersih!\n\nTidak ditemukan data guru yang ganda pada sistem.");
      return;
    }
    if (window.confirm(`Ditemukan ${countRemoved} data pegawai ganda di sistem.\n\nApakah Anda ingin menggabungkan dan membersihkan duplikasi tersebut secara permanen ke Cloud?`)) {
      setTeachers(cleanList);
      safeStorageSet('payedu_teachers', cleanList);
      saveAuditLog?.(
        user?.name || 'Administrator',
        'Bersihkan Duplikat Pegawai',
        'Data Master Guru',
        `Membersihkan dan menggabungkan ${countRemoved} data ganda pegawai`,
        'pegawai'
      );
      try {
        await pushToSupabase('SAVE_TEACHERS', cleanList);
        alert(`✨ Alhamdulillah! Berhasil membersihkan ${countRemoved} data ganda dan tersimpan permanen ke Cloud Supabase.`);
      } catch (err) {
        console.warn("Gagal sinkronisasi pembersihan duplikat:", err);
      }
    }
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    setIsSaving(true); 
    
    const formElement = e.target;
    const newData = {
      name: formElement.name.value,
      nipy: formElement.nipy.value,
      pob: formElement.pob.value,
      dob: formElement.dob.value,
      gender: formElement.gender.value,
      phone: formElement.phone ? formElement.phone.value : '', // TAMBAHAN: Menyimpan Nomor WA
      education: formElement.education.value,
      status: formElement.status.value,
      workStatus: formElement.workStatus ? formElement.workStatus.value : 'Aktif', // 🪄 FITUR BARU: Status Keaktifan
      tmt: formElement.tmt.value,
      position: formElement.position.value,
      bankName: formElement.bankName ? formElement.bankName.value : '',
      bankAccount: formElement.bankAccount ? formElement.bankAccount.value : '',
      family: {
        wife: formElement.wife ? Number(formElement.wife.value) : 0,
        children: formElement.children ? Number(formElement.children.value) : 0
      }
    };

    let updatedTeachers = [];
    if (modal.type === 'add') {
      const newId = generateTeacherId(teachers);
      const newTeacher = { 
        ...newData, 
        id: newId, 
        payroll: {
           tahunMasaKerja: new Date().getFullYear(),
           tunjanganMasaKerjaManual: '',
           jabatans: [{ kategori: 'Guru', detail: newData.position || '', kinerja: 'Baik', nominal: 0 }],
           pendidikan: { tingkat: newData.education || 'S1', nominalOverride: '' },
           kompetensi: [],
           disiplin: { hadir: 0, telat: 0, tarifHadir: 1000, tarifTelat: 1000 },
           insentifTambahan: [],
           potonganLainnya: [],
           jamMengajar: { wajib: 0, realisasi: 0, tarifJPL: 10000, jsjm: 0 }, 
           isNotified: false,
           isConfirmed: false
        } 
      };
      updatedTeachers = [...teachers, newTeacher];
      saveAuditLog?.(
        user?.name || 'Administrator',
        'Tambah Pegawai Baru',
        newData.name,
        `Menambahkan pegawai baru ${newData.name} (NIPY: ${newData.nipy || '-'}, Jabatan: ${newData.position || 'Guru'})`,
        'pegawai'
      );
    } else {
      updatedTeachers = teachers.map(t => {
         if (t.id === modal.data.id) {
           return {
             ...t,
             ...newData,
             family: {
               ...(t.family || {}),
               ...newData.family
             }
           };
         }
         return t;
      });
      saveAuditLog?.(
        user?.name || 'Administrator',
        'Perbarui Data Pegawai',
        newData.name,
        `Memperbarui profil kepegawaian ${newData.name} (Jabatan: ${newData.position || '-'}, Status: ${newData.status})`,
        'pegawai'
      );
    }

    setTeachers(updatedTeachers);
    safeStorageSet('payedu_teachers', updatedTeachers);
    pushToSupabase('SAVE_TEACHERS', updatedTeachers).catch(err => {
      console.warn("Gagal simpan langsung guru ke cloud:", err);
    });

    setIsSaving(false);
    closeModal();
  };


  const handleExportCSV = () => {
    // TAMBAHAN: Memasukkan No WA dan Keaktifan ke dalam export CSV
    const headers = ['ID', 'Nama Lengkap', 'NIPY', 'L/P', 'Tempat Lahir', 'Tanggal Lahir', 'No WA', 'Pendidikan', 'Status Golongan', 'Keaktifan', 'Jabatan', 'TMT', 'Status Pasangan', 'Jumlah Anak'];
    
    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      if (str.includes(',') || str.includes(';') || str.includes('\n') || str.includes('"')) {
         return `"${str.replace(/"/g, '""')}"`;
      }
      if (/^[0-9\-]+$/.test(str) && str.length >= 5) {
         return `'${str}`; 
      }
      return str;
    };

    const csvRows = [headers.join(';')]; 
    
    teachers.forEach(t => {
      const row = [
        t.id, 
        t.name, 
        t.nipy, 
        t.gender, 
        t.pob, 
        t.dob, 
        (t.phone || '-'), // Data WA
        t.education, 
        t.status, 
        (t.workStatus || 'Aktif'), // 🪄 FITUR BARU: Export Keaktifan
        t.position, 
        t.tmt, 
        (t.family?.wife || 0), 
        (t.family?.children || 0)
      ].map(escapeCSV);
      csvRows.push(row.join(';'));
    });
    
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Profil_Dasar_Pegawai_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Parser Tanggal Super Pintar
    const parseDateSmart = (dateStr) => {
      if (!dateStr) return '';
      let str = dateStr.trim().toLowerCase();
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

      const regexSlash = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
      const matchSlash = str.match(regexSlash);
      if (matchSlash) {
         return `${matchSlash[3]}-${matchSlash[2].padStart(2, '0')}-${matchSlash[1].padStart(2, '0')}`;
      }

      const bulanMap = { 'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'mei': '05', 'jun': '06', 'jul': '07', 'agu': '08', 'sep': '09', 'okt': '10', 'nov': '11', 'des': '12', 'oct': '10', 'dec': '12' };
      const regexIndo = /^(\d{1,2})-(jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|oct|nov|des|dec)-(\d{2,4})$/;
      const matchIndo = str.match(regexIndo);
      if (matchIndo) {
        let y = matchIndo[3];
        if (y.length === 2) y = parseInt(y) > 30 ? `19${y}` : `20${y}`;
        return `${y}-${bulanMap[matchIndo[2]]}-${matchIndo[1].padStart(2, '0')}`;
      }

      const parsedDate = new Date(str);
      if (!isNaN(parsedDate.getTime())) return parsedDate.toISOString().split('T')[0];
      return dateStr; 
    };

    // ALGORITMA PARSER CSV SEJATI (Tahan banting dari format Excel)
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
          // Bersihkan trik Excel sebelumnya yang mungkin tersisa
          if (cln.startsWith('="') && cln.endsWith('"')) cln = cln.substring(2, cln.length - 1);
          if (cln.startsWith("'")) cln = cln.substring(1); 
          return cln;
      });
    };

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/); // Dukung format Windows & Mac
      if(lines.length < 2) {
         alert("Format file kosong atau tidak valid.");
         return;
      }
      
      // Deteksi otomatis separator (Koma, Titik Koma, atau Tab)
      let separator = ',';
      if (lines[0].includes(';')) separator = ';';
      else if (lines[0].includes('\t')) separator = '\t';
      
      const importedTeachers = [];
      let successCount = 0;

      for(let i = 1; i < lines.length; i++) {
        if(!lines[i].trim()) continue; // Abaikan baris kosong
        
        const values = parseCSVLine(lines[i], separator);
        
        // Pastikan kolom Nama (index 1) ada isinya untuk keamanan
        if (values.length >= 10 && values[1] !== "") {
           const impId = values[0];
           const impName = values[1];
           const isNewFormat = values.length >= 13;
           const impPhone = isNewFormat ? (values[6] || '-') : '-';
           const impEdu = isNewFormat ? (values[7] || 'S1') : (values[6] || 'S1');
           const impStatus = isNewFormat ? (values[8] || 'Tetap') : (values[7] || 'Tetap');
           const impWorkStatus = isNewFormat ? (values[9] || 'Aktif') : 'Aktif';
           const impPosition = isNewFormat ? (values[10] || 'Guru') : (values[8] || 'Guru');
           const impTmt = isNewFormat ? parseDateSmart(values[11]) : parseDateSmart(values[9]);
           const wifeStatus = isNewFormat ? Number(values[12] || 0) : Number(values[10] || 0);
           const childrenCount = isNewFormat ? Number(values[13] || 0) : Number(values[11] || 0);

           const existingId = teachers.find(t => t.id === impId || t.name.toLowerCase() === impName?.toLowerCase());
           
           const teacherObj = existingId ? { ...existingId } : { 
             id: impId && impId !== '' ? impId : generateUniqueId('G-'),
             family: { wife: wifeStatus, children: childrenCount },
             payroll: {
                tahunMasaKerja: new Date().getFullYear(),
                tunjanganMasaKerjaManual: '',
                jabatans: [{ kategori: 'Guru', detail: impPosition, kinerja: 'Baik', nominal: 0 }],
                pendidikan: { tingkat: impEdu, nominalOverride: '' },
                kompetensi: [],
                disiplin: { hadir: 0, telat: 0, tarifHadir: 1000, tarifTelat: 1000 },
                insentifTambahan: [],
                potonganLainnya: [],
                jamMengajar: { wajib: 0, realisasi: 0, tarifJPL: 10000, jsjm: 0 }, 
                isNotified: false,
                isConfirmed: false
             } 
           };

           teacherObj.name = impName;
           teacherObj.nipy = values[2] || '-';
           teacherObj.gender = values[3] || 'L';
           teacherObj.pob = values[4] || '-';
           teacherObj.dob = parseDateSmart(values[5]);
           teacherObj.phone = impPhone;
           teacherObj.education = impEdu;
           teacherObj.status = impStatus;
           teacherObj.workStatus = impWorkStatus;
           teacherObj.position = impPosition;
           teacherObj.tmt = impTmt;
           teacherObj.family = { wife: wifeStatus, children: childrenCount };
           if (teacherObj.payroll) {
              teacherObj.payroll.pendidikan = { tingkat: impEdu, nominalOverride: teacherObj.payroll?.pendidikan?.nominalOverride || '' };
              if (!teacherObj.payroll.jabatans || teacherObj.payroll.jabatans.length === 0) {
                 teacherObj.payroll.jabatans = [{ kategori: 'Guru', detail: impPosition, kinerja: 'Baik', nominal: 0 }];
              }
           }
           
           importedTeachers.push(sanitizeTeacherData(teacherObj));
           successCount++;
        }
      }

      setTeachers(prev => {
        const map = new Map(prev.map(t => [t.id, t]));
        importedTeachers.forEach(t => map.set(t.id, t));
        return sanitizeTeacherList(Array.from(map.values()));
      });
      
      alert(`Berhasil membaca ${successCount} baris data!\n\nPeriksa kembali apakah tampilannya sudah rapi. Data akan otomatis disinkronkan ke Supabase Cloud.`);
      e.target.value = null;
    };
    reader.readAsText(file);
  };
  
  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative">
      <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />

      {modal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          {/* 🪄 TAMBALAN CERDAS: max-h-[90dvh] agar form tidak tertutup keyboard HP dan bisa di-scroll mutlak */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                {modal.type === 'view' && <Eye className="text-blue-500"/>}
                {(modal.type === 'edit' || modal.type === 'add') && <Edit className="text-amber-500"/>}
                {modal.type === 'delete' && <Trash2 className="text-red-500"/>}
                {modal.type === 'view' ? 'Detail Profil Pegawai' : modal.type === 'edit' ? 'Edit Data Pegawai' : modal.type === 'add' ? 'Tambah Data Pegawai' : 'Hapus Data Pegawai'}
              </h3>
              <button onClick={closeModal} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>

            <div className="overflow-y-auto p-6 flex-1">
              {modal.type === 'view' && modal.data && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-slate-200 dark:border-slate-700 text-center sm:text-left">
                    <div>
                      <h2 className="text-2xl font-bold dark:text-white">{modal.data.name}</h2>
                      <p className="text-slate-500 dark:text-slate-400 mt-1">{modal.data.nipy} • {modal.data.position}</p>
                      <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${modal.data.status === 'Tetap' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>
                        Pegawai {modal.data.status}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div>
                      <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">Informasi Personal</h4>
                      <table className="w-full">
                        <tbody>
                          <tr><td className="py-1.5 text-slate-500 w-32">Jenis Kelamin</td><td className="font-medium dark:text-slate-200">: {modal.data.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Tempat Lahir</td><td className="font-medium dark:text-slate-200">: {modal.data.pob}</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Tanggal Lahir</td><td className="font-medium dark:text-slate-200">: {formatDateId(modal.data.dob)} <span className="text-blue-500 font-bold ml-1">({calculateYearsFromDate(modal.data.dob)} Thn)</span></td></tr>
                          {/* TAMBAHAN: Detail No WA */}
                          <tr><td className="py-1.5 text-slate-500">No. WhatsApp</td><td className="font-medium dark:text-slate-200">: {modal.data.phone || '-'}</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Pendidikan</td><td className="font-medium dark:text-slate-200">: {modal.data.education}</td></tr>
                          {/* 🪄 FITUR BARU: Tampilan Status Keaktifan di Detail Profil */}
                          <tr><td className="py-1.5 text-slate-500">Status Keaktifan</td><td className="font-medium dark:text-slate-200">: <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold shadow-sm ${modal.data.workStatus === 'Resign' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : modal.data.workStatus === 'Tidak Aktif' ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'}`}>{modal.data.workStatus || 'Aktif'}</span></td></tr>
                          <tr><td className="py-1.5 text-slate-500">Rekening Bank</td><td className="font-medium dark:text-slate-200">: {modal.data.bankName ? `${modal.data.bankName} - ${modal.data.bankAccount}` : '-'}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">Informasi Pekerjaan & Keluarga</h4>
                      <table className="w-full">
                        <tbody>
                          <tr><td className="py-1.5 text-slate-500 w-32">Mulai Tugas (TMT)</td><td className="font-medium dark:text-slate-200">: {formatDateId(modal.data.tmt)}</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Masa Kerja</td><td className="font-medium dark:text-slate-200">: {calculateYearsFromDate(modal.data.tmt)} Tahun</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Status Menikah</td><td className="font-medium dark:text-slate-200">: {modal.data.family?.wife === 1 ? 'Menikah' : modal.data.family?.wife === 2 ? 'Menikah (Ditanggung Suami)' : 'Belum Menikah'}</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Jumlah Anak</td><td className="font-medium dark:text-slate-200">: {modal.data.family?.wife === 1 ? (modal.data.family?.children || 0) : 0} Anak (Masuk Tunjangan)</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {(modal.type === 'edit' || modal.type === 'add') && (
                <form id="editForm" onSubmit={handleEditSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Nama Lengkap</label>
                      <input name="name" defaultValue={modal.data?.name || ''} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">NIPY</label>
                      <input name="nipy" defaultValue={modal.data?.nipy || ''} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Tempat Lahir</label>
                      <input name="pob" defaultValue={modal.data?.pob || ''} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Tanggal Lahir</label>
                      <input type="date" name="dob" defaultValue={formatToInputDate(modal.data?.dob)} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Jenis Kelamin</label>
                      <select name="gender" defaultValue={modal.data?.gender || 'L'} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="L">Laki-laki</option>
                        <option value="P">Perempuan</option>
                      </select>
                    </div>
                    {/* TAMBAHAN: Form No WA saat Edit/Tambah */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">No. WhatsApp Aktif</label>
                      <input type="tel" name="phone" defaultValue={modal.data?.phone || ''} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required placeholder="Cth: 081234567890" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Pendidikan</label>
                      <select name="education" defaultValue={modal.data?.education || 'S1'} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="S2">S2 / Magister</option>
                        <option value="S1">S1 / Sarjana</option>
                        <option value="Diploma">Diploma (D3/D4)</option>
                        <option value="SMA/Pondok">SMA / Pondok</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Status Pegawai</label>
                      <select name="status" defaultValue={modal.data?.status || 'Tetap'} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="Tetap">Tetap</option>
                        <option value="Tidak Tetap">Tidak Tetap</option>
                      </select>
                    </div>
                    {/* 🪄 FITUR BARU: Dropdown Status Keaktifan */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Keaktifan Pegawai</label>
                      <select name="workStatus" defaultValue={modal.data?.workStatus || 'Aktif'} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="Aktif">Aktif</option>
                        <option value="Tidak Aktif">Tidak Aktif (Cuti/Nonaktif)</option>
                        <option value="Resign">Resign (Berhenti)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">TMT (Mulai Tugas)</label>
                      <input type="date" name="tmt" defaultValue={formatToInputDate(modal.data?.tmt)} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Kompetensi & Jabatan Inti</label>
                      <input name="position" defaultValue={modal.data?.position || ''} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required placeholder="Cth: Wali Kelas / Guru Mapel" />
                    </div>

                    {/* TAMBAHAN BARU: Kolom Rekening Bank */}
                    <div className="md:col-span-2 pt-3 border-t border-slate-200 dark:border-slate-700 mt-2">
                       <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Informasi Rekening Bank</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                           <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Nama Bank</label>
                           <input name="bankName" defaultValue={modal.data?.bankName || ''} placeholder="Cth: BSI / Mandiri / BRI" className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Nomor Rekening</label>
                           <input type="text" name="bankAccount" defaultValue={modal.data?.bankAccount || ''} placeholder="Cth: 7123456789" className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
                         </div>
                       </div>
                    </div>
                    
                    {/* TAMBAHAN: Kolom Profil Keluarga */}
                    <div className="md:col-span-2 pt-3 border-t border-slate-200 dark:border-slate-700 mt-2">
                       <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Informasi Profil Keluarga</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                           <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Status Pasangan</label>
                           <select name="wife" defaultValue={modal.data?.family?.wife !== undefined ? modal.data.family.wife : 0} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-pink-500">
                             <option value="1">Menikah</option>
                             <option value="0">Belum Menikah</option>
                             <option value="2">Menikah (Ditanggung Suami/Pasangan)</option>
                           </select>
                         </div>
                         <div>
                           <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Jumlah Anak</label>
                           <input type="number" min="0" name="children" defaultValue={modal.data?.family?.children || 0} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-pink-500" required />
                         </div>
                       </div>
                    </div>

                  </div>
                </form>
              )}

              {modal.type === 'delete' && modal.data && (
                <div className="text-center py-6">
                  <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={40} />
                  </div>
                  <h3 className="text-xl font-bold dark:text-white mb-2">Hapus Data Pegawai?</h3>
                  <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    Apakah Anda yakin ingin menghapus data <span className="font-bold text-slate-700 dark:text-slate-200">{modal.data.name}</span>? 
                    Tindakan ini permanen dan akan menghapus seluruh riwayat pengaturan gajinya.
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={closeModal} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors">
                {modal.type === 'view' ? 'Tutup' : 'Batal'}
              </button>
              {(modal.type === 'edit' || modal.type === 'add') && (
                <button 
                  type="submit" 
                  form="editForm" 
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}
                  {isSaving ? 'Memproses...' : (modal.type === 'add' ? 'Tambahkan Pegawai' : 'Simpan Perubahan')}
                </button>
              )}
              {modal.type === 'delete' && (
                <button onClick={handleDelete} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-sm transition-colors">
                  Ya, Hapus Data
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0 mb-3 sm:mb-5">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1 flex items-center gap-2 sm:gap-3"><Users className="text-blue-200" size={22} /> Manajemen Data Pegawai</h1>
          <p className="text-blue-100 text-xs sm:text-sm">Kelola profil, jabatan, dan informasi kontak seluruh guru dan staff sekolah.</p>
        </div>
        <Users size={100} className="absolute -right-6 -top-6 text-white/10 transform -rotate-12 pointer-events-none hidden sm:block" />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-full">
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <h3 className="text-sm sm:text-base font-bold dark:text-white flex items-center gap-2 shrink-0">Daftar Lengkap Pegawai</h3>
          
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 w-full xl:w-auto items-stretch sm:items-center">
            
            {/* Filter Dropdown Status Golongan & Keaktifan (2 Kolom Rapi di Mobile) */}
            <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white text-slate-700 dark:text-slate-300 shadow-sm"
              >
                <option value="Semua">Semua Golongan</option>
                <option value="Tetap">Guru Tetap</option>
                <option value="Tidak Tetap">Guru Tidak Tetap</option>
              </select>

              <select 
                value={filterWorkStatus}
                onChange={(e) => setFilterWorkStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white text-slate-700 dark:text-slate-300 shadow-sm"
              >
                <option value="Semua">Semua Kondisi</option>
                <option value="Aktif">Aktif Saja</option>
                <option value="Tidak Aktif">Tidak Aktif (Cuti)</option>
                <option value="Resign">Telah Resign</option>
              </select>
            </div>

            <div className="relative w-full sm:w-56 md:w-64 flex-grow sm:flex-grow-0">
              <Search className="absolute left-2.5 top-2 text-slate-400" size={15} />
              <input 
                type="text" 
                placeholder="Cari Nama / NIPY..." 
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
              />
            </div>
            
            <div className="grid grid-cols-4 gap-1.5 w-full sm:flex sm:w-auto">
              <button 
                type="button"
                onClick={handleCleanDuplicates}
                className="justify-center bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                title="Pindai dan bersihkan data ganda / duplikat"
              >
                 <Sparkles size={14} className="text-amber-600 dark:text-amber-400" /> <span className="hidden sm:inline">Bersihkan</span><span className="sm:hidden">Bersih</span>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm">
                 <Upload size={14} /> <span>Impor</span>
              </button>
              <button onClick={handleExportCSV} className="justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm">
                 <Download size={14} /> <span>Ekspor</span>
              </button>
              <button onClick={() => openModal('add', null)} className="justify-center bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm">
                 <PlusCircle size={14} /> <span>Tambah</span>
              </button>
            </div>
          </div>
        </div>
        
        {/* FITUR BARU: Tampilan Kartu Responsif Khusus Layar HP (< md) */}
        <div className="md:hidden space-y-2.5 p-2.5 sm:p-4">
          {filtered.map(t => (
            <div key={t.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-white">{t.name}</h4>
                  <div className="text-[11px] text-slate-500 mt-0.5">{t.nipy} • {t.position}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.status === 'Tetap' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>
                  {t.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                <div><span className="text-slate-400">Pendidikan:</span> <span className="font-medium block dark:text-slate-200 truncate">{t.education}</span></div>
                <div><span className="text-slate-400">Keaktifan:</span> <span className="font-medium block text-blue-600 dark:text-blue-400">{t.workStatus || 'Aktif'}</span></div>
                <div><span className="text-slate-400">No WA:</span> <span className="font-medium block dark:text-slate-200 truncate">{t.phone || '-'}</span></div>
                <div><span className="text-slate-400">TMT:</span> <span className="font-medium block dark:text-slate-200">{formatDateId(t.tmt)}</span></div>
              </div>

              <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                <button onClick={() => openModal('view', t)} className="px-2.5 py-1 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-xs font-bold flex items-center gap-1">
                  <Eye size={13}/> Detail
                </button>
                <button onClick={() => openModal('edit', t)} className="px-2.5 py-1 bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 rounded-lg text-xs font-bold flex items-center gap-1">
                  <Edit size={13}/> Edit
                </button>
                <button onClick={() => openModal('delete', t)} className="px-2.5 py-1 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-xs font-bold flex items-center gap-1">
                  <Trash2 size={13}/> Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
        
        <div className="hidden md:block overflow-x-auto flex-1 scrollbar-thin">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
            <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700">Profil Pegawai</th>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700">Lahir & Kontak</th>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700">Status Pegawai</th>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700">Kompetensi & Jabatan</th>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700">Pendidikan</th>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700">Masa Kerja (TMT)</th>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/80">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                  <td className="p-4">
                    <div className="font-bold text-slate-800 dark:text-slate-200">{t.name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{t.nipy}</div>
                    {/* 🪄 FITUR BARU: Lencana Visual untuk Keaktifan Pegawai */}
                    {(t.workStatus === 'Resign' || t.workStatus === 'Tidak Aktif') && (
                      <span className={`inline-block mt-1.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shadow-sm ${t.workStatus === 'Resign' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}>
                        {t.workStatus}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="text-slate-700 dark:text-slate-300 font-medium">
                      {t.pob}, {formatDateId(t.dob)} <span className="text-blue-500 font-bold ml-1">({calculateYearsFromDate(t.dob)} thn)</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Gender: {t.gender === 'L' ? 'Laki-laki' : 'Perempuan'} • WA: {t.phone || '-'}</div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${t.status === 'Tetap' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-slate-700 dark:text-slate-300">{t.position}</div>
                  </td>
                  <td className="p-4 text-slate-700 dark:text-slate-300 font-medium">
                    {t.education}
                  </td>
                  <td className="p-4">
                    <div className="text-slate-700 dark:text-slate-300 font-medium">{formatDateId(t.tmt)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{calculateYearsFromDate(t.tmt)} Tahun</div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => openModal('view', t)} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-lg transition-colors shadow-sm" title="Lihat Detail">
                        <Eye size={16} />
                      </button>
                      <button onClick={() => openModal('edit', t)} className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 rounded-lg transition-colors shadow-sm" title="Edit Data">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => openModal('delete', t)} className="p-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition-colors shadow-sm" title="Hapus Data">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="7" className="p-8 text-center text-slate-500">Tidak ada data pegawai ditemukan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- VIEW REKAP PINJAMAN / KASBON YANG HILANG (DIKEMBALIKAN) ---
export { DataGuruView };
