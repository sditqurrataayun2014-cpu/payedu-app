import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle, Check, CheckCircle, Clock, Download, Edit,
  FileText, Fingerprint, Save, Search, Sparkles, Trash2,
  Upload, UserCheck, X
} from 'lucide-react';

import {
  getFormattedPeriod, isTeacherActive, safeStorageSet
} from '../../utils/payrollUtils';
import { exportTeachingHoursToExcel } from '../../services/excelExportService';
import { pushCloudData as pushToSupabase } from '../../services/dbService';

export default function RekapAbsensiView({ teachers, setTeachers, externalFilter, setExternalFilter, settings, presensiGuru = [], saveAuditLog, user }) {
  const [search, setSearch] = useState('');
  const fileInputRef = useRef(null);
  const mesinInputRef = useRef(null); // TAMBAHAN: Ref khusus untuk mesin absen
  const bulan = getFormattedPeriod(settings?.payrollPeriod);

  // STATE BARU UNTUK FITUR EDIT MANUAL & FILTER
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingData, setEditingData] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  
  // FITUR BARU: State untuk Micro-Interaction Tombol Simpan
  const [isSaving, setIsSaving] = useState(false);
  
  // TAMBAHAN: Modal Konfirmasi Reset (Pengganti window.confirm)
  const [confirmReset, setConfirmReset] = useState(false);

  // 🪄 FITUR BARU: Sinkronisasi Keterlambatan dari Presensi Guru & Staff
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncMethod, setSyncMethod] = useState('sesi'); // 'sesi' = per sesi keterlambatan | 'hari' = per hari unik
  const [syncFilterTab, setSyncFilterTab] = useState('all'); // 'all' | 'diff' | 'late'
  const [syncModalSearch, setSyncModalSearch] = useState('');
  const [selectedSyncIds, setSelectedSyncIds] = useState([]);
  const [syncToast, setSyncToast] = useState(null);

  // Periode bulan aktif format 'YYYY-MM'
  const currentPeriod = settings?.payrollPeriod || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const activeTeachers = useMemo(() => (teachers || []).filter(isTeacherActive), [teachers]);

  // Mapping data keterlambatan dari presensiGuru untuk setiap guru pada periode aktif
  const teacherPresensiMap = useMemo(() => {
    const map = {};
    if (!Array.isArray(presensiGuru) || presensiGuru.length === 0) return map;
    
    activeTeachers.forEach(t => {
      const tIdStr = String(t.id).trim();
      const tNameClean = (t.name || '').trim().toLowerCase();

      const matched = presensiGuru.filter(r => {
        if (!r) return false;
        const rDate = String(r.date || r.tanggal || '');
        if (!rDate.startsWith(currentPeriod)) return false;

        const rIdStr = String(r.teacherId || '').trim();
        const rNameClean = String(r.teacherName || '').trim().toLowerCase();

        return (rIdStr && rIdStr === tIdStr) ||
          (tNameClean && rNameClean && (rNameClean === tNameClean || rNameClean.replace(/[^a-z0-9]/g, '') === tNameClean.replace(/[^a-z0-9]/g, '')));
      });

      const lateRecords = matched.filter(r => r.status === 'Terlambat' || (Number(r.terlambatMenit) || 0) > 0);
      const totalSessionsLate = lateRecords.length;
      const uniqueDaysLate = new Set(lateRecords.map(r => r.date || r.tanggal)).size;
      const totalMinutesLate = lateRecords.reduce((sum, r) => sum + (Number(r.terlambatMenit) || 0), 0);

      const details = lateRecords.map(r => {
        const rawDate = r.date || r.tanggal || '';
        const tglNum = rawDate.split('-')[2] || rawDate;
        const sesi = r.sesiNama || (r.sesiId === 'sore' ? 'Sesi Sore' : 'Sesi Pagi');
        const jam = r.jamMasuk ? r.jamMasuk.slice(0, 5) : '-';
        const menit = r.terlambatMenit ? `${r.terlambatMenit}m` : '';
        return `Tgl ${tglNum} (${sesi}, ${jam}${menit ? `, +${menit}` : ''})`;
      });

      map[t.id] = {
        matchedCount: matched.length,
        totalSessionsLate,
        uniqueDaysLate,
        totalMinutesLate,
        details,
        lateRecords
      };
    });

    return map;
  }, [presensiGuru, activeTeachers, currentPeriod]);

  // Total guru yang terlambat di Presensi Guru bulan ini
  const totalGuruTelatPresensi = useMemo(() => {
    return Object.values(teacherPresensiMap).filter(v => v.totalSessionsLate > 0).length;
  }, [teacherPresensiMap]);

  // Daftar komparasi antara Rekap Tabel vs Presensi Guru
  const syncComparisonList = useMemo(() => {
    return activeTeachers.map(t => {
      const pInfo = teacherPresensiMap[t.id] || { totalSessionsLate: 0, uniqueDaysLate: 0, totalMinutesLate: 0, details: [] };
      const presensiLate = syncMethod === 'hari' ? pInfo.uniqueDaysLate : pInfo.totalSessionsLate;
      const tableLate = t.payroll?.disiplin?.telat !== undefined ? Number(t.payroll.disiplin.telat) : 0;
      const isDiff = presensiLate !== tableLate;
      return {
        id: t.id,
        name: t.name,
        nipy: t.nipy || t.nip || '-',
        position: t.position || 'Guru',
        tableLate,
        presensiLate,
        isDiff,
        details: pInfo.details,
        totalMinutesLate: pInfo.totalMinutesLate
      };
    });
  }, [activeTeachers, teacherPresensiMap, syncMethod]);

  // Filter list per pencarian dan tab di dalam modal
  const filteredSyncList = useMemo(() => {
    return syncComparisonList.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(syncModalSearch.toLowerCase()) || item.nipy.toLowerCase().includes(syncModalSearch.toLowerCase());
      if (!matchSearch) return false;
      if (syncFilterTab === 'diff') return item.isDiff;
      if (syncFilterTab === 'late') return item.presensiLate > 0;
      return true;
    });
  }, [syncComparisonList, syncModalSearch, syncFilterTab]);

  // Buka modal sinkronisasi dan pre-select guru yang berbeda / terlambat
  const handleOpenSyncModal = () => {
    const diffIds = syncComparisonList
      .filter(item => item.isDiff || item.presensiLate > 0)
      .map(item => item.id);
    setSelectedSyncIds(diffIds.length > 0 ? diffIds : syncComparisonList.map(item => item.id));
    setIsSyncModalOpen(true);
  };

  // Terapkan sinkronisasi massal dari Presensi Guru ke tabel Rekap Jam Mengajar
  const handleApplySync = () => {
    if (selectedSyncIds.length === 0) {
      alert("Silakan pilih minimal 1 pegawai untuk disinkronkan.");
      return;
    }

    setIsSaving(true);
    const selectedSet = new Set(selectedSyncIds);

    const updatedTeachers = teachers.map(t => {
      if (selectedSet.has(t.id)) {
        const pInfo = teacherPresensiMap[t.id];
        const newLate = pInfo ? (syncMethod === 'hari' ? pInfo.uniqueDaysLate : pInfo.totalSessionsLate) : 0;
        return {
          ...t,
          payroll: {
            ...(t.payroll || {}),
            disiplin: {
              ...(t.payroll?.disiplin || {}),
              telat: newLate
            }
          }
        };
      }
      return t;
    });

    setTeachers(updatedTeachers);
    safeStorageSet('payedu_teachers', updatedTeachers);
    pushToSupabase('SAVE_TEACHERS', updatedTeachers).catch(err => {
      console.warn("Gagal simpan sync telat ke cloud:", err);
    });

    saveAuditLog?.(
      user?.name || 'Administrator',
      'Tarik Telat dari Presensi',
      `${selectedSyncIds.length} Pegawai`,
      `Sinkronisasi otomatis kolom Telat dari menu Presensi Guru & Staff periode ${bulan} (${syncMethod === 'hari' ? 'Metode Hari Unik' : 'Metode Sesi'})`,
      'finansial'
    );

    setIsSaving(false);
    setIsSyncModalOpen(false);
    setSyncToast(`Berhasil! Data keterlambatan untuk ${selectedSyncIds.length} pegawai telah disinkronkan langsung ke tabel.`);
    setTimeout(() => setSyncToast(null), 4000);
  };

  useEffect(() => {
    if (externalFilter && externalFilter !== 'all') {
      setActiveFilter(externalFilter);
      if (setExternalFilter) setExternalFilter('all'); // Reset agar tidak tersangkut
    }
  }, [externalFilter, setExternalFilter]);

  const filtered = activeTeachers.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.nipy.includes(search);
    
    let matchFilter = true;
    if (activeFilter === 'kurang_jam') {
      const wajib = t.payroll?.jamMengajar?.wajib !== undefined && t.payroll?.jamMengajar?.wajib !== '' ? Number(t.payroll.jamMengajar.wajib) : (t.status === 'Tetap' ? 60 : 0);
      const real = t.payroll?.jamMengajar?.realisasi || 0;
      if (real >= wajib) matchFilter = false;
    } else if (activeFilter === 'sering_telat') {
      const telat = t.payroll?.disiplin?.telat || 0;
      if (telat < 3) matchFilter = false;
    }
    
    return matchSearch && matchFilter;
  });

  // TAMBAHAN: Kalkulasi Statistik Ringkasan Absensi
  const stats = useMemo(() => {
    let totalJam = 0;
    let kurangJam = 0;
    let seringTelat = 0;

    activeTeachers.forEach(t => {
      const real = t.payroll?.jamMengajar?.realisasi || 0;
      const wajib = t.payroll?.jamMengajar?.wajib !== undefined && t.payroll?.jamMengajar?.wajib !== '' ? Number(t.payroll.jamMengajar.wajib) : (t.status === 'Tetap' ? 60 : 0);
      const telat = t.payroll?.disiplin?.telat || 0;

      totalJam += real;
      if (real < wajib) kurangJam++;
      if (telat >= 10) seringTelat++; // Standar 'sering telat' = 3 kali atau lebih
    });

    return { totalJam, kurangJam, seringTelat };
  }, [activeTeachers]);

  // Fungsi Helper untuk mensimulasikan sebaran jam mengajar 1-31 hari (Preview)
  // Ini akan memecah "Total Realisasi" ke beberapa tanggal agar tabel tidak kosong
  const getDailyHours = (total, teacherId) => {
    const days = Array(31).fill('');
    if (total > 0) {
       let remaining = total;
       let dayIdx = teacherId.charCodeAt(teacherId.length - 1) % 7; // Mulai di hari acak
       while (remaining > 0 && dayIdx < 31) {
          const hoursToday = Math.min(4, remaining); // Maksimal 4 JPL per hari
          days[dayIdx] = hoursToday;
          remaining -= hoursToday;
          dayIdx += 2; // Lompat 1 hari
          if (dayIdx >= 31 && remaining > 0) dayIdx = 1; // Ulang ke awal jika masih ada sisa
       }
    }
    return days;
  };

  // TAMBAHAN: Fungsi Reset Data Bulan Baru dengan Custom Modal
  const handleResetBulan = () => {
    setConfirmReset(true);
  };

  const executeResetBulan = () => {
    setTeachers(prev => prev.map(t => ({
      ...t,
      payroll: {
        ...t.payroll,
        jamMengajar: {
          ...t.payroll.jamMengajar,
          harian: Array(31).fill(''),
          realisasi: 0,
          jamPlus: 0
        },
        disiplin: {
          ...t.payroll.disiplin,
          telat: 0
        }
      }
    })));
    setConfirmReset(false);
    setTimeout(() => alert("Sukses! Data absensi seluruh guru telah dibersihkan untuk periode bulan baru."), 300);
  };

  const handleExportExcel = () => {
    try {
      exportTeachingHoursToExcel({
        teachers: filtered,
        settings,
        presensiGuru,
        bulan
      });
      return;
    } catch (err) {
      console.warn("Ekspor xlsx gagal, fallback ke CSV:", err);
    }
    const daysHeaders = Array.from({ length: 31 }, (_, i) => `Tgl ${i + 1}`);
    const headers = ['Nama Guru', ...daysHeaders, 'Jam +', 'Total', 'Wajib', 'JSJM', 'Selisih', 'Telat', 'Tepat Waktu'];
    
    // Menggunakan pemisah titik koma (;) agar lebih rapi saat dibuka di Microsoft Excel region Indonesia
    const csvRows = [headers.join(';')];
    
    filtered.forEach(t => {
      const wajib = t.payroll?.jamMengajar?.wajib !== undefined && t.payroll?.jamMengajar?.wajib !== '' ? Number(t.payroll.jamMengajar.wajib) : (t.status === 'Tetap' ? 60 : 0);
      const real = t.payroll?.jamMengajar?.realisasi || 0;
      const jsjm = t.payroll?.jamMengajar?.jsjm || 0;
      const jamPlus = t.payroll?.jamMengajar?.jamPlus || 0;
      const selisih = (real + jsjm) - wajib + jamPlus;
      const telat = t.payroll?.disiplin?.telat || 0;
      const tepatWaktu = Math.max(0, real - telat);
      
      const dailyData = t.payroll?.jamMengajar?.harian || getDailyHours(real, t.id);
      const dailyString = dailyData.map(d => d || '').join(';');
      
      const row = [`"${t.name}"`, dailyString, jamPlus, real, wajib, jsjm, selisih, telat, tepatWaktu];
      csvRows.push(row.join(';'));
    });
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Rekap_Absen_Mengajar_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PERBAIKAN: Fungsi Import sekarang menyerap data Tgl 1 sampai Tgl 31 secara presisi
  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split('\n');
      if (lines.length < 2) {
         alert('Format CSV tidak valid atau kosong.');
         return;
      }

      // Deteksi pemisah cerdas (, atau ;)
      const separator = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(separator).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
      
      const nameIdx = headers.findIndex(h => h.includes('nama'));
      const totalIdx = headers.findIndex(h => h === 'total' || h.includes('realisasi'));

      // Deteksi indeks untuk kolom Tgl 1 sampai Tgl 31
      const dailyIndices = [];
      for (let i = 1; i <= 31; i++) {
         dailyIndices.push(headers.findIndex(h => h === `tgl ${i}`));
      }

      if (nameIdx === -1 || totalIdx === -1) {
         alert('Format kolom tidak dikenali. Pastikan ada judul kolom "Nama Guru" dan "Total".');
         return;
      }

      let updatedCount = 0;
      const updatedTeachers = [...teachers];

      for (let i = 1; i < lines.length; i++) {
         if (!lines[i].trim()) continue;
         
         const regex = new RegExp(`${separator}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
         const values = lines[i].split(regex).map(v => v.replace(/^"|"$/g, '').trim());

         const teacherName = values[nameIdx];
         const jamVal = parseInt(values[totalIdx], 10);

         // Ekstrak data harian (Tgl 1 - 31) dari baris ini
         const harianData = Array(31).fill('');
         for (let d = 0; d < 31; d++) {
            if (dailyIndices[d] !== -1 && values[dailyIndices[d]]) {
               harianData[d] = values[dailyIndices[d]].toUpperCase();
            }
         }

         if (teacherName && !isNaN(jamVal)) {
            // Pencarian cerdas berdasarkan nama guru
            const teacherIndex = updatedTeachers.findIndex(t => t.name.toLowerCase() === teacherName.toLowerCase());
            if (teacherIndex !== -1) {
               // 🪄 Hitung otomatis Hari Hadir dari data impor
               let autoHadir = 0;
               harianData.forEach(val => {
                 if (!isNaN(val) && Number(val) > 0) autoHadir++;
               });

               updatedTeachers[teacherIndex] = {
                  ...updatedTeachers[teacherIndex],
                  payroll: {
                     ...updatedTeachers[teacherIndex].payroll,
                     jamMengajar: {
                        ...updatedTeachers[teacherIndex].payroll.jamMengajar,
                        realisasi: jamVal,
                        harian: harianData // <- Menyimpan rincian harian
                     },
                     disiplin: {
                        ...(updatedTeachers[teacherIndex].payroll?.disiplin || {}),
                        hadir: autoHadir // Disimpan otomatis
                     }
                  }
               };
               updatedCount++;
            }
         }
      }

      if (updatedCount > 0) {
        setTeachers(updatedTeachers);
        alert(`Berhasil! Total jam dan rincian harian (Tgl 1-31) untuk ${updatedCount} guru telah diperbarui ke dalam sistem.`);
      } else {
        alert('Tidak ada data guru yang cocok untuk diperbarui.');
      }
      e.target.value = null; // Reset input
    };
    reader.readAsText(file);
  };

  // FITUR BARU 1: Integrasi Mesin Absensi (Fingerprint/FaceID seperti Solution)
  const handleImportMesinAbsen = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsSaving(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split('\n');
      if (lines.length < 2) {
         setIsSaving(false);
         alert('Format file mesin tidak valid atau kosong.');
         return;
      }

      // Deteksi pemisah cerdas (Tab, Titik Koma, atau Koma)
      const separator = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
      const headers = lines[0].split(separator).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
      
      // Deteksi Kolom Pintar untuk format mesin
      const nameIdx = headers.findIndex(h => h.includes('nama') || h === 'name');
      const hadirIdx = headers.findIndex(h => h.includes('hadir') || h.includes('normal') || h.includes('hk') || h.includes('kehadiran'));
      const telatIdx = headers.findIndex(h => h.includes('telat') || h.includes('terlambat') || h.includes('late'));

      if (nameIdx === -1 || hadirIdx === -1) {
         setIsSaving(false);
         alert('Gagal mendeteksi kolom. Pastikan file export dari mesin memiliki kolom "Nama" dan "Hadir/Normal".');
         return;
      }

      let updatedCount = 0;
      const updatedTeachers = [...teachers];

      for (let i = 1; i < lines.length; i++) {
         if (!lines[i].trim()) continue;
         
         const values = lines[i].split(separator).map(v => v.replace(/^"|"$/g, '').trim());
         const teacherName = values[nameIdx];
         const hadirVal = parseInt(values[hadirIdx], 10);
         const telatVal = telatIdx !== -1 ? parseInt(values[telatIdx], 10) : 0;

         if (teacherName && !isNaN(hadirVal)) {
            // Pencocokan cerdas berdasarkan nama guru
            const teacherIndex = updatedTeachers.findIndex(t => t.name.toLowerCase() === teacherName.toLowerCase());
            if (teacherIndex !== -1) {
               updatedTeachers[teacherIndex] = {
                  ...updatedTeachers[teacherIndex],
                  payroll: {
                     ...updatedTeachers[teacherIndex].payroll,
                     jamMengajar: {
                        ...updatedTeachers[teacherIndex].payroll.jamMengajar,
                        realisasi: hadirVal // Asumsi hadir harian = realisasi (Bisa disesuaikan dengan rule sekolah)
                     },
                     disiplin: {
                        ...updatedTeachers[teacherIndex].payroll.disiplin,
                        telat: isNaN(telatVal) ? 0 : telatVal
                     }
                  }
               };
               updatedCount++;
            }
         }
      }

      setIsSaving(false);
      if (updatedCount > 0) {
        setTeachers(updatedTeachers);
        alert(`Integrasi Mesin Berhasil! Data kehadiran dan keterlambatan untuk ${updatedCount} pegawai telah terisi otomatis.`);
      } else {
        alert('Tidak ada nama guru dari mesin yang cocok dengan data di sistem aplikasi.');
      }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  // FUNGSI HANDLER UNTUK EDIT MANUAL
  const handleOpenEdit = (t) => {
    const real = t.payroll?.jamMengajar?.realisasi || 0;
    // Ambil data harian yang ada, atau buat simulasi jika belum ada
    const dailyData = t.payroll?.jamMengajar?.harian || getDailyHours(real, t.id);
    
    // Pastikan array selalu berisi 31 elemen untuk tanggal 1-31
    const safeData = Array.from({length: 31}, (_, i) => dailyData[i] !== undefined ? dailyData[i] : '');

    setEditingData({
      id: t.id,
      name: t.name,
      harian: safeData,
      telat: t.payroll?.disiplin?.telat !== undefined ? t.payroll?.disiplin?.telat : 0
    });
    setIsEditModalOpen(true);
  };

  // 🪄 TAMBALAN CERDAS: Fungsi ini yang sebelumnya hilang untuk menangani ketikan Bapak
  const handleHarianChange = (index, value) => {
    // Ubah input menjadi huruf besar otomatis dan batasi 2 karakter (cth: 4, S, I, A)
    let cleanVal = value.toUpperCase().slice(0, 2);
    
    setEditingData(prev => {
      const newHarian = [...prev.harian];
      newHarian[index] = cleanVal;
      return { ...prev, harian: newHarian };
    });
  };

  const handleSaveEdit = () => {
    setIsSaving(true); // Aktifkan animasi loading
    
    // Hitung ulang total realisasi berdasarkan input 31 hari (Hanya menjumlahkan angka)
    const totalRealisasi = editingData.harian.reduce((sum, val) => sum + (Number(val) || 0), 0);
    
    // 🪄 TAMBALAN CERDAS: Hitung otomatis Hari Hadir untuk disimpan
    let autoHadir = 0;
    editingData.harian.forEach(val => {
       if (!isNaN(val) && Number(val) > 0) autoHadir++;
    });

    const newTelat = editingData.telat !== '' && editingData.telat !== undefined ? Math.max(0, Number(editingData.telat)) : 0;

    // Memberikan jeda (delay) visual cerdas
    setTimeout(() => {
      const updated = teachers.map(t => {
        if (t.id === editingData.id) {
          return {
            ...t,
            payroll: {
              ...(t.payroll || {}),
              jamMengajar: {
                ...(t.payroll?.jamMengajar || {}),
                harian: editingData.harian,
                realisasi: totalRealisasi
              },
              disiplin: {
                ...(t.payroll?.disiplin || {}),
                hadir: autoHadir,
                telat: newTelat
              }
            }
          };
        }
        return t;
      });

      setTeachers(updated);
      safeStorageSet('payedu_teachers', updated);
      pushToSupabase('SAVE_TEACHERS', updated).catch(e => console.warn(e));
      
      setIsSaving(false); // Matikan loading
      setIsEditModalOpen(false);
      setEditingData(null);
    }, 400);
  };

  // FUNGSI BARU: Untuk mengubah jam wajib langsung di tabel
  const handleInlineWajibChange = (teacherId, newValue) => {
    const wajibVal = newValue === '' ? '' : Math.max(0, Number(newValue));
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        return {
          ...t,
          payroll: {
            ...(t.payroll || {}),
            jamMengajar: {
              ...(t.payroll?.jamMengajar || {}),
              wajib: wajibVal
            }
          }
        };
      }
      return t;
    }));
  };

  // FUNGSI BARU: Untuk mengubah JSJM (Jabatan Setara Jam Mengajar)
  const handleInlineJsjmChange = (teacherId, newValue) => {
    const jsjmVal = newValue === '' ? '' : Math.max(0, Number(newValue));
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        return {
          ...t,
          payroll: {
            ...(t.payroll || {}),
            jamMengajar: {
              ...(t.payroll?.jamMengajar || {}),
              jsjm: jsjmVal
            }
          }
        };
      }
      return t;
    }));
  };

  // FUNGSI BARU: Untuk mengubah Jam Plus (Tambahan Jam) langsung di tabel
  const handleInlineJamPlusChange = (teacherId, newValue) => {
    const jamPlusVal = newValue === '' ? '' : Math.max(0, Number(newValue));
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        return {
          ...t,
          payroll: {
            ...(t.payroll || {}),
            jamMengajar: {
              ...(t.payroll?.jamMengajar || {}),
              jamPlus: jamPlusVal
            }
          }
        };
      }
      return t;
    }));
  };

  // 🪄 TAMBALAN CERDAS: Fungsi untuk mengubah jumlah telat langsung di tabel (Manual/Quick-Sync)
  const handleInlineTelatChange = (teacherId, newValue) => {
    const telatVal = newValue === '' ? '' : Math.max(0, Number(newValue));
    const target = teachers.find(t => t.id === teacherId);
    const oldVal = target?.payroll?.disiplin?.telat || 0;

    const updated = teachers.map(t => {
      if (t.id === teacherId) {
        return {
          ...t,
          payroll: {
            ...(t.payroll || {}),
            disiplin: {
              ...(t.payroll?.disiplin || {}),
              telat: telatVal
            }
          }
        };
      }
      return t;
    });

    setTeachers(updated);
    safeStorageSet('payedu_teachers', updated);

    if (saveAuditLog && target && Number(oldVal) !== Number(telatVal)) {
      saveAuditLog(
        user?.name || 'Administrator',
        'Ubah Keterlambatan',
        target.name,
        `Mengubah keterlambatan ${target.name} dari ${oldVal} menjadi ${telatVal} kali`,
        'finansial'
      );
    }
  };

  // 🪄 FUNGSI BARU: Mengubah TMT langsung di tabel Gaji dan mereset override nominal
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

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative pb-4 min-h-0">
      
      {/* MODAL KONFIRMASI RESET ABSEN */}
      {confirmReset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Peringatan Zona Merah!</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Apakah Anda yakin ingin <strong>MENGOSONGKAN</strong> seluruh data absen harian (Tgl 1-31), total realisasi, dan angka telat untuk <strong>SEMUA PEGAWAI</strong>?
              </p>
              <p className="text-red-500 dark:text-red-400 text-xs mt-3 font-semibold bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-800">
                Lakukan tindakan ini HANYA JIKA Anda ingin memulai rekapitulasi di awal bulan baru.
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmReset(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeResetBulan} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <Trash2 size={16} /> Ya, Kosongkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT MANUAL REKAP ABSEN */}
      {isEditModalOpen && editingData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                <Edit className="text-emerald-500"/> Edit Rekap Manual - {editingData.name}
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              
              {/* Input Jam Mengajar 1-31 */}
              <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-3 gap-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rincian Jam Mengajar (Tanggal 1 - 31)</label>
                  
                  {/* 🪄 TAMBALAN CERDAS: Hitungan Live S/I/A/Hadir untuk memudahkan Admin */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
                    <div className="flex gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                      <span className="text-emerald-600 dark:text-emerald-400">Hadir: {editingData.harian.filter(v => !isNaN(v) && Number(v)>0).length}</span>
                      <span className="text-amber-500 border-l border-slate-300 dark:border-slate-600 pl-2">S: {editingData.harian.filter(v => String(v).toUpperCase()==='S').length}</span>
                      <span className="text-blue-500 border-l border-slate-300 dark:border-slate-600 pl-2">I: {editingData.harian.filter(v => String(v).toUpperCase()==='I').length}</span>
                      <span className="text-red-500 border-l border-slate-300 dark:border-slate-600 pl-2">A: {editingData.harian.filter(v => String(v).toUpperCase()==='A').length}</span>
                    </div>
                    
                    <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 px-3 py-1.5 rounded-lg shadow-sm whitespace-nowrap">
                      Total: {editingData.harian.reduce((sum, val) => sum + (Number(val) || 0), 0)} JPL
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {editingData.harian.map((val, idx) => (
                    <div key={idx} className="flex flex-col">
                      <span className="text-[10px] font-semibold text-slate-500 text-center mb-1 bg-slate-100 dark:bg-slate-700 rounded py-0.5 border border-slate-200 dark:border-slate-600">Tgl {idx + 1}</span>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => handleHarianChange(idx, e.target.value)}
                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-center text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white transition-all uppercase"
                        maxLength={2}
                      />
                    </div>
                  ))}
                </div>
                {/* 🪄 INPUT TAMBAHAN: Keterlambatan (Disiplin) dengan tombol Tarik dari Presensi */}
                <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="bg-red-50/50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5 uppercase tracking-wider">
                        <Clock className="text-red-500" size={15} /> Keterlambatan Kehadiran (Disiplin)
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Jumlah keterlambatan masuk kelas untuk perhitungan potongan disiplin periode {bulan}.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="number"
                          min="0"
                          value={editingData.telat !== undefined ? editingData.telat : 0}
                          onChange={(e) => setEditingData(prev => ({ ...prev, telat: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="w-16 p-1.5 text-center border border-red-300 dark:border-red-600 rounded-lg bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 font-black text-sm focus:ring-2 focus:ring-red-500 outline-none shadow-xs"
                          placeholder="0"
                        />
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Kali</span>
                      </div>
                      {(teacherPresensiMap[editingData.id]?.totalSessionsLate || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setEditingData(prev => ({ ...prev, telat: teacherPresensiMap[editingData.id].totalSessionsLate }))}
                          className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 dark:text-amber-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-xs whitespace-nowrap"
                          title={`Presensi mencatat ${teacherPresensiMap[editingData.id].totalSessionsLate} kali terlambat bulan ini`}
                        >
                          <Sparkles size={13} className="text-amber-500" />
                          Tarik Presensi ({teacherPresensiMap[editingData.id].totalSessionsLate}x)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsEditModalOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors text-sm">
                Batal
              </button>
              <button 
                onClick={handleSaveEdit} 
                disabled={isSaving}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm transition-colors text-sm flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}
                {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🪄 MODAL BARU: SINKRONISASI KETERLAMBATAN DARI PRESENSI GURU & STAFF */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200">
            {/* Header Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-700 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl shadow-inner border border-white/20">
                  <UserCheck size={22} className="text-emerald-300" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                    Tarik Keterlambatan dari Presensi Guru
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 font-medium">Periode {bulan}</span>
                  </h3>
                  <p className="text-xs text-teal-100 mt-0.5">
                    Sinkronkan jumlah keterlambatan dari modul Presensi Guru & Staff langsung ke kolom Telat tabel Rekap Jam Mengajar.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsSyncModalOpen(false)} 
                className="p-1.5 hover:bg-white/20 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20}/>
              </button>
            </div>

            {/* Pilihan Metode Perhitungan & Summary */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 space-y-4 shrink-0">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-teal-600 dark:text-teal-400" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Metode Perhitungan Keterlambatan:
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-slate-200 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setSyncMethod('sesi')}
                    className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${syncMethod === 'sesi' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                  >
                    <span>Jumlah Sesi Terlambat</span>
                    <span className="text-[10px] opacity-75 font-normal">(Standar)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncMethod('hari')}
                    className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${syncMethod === 'hari' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                  >
                    <span>Jumlah Hari Unik</span>
                    <span className="text-[10px] opacity-75 font-normal">(1x/hari)</span>
                  </button>
                </div>
              </div>

              {/* Ringkasan Indikator */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Pegawai</span>
                  <div className="text-lg font-black text-slate-800 dark:text-slate-200">{activeTeachers.length}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-amber-500 uppercase">Terlambat di Presensi</span>
                  <div className="text-lg font-black text-amber-600 dark:text-amber-400">{totalGuruTelatPresensi}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-blue-500 uppercase">Perlu Update (Beda)</span>
                  <div className="text-lg font-black text-blue-600 dark:text-blue-400">
                    {syncComparisonList.filter(item => item.isDiff).length}
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Tabs & Search */}
            <div className="p-3 sm:px-5 sm:py-3 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setSyncFilterTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${syncFilterTab === 'all' ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  Semua ({syncComparisonList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSyncFilterTab('diff')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${syncFilterTab === 'diff' ? 'bg-amber-500 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <span>Perlu Update</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 font-black">
                    {syncComparisonList.filter(item => item.isDiff).length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSyncFilterTab('late')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${syncFilterTab === 'late' ? 'bg-red-500 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <span>Ada Telat</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 font-black">
                    {syncComparisonList.filter(item => item.presensiLate > 0).length}
                  </span>
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari guru / NIPY..."
                  value={syncModalSearch}
                  onChange={(e) => setSyncModalSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* List Tabel Perbandingan */}
            <div className="overflow-y-auto overflow-x-auto flex-1 p-0">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input 
                        type="checkbox"
                        checked={filteredSyncList.length > 0 && filteredSyncList.every(item => selectedSyncIds.includes(item.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const addIds = filteredSyncList.map(item => item.id);
                            setSelectedSyncIds(prev => Array.from(new Set([...prev, ...addIds])));
                          } else {
                            const removeIds = new Set(filteredSyncList.map(item => item.id));
                            setSelectedSyncIds(prev => prev.filter(id => !removeIds.has(id)));
                          }
                        }}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer w-4 h-4"
                      />
                    </th>
                    <th className="p-3">Nama Pegawai</th>
                    <th className="p-3 text-center">Di Tabel Saat Ini</th>
                    <th className="p-3">Hasil Rekap Presensi Guru</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredSyncList.map(item => {
                    const isChecked = selectedSyncIds.includes(item.id);
                    return (
                      <tr 
                        key={item.id} 
                        className={`transition-colors cursor-pointer ${isChecked ? 'bg-teal-50/40 dark:bg-teal-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'}`}
                        onClick={() => {
                          setSelectedSyncIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]);
                        }}
                      >
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => {
                              setSelectedSyncIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]);
                            }}
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer w-4 h-4"
                          />
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800 dark:text-slate-200">{item.name}</div>
                          <div className="text-[10px] text-slate-500">{item.nipy} • {item.position}</div>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-lg font-black text-xs ${item.tableLate > 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800/50' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                            {item.tableLate} Kali
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-black text-xs ${item.presensiLate > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>
                                {item.presensiLate} Kali Keterlambatan
                              </span>
                              {item.totalMinutesLate > 0 && (
                                <span className="text-[10px] text-slate-400">({item.totalMinutesLate} menit total)</span>
                              )}
                            </div>
                            {item.details && item.details.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {item.details.slice(0, 4).map((d, dIdx) => (
                                  <span key={dIdx} className="text-[10px] px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 rounded">
                                    {d}
                                  </span>
                                ))}
                                {item.details.length > 4 && (
                                  <span className="text-[10px] text-slate-400 self-center">+{item.details.length - 4} sesi lagi</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 italic">Disiplin / Tidak ada telat</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {item.isDiff ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/50">
                              <AlertCircle size={11} /> Beda ({item.tableLate} → {item.presensiLate})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/50">
                              <CheckCircle size={11} /> Sesuai
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSyncList.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-slate-400 text-xs">
                        Tidak ada data pegawai yang sesuai dengan filter pencarian.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <strong className="text-teal-600 dark:text-teal-400">{selectedSyncIds.length}</strong> dari {filteredSyncList.length} pegawai dipilih
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const diffIds = syncComparisonList.filter(item => item.isDiff).map(item => item.id);
                    setSelectedSyncIds(diffIds);
                  }}
                  className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 font-bold underline cursor-pointer"
                >
                  Pilih yang Berbeda Saja
                </button>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsSyncModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSaving || selectedSyncIds.length === 0}
                  onClick={handleApplySync}
                  className="px-5 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Check size={14} />
                  )}
                  <span>Terapkan ke Kolom Telat ({selectedSyncIds.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🪄 TOAST NOTIFIKASI SINKRONISASI SUKSES */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 dark:bg-slate-100/95 text-white dark:text-slate-900 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-3 border border-slate-700 dark:border-slate-300 animate-in slide-in-from-bottom-5 duration-300">
          <CheckCircle className="text-emerald-400 dark:text-emerald-600 shrink-0" size={20} />
          <span className="text-xs sm:text-sm font-bold">{syncToast}</span>
          <button type="button" onClick={() => setSyncToast(null)} className="ml-2 text-slate-400 hover:text-white dark:hover:text-black">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="bg-gradient-to-r from-orange-600 to-amber-500 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 text-white shadow-lg flex items-center justify-between shrink-0 relative overflow-hidden mb-3 sm:mb-5">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1 flex items-center gap-2 sm:gap-3"><FileText className="text-orange-100" size={22} /> Rekapitulasi Jam Mengajar</h1>
          <p className="text-orange-50 text-xs sm:text-sm">Rincian jurnal harian (Tgl 1 - 31) dan evaluasi target wajib periode {bulan}.</p>
        </div>
        <FileText size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none hidden sm:block" />
      </div>

      {/* TAMBAHAN: Kartu Statistik Ringkasan Absensi (INTERAKTIF) */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-4 md:gap-6 mb-3 sm:mb-5">
        <div onClick={() => setActiveFilter('all')} className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-slate-800 p-2 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border ${activeFilter === 'all' ? 'border-blue-500 ring-2 sm:ring-4 ring-blue-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'} flex flex-col justify-center relative overflow-hidden group`}>
          <p className="text-[9px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 sm:mb-2 relative z-10 truncate">Total Realisasi</p>
          <div className="flex items-baseline gap-1 sm:gap-2 relative z-10">
            <h4 className="text-base sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400">{stats.totalJam}</h4>
            <span className="text-[10px] sm:text-sm font-bold text-blue-500">JPL</span>
          </div>
          <div className="absolute -right-4 -bottom-4 bg-blue-50 dark:bg-blue-900/30 w-16 h-16 sm:w-20 sm:h-20 rounded-full blur-xl group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors"></div>
          {activeFilter === 'all' && <div className="absolute top-2 right-2 sm:top-4 sm:right-4"><CheckCircle size={14} className="text-blue-500"/></div>}
        </div>
        
        <div onClick={() => setActiveFilter(activeFilter === 'kurang_jam' ? 'all' : 'kurang_jam')} className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-slate-800 p-2 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border ${activeFilter === 'kurang_jam' ? 'border-amber-500 ring-2 sm:ring-4 ring-amber-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-amber-300'} flex flex-col justify-center relative group`}>
          <div className="flex items-start justify-between relative z-10">
            <div>
              <p className="text-[9px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 sm:mb-2 truncate">Kurang Jam</p>
              <div className="flex items-baseline gap-1 sm:gap-2">
                <h4 className="text-base sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400">{stats.kurangJam}</h4>
                <span className="text-[10px] sm:text-sm font-bold text-slate-500">Org</span>
              </div>
            </div>
            <div className={`p-1.5 sm:p-2 rounded-full transition-colors ${activeFilter === 'kurang_jam' ? 'bg-amber-500 text-white' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 group-hover:bg-amber-100'} ${stats.kurangJam === 0 ? 'opacity-30' : ''}`}><AlertCircle size={16} className="sm:hidden" /><AlertCircle size={20} className="hidden sm:block" /></div>
          </div>
          {activeFilter === 'kurang_jam' && <div className="absolute top-0 right-0 w-8 h-8 sm:w-10 sm:h-10 bg-amber-500/10 rounded-bl-full border-b border-l border-amber-500/20"></div>}
        </div>

        <div onClick={() => setActiveFilter(activeFilter === 'sering_telat' ? 'all' : 'sering_telat')} className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-slate-800 p-2 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border ${activeFilter === 'sering_telat' ? 'border-red-500 ring-2 sm:ring-4 ring-red-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-red-300'} flex flex-col justify-center relative group`}>
          <div className="flex items-start justify-between relative z-10">
            <div>
              <p className="text-[9px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 sm:mb-2 truncate">Disiplin (&gt;10x)</p>
              <div className="flex items-baseline gap-1 sm:gap-2">
                <h4 className="text-base sm:text-3xl font-extrabold text-red-600 dark:text-red-400">{stats.seringTelat}</h4>
                <span className="text-[10px] sm:text-sm font-bold text-slate-500">Org</span>
              </div>
            </div>
            <div className={`p-1.5 sm:p-2 rounded-full transition-colors ${activeFilter === 'sering_telat' ? 'bg-red-500 text-white' : 'bg-red-50 dark:bg-red-900/30 text-red-600 group-hover:bg-red-100'} ${stats.seringTelat === 0 ? 'opacity-30' : ''}`}><Clock size={16} className="sm:hidden" /><Clock size={20} className="hidden sm:block" /></div>
          </div>
          {activeFilter === 'sering_telat' && <div className="absolute top-0 right-0 w-8 h-8 sm:w-10 sm:h-10 bg-red-500/10 rounded-bl-full border-b border-l border-red-500/20"></div>}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 sm:gap-4 shrink-0">
          <div className="relative w-full max-w-md flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-2 text-slate-400" size={15} />
              <input 
                type="text" placeholder="Cari Nama Guru..." 
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs sm:text-sm focus:ring-2 focus:ring-orange-500 outline-none dark:text-white"
              />
            </div>
            {/* Indikator Filter Aktif */}
            {activeFilter !== 'all' && (
              <span className={`px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold whitespace-nowrap flex items-center gap-1 ${activeFilter === 'kurang_jam' ? 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400' : 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400'}`}>
                Filter: {activeFilter === 'kurang_jam' ? 'Kurang Jam' : 'Sering Telat'}
                <button onClick={() => setActiveFilter('all')} className="ml-0.5 hover:text-black dark:hover:text-white"><X size={11}/></button>
              </span>
            )}
          </div>
          
          {/* Action Buttons: 5 Tombol Grid Presisi di Mobile */}
          <div className="grid grid-cols-5 gap-1 w-full xl:w-auto sm:flex sm:flex-wrap justify-end">
            {/* 🪄 FITUR BARU: Tombol Tarik Telat dari Presensi Guru & Staff */}
            <button 
              type="button"
              onClick={handleOpenSyncModal} 
              className="bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white px-2 py-1.5 rounded-lg transition-all shadow-sm flex items-center justify-center gap-1 font-bold text-[11px] sm:text-xs cursor-pointer hover:shadow-md"
              title="Tarik dan sinkronkan data keterlambatan langsung dari menu Presensi Guru & Staff"
            >
              <UserCheck size={14} /> 
              <span className="hidden sm:inline">Presensi</span>
              <span className="sm:hidden">Absen</span>
              {totalGuruTelatPresensi > 0 && (
                <span className="ml-0.5 px-1 bg-white/25 text-white text-[9px] rounded-full font-black">
                  {totalGuruTelatPresensi}
                </span>
              )}
            </button>

            {/* TAMBAHAN: Tombol Reset Bulan */}
            <button onClick={handleResetBulan} className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/40 px-2 py-1.5 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1 font-bold text-[11px] sm:text-xs">
              <Trash2 size={14} /> <span>Reset</span>
            </button>

            {/* TAMBAHAN: Tombol Import Mesin Absen */}
            <input type="file" accept=".csv, .txt, .xls, .xlsx" ref={mesinInputRef} onChange={handleImportMesinAbsen} className="hidden" />
            <button onClick={() => mesinInputRef.current?.click()} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-600 px-2 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shadow-sm flex items-center justify-center gap-1 font-bold text-blue-700 dark:text-blue-400 text-[11px] sm:text-xs">
              <Fingerprint size={14} /> <span>Mesin</span>
            </button>

            <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputRef} onChange={handleImportExcel} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors shadow-sm flex items-center justify-center gap-1 font-bold text-slate-700 dark:text-slate-300 text-[11px] sm:text-xs">
              <Upload size={14} /> <span>Impor</span>
            </button>
            <button onClick={handleExportExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1.5 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1 font-bold text-[11px] sm:text-xs">
              <Download size={14} /> <span>Ekspor</span>
            </button>
          </div>
        </div>

        {/* FITUR BARU: Tampilan Kartu Mobile Rekap Absensi (< md) */}
        <div className="md:hidden space-y-2.5 p-2.5 sm:p-4 no-print">
          {filtered.map((t, idx) => {
             const wajib = t.payroll?.jamMengajar?.wajib !== undefined && t.payroll?.jamMengajar?.wajib !== '' ? Number(t.payroll.jamMengajar.wajib) : (t.status === 'Tetap' ? 60 : 0);
             const real = t.payroll?.jamMengajar?.realisasi || 0;
             const jsjm = t.payroll?.jamMengajar?.jsjm || 0;
             const jamPlus = t.payroll?.jamMengajar?.jamPlus || 0;
             const tInsidentalJam = (t.payroll?.kegiatanInsidental || []).reduce((sum, item) => sum + (Number(item.jam) || 0), 0);
             const selisih = (real + jsjm) - wajib + jamPlus + tInsidentalJam; 
             const telat = t.payroll?.disiplin?.telat || 0;
             const tepatWaktu = Math.max(0, real - telat);

             const isUnderperforming = selisih < 0;
             const isLateOften = telat >= 3;

             return (
               <div key={t.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-2.5">
                 <div className="flex justify-between items-start">
                   <div>
                     <h4 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-1.5">
                       <span className="text-[11px] font-mono font-bold text-slate-400 dark:text-slate-500">#{idx + 1}</span>
                       {isLateOften && <Clock size={14} className="text-red-500 shrink-0" title="Sering Telat" />}
                       {isUnderperforming && !isLateOften && <AlertCircle size={14} className="text-amber-500 shrink-0" title="Kurang Jam" />}
                       <span>{t.name}</span>
                     </h4>
                     <div className="text-xs text-slate-500 mt-0.5">{t.nipy} • {t.position || t.status}</div>
                   </div>
                   <button 
                     onClick={() => handleOpenEdit(t)} 
                     className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                   >
                     <Edit size={14}/> Edit Jam
                   </button>
                 </div>

                 <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <div><span className="text-slate-400">Total Realisasi:</span> <span className="font-black text-blue-600 dark:text-blue-400 block text-sm">{real} JPL</span></div>
                    <div><span className="text-slate-400">Tepat Waktu:</span> <span className="font-black text-emerald-600 dark:text-emerald-400 block text-sm">{tepatWaktu} JPL</span></div>
                    <div><span className="text-slate-400">Jam Wajib Target:</span> <span className="font-bold block dark:text-slate-200">{wajib} JPL</span></div>
                    <div><span className="text-slate-400">Jam Plus & Insidental:</span> <span className="font-bold text-emerald-600 block">+{jamPlus + tInsidentalJam} JPL</span></div>
                    <div>
                      <span className="text-slate-400">Jumlah Telat:</span> 
                      <span className={`font-bold block ${isLateOften ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}`}>{telat} Kali</span>
                      {(() => {
                        const pInfo = teacherPresensiMap[t.id];
                        const pLate = pInfo ? (syncMethod === 'hari' ? pInfo.uniqueDaysLate : pInfo.totalSessionsLate) : 0;
                        if (pLate > 0 && pLate !== telat) {
                          return (
                            <button
                              type="button"
                              onClick={() => handleInlineTelatChange(t.id, pLate)}
                              className="mt-1 text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer shadow-xs"
                            >
                              ⚡ Tarik Presensi ({pLate}x)
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div><span className="text-slate-400">Selisih Target:</span> <span className={`font-bold block ${selisih < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{selisih > 0 ? `+${selisih}` : selisih} JPL</span></div>
                 </div>
               </div>
             );
          })}
        </div>

        <div className="hidden md:block overflow-x-auto overflow-y-auto flex-1 print-area relative p-2 pb-4 scrollbar-thin">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-max border-collapse border-2 border-slate-400 dark:border-slate-500">
            <thead className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center w-12 md:sticky md:left-0 bg-slate-200 dark:bg-slate-800 z-30">
                  No
                </th>
                <th className="p-4 font-bold border border-slate-400 dark:border-slate-500 md:sticky md:left-12 bg-slate-200 dark:bg-slate-800 z-30 shadow-[1px_0_0_rgba(0,0,0,0.1)]">
                  Nama Guru
                </th>
                {/* Render Header Tanggal 1-31 */}
                {Array.from({ length: 31 }, (_, i) => (
                  <th key={i} className="p-2 font-bold border border-slate-400 dark:border-slate-500 text-center text-[11px] min-w-[32px] bg-slate-100 dark:bg-slate-700/80">
                    {i + 1}
                  </th>
                ))}
                <th className="p-2 font-bold border border-slate-400 dark:border-slate-500 text-center bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400" title="Tambahan Jam Mengajar">Jam +</th>
                <th className="p-2 font-bold border border-slate-400 dark:border-slate-500 text-center bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400" title="Kegiatan Insidental Terjadwal">Insidental</th>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center bg-slate-200 dark:bg-slate-800 text-blue-700 dark:text-blue-400">Total</th>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center bg-slate-200 dark:bg-slate-800">Wajib</th>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center bg-slate-200 dark:bg-slate-800 text-purple-700 dark:text-purple-500" title="Jabatan Setara Jam Mengajar">JSJM</th>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center bg-slate-200 dark:bg-slate-800">Selisih</th>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center bg-slate-200 dark:bg-slate-800 text-red-600 dark:text-red-400">Telat</th>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center bg-slate-200 dark:bg-slate-800 text-emerald-700 dark:text-emerald-400">Tepat Waktu</th>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center md:sticky md:right-0 bg-slate-200 dark:bg-slate-800 z-30 shadow-[-1px_0_0_rgba(0,0,0,0.1)] no-print">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 dark:divide-slate-600">
              {filtered.map((t, idx) => {
                const wajib = t.payroll?.jamMengajar?.wajib !== undefined && t.payroll?.jamMengajar?.wajib !== '' ? Number(t.payroll.jamMengajar.wajib) : (t.status === 'Tetap' ? 60 : 0);
                const real = t.payroll?.jamMengajar?.realisasi || 0;
                const jsjm = t.payroll?.jamMengajar?.jsjm || 0;
                const jamPlus = t.payroll?.jamMengajar?.jamPlus || 0;
                
                // 🪄 TAMBALAN: Mengambil total jam insidental untuk dikalkulasikan
                const tInsidentalJam = (t.payroll?.kegiatanInsidental || []).reduce((sum, item) => sum + (Number(item.jam) || 0), 0);
                
                const selisih = (real + jsjm) - wajib + jamPlus + tInsidentalJam; 
                const telat = t.payroll?.disiplin?.telat || 0;
                const tepatWaktu = Math.max(0, real - telat); // Total jam dikurangi telat
                
                // Ambil data array 31 hari dari profil, atau buat simulasi jika belum ada
                const dailyData = t.payroll?.jamMengajar?.harian || getDailyHours(real, t.id);
                
                // TAMBAHAN: Logika Penanda Visual (Row Highlight)
                const isUnderperforming = selisih < 0;
                const isLateOften = telat >= 3;
                
                let rowBgClass = "bg-white dark:bg-slate-800 hover:bg-blue-50/50 dark:hover:bg-slate-700/60";
                let stickyBgClass = "bg-white dark:bg-slate-800 group-hover:bg-blue-50/50 dark:group-hover:bg-slate-700/60";
                
                if (isLateOften) {
                   rowBgClass = "bg-red-50/40 dark:bg-red-900/10 hover:bg-red-100/50 dark:hover:bg-red-900/20";
                   stickyBgClass = "bg-red-50 dark:bg-red-900/20 group-hover:bg-red-100/50 dark:group-hover:bg-red-900/30";
                } else if (isUnderperforming) {
                   rowBgClass = "bg-amber-50/40 dark:bg-amber-900/10 hover:bg-amber-100/50 dark:hover:bg-amber-900/20";
                   stickyBgClass = "bg-amber-50 dark:bg-amber-900/20 group-hover:bg-amber-100/50 dark:group-hover:bg-amber-900/30";
                }

                return (
                  <tr key={t.id} className={`${rowBgClass} transition-colors group`}>
                    <td className={`p-2 text-center font-bold text-slate-500 dark:text-slate-400 text-xs w-12 md:sticky md:left-0 z-10 border border-slate-400 dark:border-slate-500 ${stickyBgClass}`}>
                      {idx + 1}
                    </td>
                    <td className={`p-3 md:sticky md:left-12 z-10 border border-slate-400 dark:border-slate-500 shadow-[1px_0_0_rgba(0,0,0,0.05)] ${stickyBgClass}`}>
                      <div className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap flex items-center gap-1.5">
                        {isLateOften && <Clock size={12} className="text-red-500 flex-shrink-0" title="Sering Telat" />}
                        {isUnderperforming && !isLateOften && <AlertCircle size={12} className="text-amber-500 flex-shrink-0" title="Kurang Jam" />}
                        {t.name}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 ml-4">{t.nipy}</div>
                    </td>
                    
                    {/* Render Kolom Harian 1-31 */}
                    {dailyData.map((jam, i) => (
                      <td key={i} className={`p-1 text-center font-bold border border-slate-400 dark:border-slate-500 text-[11px] ${jam === 'S' ? 'text-amber-600 bg-amber-50/50 dark:bg-amber-900/20' : jam === 'I' ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : jam === 'A' ? 'text-red-600 bg-red-50/50 dark:bg-red-900/20' : 'text-slate-700 dark:text-slate-300'}`}>
                        {jam}
                      </td>
                    ))}

                    <td className="p-1.5 text-center border border-slate-400 dark:border-slate-500 bg-emerald-50/30 dark:bg-emerald-900/10 align-middle">
                      <input 
                        type="number" 
                        min="0"
                        value={t.payroll?.jamMengajar?.jamPlus !== undefined ? t.payroll?.jamMengajar?.jamPlus : ''} 
                        onChange={(e) => handleInlineJamPlusChange(t.id, e.target.value)}
                        className="w-12 p-1.5 text-center border border-emerald-300 dark:border-emerald-600 rounded-lg bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 font-bold focus:ring-2 focus:ring-emerald-500 outline-none m-auto block shadow-sm transition-all"
                        title="Tambahan Jam Mengajar"
                        placeholder="0"
                      />
                    </td>

                    <td className="p-3 text-center font-bold text-base border border-slate-400 dark:border-slate-500 text-blue-700 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10" title="Total Jam dari Kegiatan Insidental">
                      {tInsidentalJam}
                    </td>

                    <td className="p-3 text-center font-black text-base border border-slate-400 dark:border-slate-500 text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20">
                      {real}
                    </td>
                    <td className="p-1.5 text-center border border-slate-400 dark:border-slate-500 bg-white/50 dark:bg-slate-800/50 align-middle">
                      <input 
                        type="number" 
                        min="0"
                        value={t.payroll?.jamMengajar?.wajib !== undefined ? t.payroll?.jamMengajar?.wajib : (t.status === 'Tetap' ? 60 : 0)} 
                        onChange={(e) => handleInlineWajibChange(t.id, e.target.value)}
                        className="w-14 p-1.5 text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold focus:ring-2 focus:ring-blue-500 outline-none m-auto block shadow-sm transition-all"
                        title="Edit jumlah target wajib secara langsung"
                        placeholder="0"
                      />
                    </td>
                    <td className="p-1.5 text-center border border-slate-400 dark:border-slate-500 bg-purple-50/30 dark:bg-purple-900/10 align-middle">
                      <input 
                        type="number" 
                        min="0"
                        value={t.payroll?.jamMengajar?.jsjm !== undefined ? t.payroll?.jamMengajar?.jsjm : ''} 
                        onChange={(e) => handleInlineJsjmChange(t.id, e.target.value)}
                        className="w-14 p-1.5 text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-400 font-bold focus:ring-2 focus:ring-purple-500 outline-none m-auto block shadow-sm transition-all"
                        title="Jabatan Setara Jam Mengajar"
                        placeholder="0"
                      />
                    </td>
                    <td className={`p-3 text-center font-bold text-base border border-slate-400 dark:border-slate-500 ${selisih < 0 ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {selisih > 0 ? `+${selisih}` : selisih}
                    </td>
                    <td className={`p-1.5 text-center border border-slate-400 dark:border-slate-500 align-middle ${isLateOften ? 'bg-red-100/50 dark:bg-red-900/30' : 'bg-red-50/30 dark:bg-red-900/10'}`}>
                      <div className="flex flex-col items-center justify-center gap-1 py-0.5">
                        <input 
                          type="number" 
                          min="0"
                          value={t.payroll?.disiplin?.telat !== undefined ? t.payroll?.disiplin?.telat : 0} 
                          onChange={(e) => handleInlineTelatChange(t.id, e.target.value)}
                          className={`w-14 p-1.5 text-center border rounded-lg bg-white dark:bg-slate-800 font-bold focus:ring-2 focus:ring-red-500 outline-none m-auto block shadow-sm transition-all ${isLateOften ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-red-300 dark:border-red-700 text-red-600 dark:text-red-400'}`}
                          title="Edit manual jumlah keterlambatan (dapat diubah bebas oleh Admin)"
                          placeholder="0"
                        />
                        {(() => {
                          const pInfo = teacherPresensiMap[t.id];
                          const pLate = pInfo ? (syncMethod === 'hari' ? pInfo.uniqueDaysLate : pInfo.totalSessionsLate) : 0;
                          const curLate = Number(t.payroll?.disiplin?.telat) || 0;
                          
                          if (pLate > 0) {
                            if (pLate !== curLate) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleInlineTelatChange(t.id, pLate)}
                                  className="text-[10px] text-amber-800 dark:text-amber-300 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 px-1.5 py-0.5 rounded font-bold transition-colors cursor-pointer flex items-center gap-0.5 shadow-xs whitespace-nowrap"
                                  title={`Presensi Guru mencatat ${pLate}x keterlambatan. Klik untuk langsung menerapkan nilai ini.`}
                                >
                                  ⚡ Presensi: {pLate}x
                                </button>
                              );
                            } else {
                              return (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold whitespace-nowrap" title="Nilai sudah sinkron dengan Presensi Guru">
                                  ✓ Presensi ({pLate}x)
                                </span>
                              );
                            }
                          } else if (curLate > 0) {
                            return (
                              <span className="text-[9px] text-slate-400 italic" title="Diinput manual oleh Admin (Catatan Presensi: 0)">
                                Manual
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </td>
                    <td className="p-3 text-center font-black text-emerald-700 dark:text-emerald-400 border border-slate-400 dark:border-slate-500 bg-emerald-50/50 dark:bg-emerald-900/20 text-lg">
                      {tepatWaktu}
                    </td>
                    <td className={`p-2 text-center border border-slate-400 dark:border-slate-500 md:sticky md:right-0 z-10 shadow-[-1px_0_0_rgba(0,0,0,0.05)] no-print ${stickyBgClass}`}>
                       <button 
                          onClick={() => handleOpenEdit(t)} 
                          className="p-1.5 bg-white hover:bg-blue-50 text-blue-600 dark:bg-slate-800 dark:hover:bg-blue-900/30 dark:text-blue-400 rounded-md transition-colors shadow-sm border border-slate-300 dark:border-slate-600 flex items-center justify-center mx-auto" 
                          title="Edit Manual Jam & Telat"
                       >
                          <Edit size={16} />
                       </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan="39" className="p-8 text-center text-slate-500 border border-slate-400 dark:border-slate-500">Tidak ada data pegawai ditemukan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 🪄 FITUR BARU: VIEW JADWAL MENGAJAR & KEGIATAN MASSAL 🪄
export { RekapAbsensiView };
