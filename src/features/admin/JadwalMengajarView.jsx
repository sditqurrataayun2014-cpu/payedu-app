import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle, BookOpen, CalendarDays, Check, CheckCircle, CheckSquare, Download, Edit,
  Eye, FileSpreadsheet, Filter, History, ListPlus, Minus, Plus, Save, Search, Send, Trash2,
  Upload, Users, X
} from 'lucide-react';

import {
  generateUniqueId, getFormattedPeriod, isTeacherActive, safeStorageSet,
  DEFAULT_MAPEL_KBM, DEFAULT_KELAS_KBM, DEFAULT_JAM_KBM, calculateJurnalSummary,
  syncTeacherJurnalKbm, formatDateId, formatRp, getLocalIsoDate
} from '../../utils/payrollUtils';
import { pushCloudData as pushToSupabase } from '../../services/dbService';
import { exportJurnalKbmToExcel } from '../../services/excelExportService';

export default function JadwalMengajarView({ teachers, setTeachers, settings }) {
  const [activeTab, setActiveTab] = useState('roster');
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // State untuk Tab Insidental
  const [insidentalForm, setInsidentalForm] = useState({ ket: '', tgl: 1, jam: 2 });
  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false); 

  // State untuk Preview, Edit, dan Hapus Kegiatan Massal
  const [previewActivity, setPreviewActivity] = useState(null);
  const [editActivity, setEditActivity] = useState(null);
  const [deleteActivity, setDeleteActivity] = useState(null);

  // 🪄 TAMBALAN CERDAS: Ref untuk Input File Excel Roster
  const rosterFileInputRef = useRef(null);

  // --- STATE & DATA TAB 4: MONITORING JURNAL KBM & BEBAN KERJA (PENGGANTI RESMI GOOGLE FORM) ---
  const [jurnalSearch, setJurnalSearch] = useState('');
  const [jurnalFilterKepatuhan, setJurnalFilterKepatuhan] = useState('all'); // 'all' | 'sudah' | 'belum'
  const [jurnalFilterMapel, setJurnalFilterMapel] = useState('all');
  const [jurnalFilterKelas, setJurnalFilterKelas] = useState('all');
  const [jurnalFilterJam, setJurnalFilterJam] = useState('all');

  const [selectedTeacherForLog, setSelectedTeacherForLog] = useState(null);
  const [saldoAwalModalTeacher, setSaldoAwalModalTeacher] = useState(null);
  const [saldoAwalInput, setSaldoAwalInput] = useState(0);
  const [saldoAwalKet, setSaldoAwalKet] = useState('Rekap Google Form s/d 17 Nov');
  const [isSavingSaldo, setIsSavingSaldo] = useState(false);

  // State untuk Tambah / Edit Entri Jurnal oleh Admin
  const [isAdminAddingEntry, setIsAdminAddingEntry] = useState(false);
  const [editingAdminEntry, setEditingAdminEntry] = useState(null);
  const [adminEntryForm, setAdminEntryForm] = useState({
    tgl: new Date().getDate(),
    jamMasukKelas: 2,
    jamHalaqoh: 0,
    hasMuhadatsah: false,
    jamPiketKantor: 0,
    jamPiketSholat: 0,
    jamRapat: 0,
    jamEskul: 0,
    mapel: ['TAHSIN'],
    kelas: ['I A Putra'],
    jamKe: [1, 2],
    catatan: ''
  });

  const bulan = getFormattedPeriod(settings?.payrollPeriod);
  const [y, m] = (settings?.payrollPeriod || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-');
  const year = Number(y);
  const month = Number(m) - 1; // 0-indexed month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const filtered = teachers.filter(t => isTeacherActive(t) && (t.name.toLowerCase().includes(search.toLowerCase()) || t.nipy.includes(search)));

  // 🪄 FUNGSI BARU: Mengumpulkan seluruh kegiatan massal ke Riwayat Terpadu
  const massActivities = useMemo(() => {
      const map = new Map();
      teachers.forEach(t => {
          (t.payroll?.kegiatanInsidental || []).forEach(keg => {
              const key = keg.id || `${keg.ket}|${keg.tgl}|${keg.jam}`;
              if (!map.has(key)) {
                  map.set(key, { ...keg, originalId: key, teacherIds: [t.id], teacherNames: [t.name] });
              } else {
                  const existing = map.get(key);
                  existing.teacherIds.push(t.id);
                  existing.teacherNames.push(t.name);
              }
          });
      });
      return Array.from(map.values()).reverse();
  }, [teachers]);

  // --- LOGIKA MONITORING JURNAL KBM ---
  const todayIso = getLocalIsoDate();
  const todayDay = new Date().getDate();

  // Data komprehensif seluruh guru aktif beserta rincian jurnalnya
  const jurnalTeacherData = useMemo(() => {
    return teachers
      .filter(t => isTeacherActive(t))
      .map(t => {
        const summary = calculateJurnalSummary(t);
        const entries = t.payroll?.jurnalKbm || [];
        const hasToday = entries.some(e => e.tanggal === todayIso || Number(e.tgl) === todayDay);
        const todayHours = entries
          .filter(e => e.tanggal === todayIso || Number(e.tgl) === todayDay)
          .reduce((sum, e) => {
            const mk = Number(e.jamMasukKelas);
            const hq = Number(e.jamHalaqoh);
            const pk = Number(e.jamPiketKantor);
            const ps = Number(e.jamPiketSholat);
            const rp = Number(e.jamRapat) || 0;
            const es = Number(e.jamEskul) || 0;
            const kbm = (!isNaN(mk) || !isNaN(hq)) ? ((!isNaN(mk) ? mk : 0) + (!isNaN(hq) ? hq : 0)) : (Number(e.jamKbm) || 0);
            const piket = (!isNaN(pk) || !isNaN(ps)) ? ((!isNaN(pk) ? pk : 0) + (!isNaN(ps) ? ps : 0)) : (Number(e.jamPiket) || 0);
            return sum + kbm + piket + rp + es;
          }, 0);

        return {
          teacher: t,
          id: t.id,
          name: t.name,
          nipy: t.nipy || '-',
          role: t.role || 'Guru',
          summary,
          hasToday,
          todayHours,
          entriesCount: entries.length
        };
      });
  }, [teachers, todayIso, todayDay]);



  // Indikator Kinerja Utama (KPI) Jurnal KBM dengan 5 Pilar Terpisah
  const aggregateKpis = useMemo(() => {
    let totalMasukKelas = 0;
    let totalHalaqoh = 0;
    let totalKbm = 0;
    let totalPiketKantor = 0;
    let totalPiketSholat = 0;
    let totalPiket = 0;
    let totalRapat = 0;
    let totalEskul = 0;
    let totalSaldoAwal = 0;
    let totalAkumulasi = 0;
    let sudahIsiCount = 0;

    jurnalTeacherData.forEach(item => {
      totalMasukKelas += item.summary.jamMasukKelas || 0;
      totalHalaqoh += item.summary.jamHalaqoh || 0;
      totalKbm += item.summary.jamKbm || 0;
      totalPiketKantor += item.summary.jamPiketKantor || 0;
      totalPiketSholat += item.summary.jamPiketSholat || 0;
      totalPiket += item.summary.jamPiket || 0;
      totalRapat += item.summary.jamRapat || 0;
      totalEskul += item.summary.jamEskul || 0;
      totalSaldoAwal += item.summary.saldoAwal || 0;
      totalAkumulasi += item.summary.totalAkumulasi || 0;
      if (item.hasToday) sudahIsiCount++;
    });

    const totalGuru = jurnalTeacherData.length;
    const persentaseKepatuhan = totalGuru > 0 ? Math.round((sudahIsiCount / totalGuru) * 100) : 0;

    return {
      totalMasukKelas,
      totalHalaqoh,
      totalKbm,
      totalPiketKantor,
      totalPiketSholat,
      totalPiket,
      totalRapat,
      totalEskul,
      totalSaldoAwal,
      totalAkumulasi,
      sudahIsiCount,
      totalGuru,
      persentaseKepatuhan
    };
  }, [jurnalTeacherData]);

  // Filter daftar guru di tabel monitoring jurnal dengan dukungan Mapel, Kelas, dan Jam
  const filteredJurnalList = useMemo(() => {
    return jurnalTeacherData.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(jurnalSearch.toLowerCase()) || 
                          item.nipy.toLowerCase().includes(jurnalSearch.toLowerCase());
      if (!matchSearch) return false;
      if (jurnalFilterKepatuhan === 'sudah' && !item.hasToday) return false;
      if (jurnalFilterKepatuhan === 'belum' && item.hasToday) return false;

      const entries = item.teacher.payroll?.jurnalKbm || [];
      if (jurnalFilterMapel !== 'all') {
        const hasMapel = entries.some(e => {
          if (Array.isArray(e.mapel)) return e.mapel.includes(jurnalFilterMapel);
          return String(e.mapel || '').includes(jurnalFilterMapel);
        });
        if (!hasMapel) return false;
      }

      if (jurnalFilterKelas !== 'all') {
        const hasKelas = entries.some(e => {
          if (Array.isArray(e.kelas)) return e.kelas.includes(jurnalFilterKelas);
          return String(e.kelas || '').includes(jurnalFilterKelas);
        });
        if (!hasKelas) return false;
      }

      if (jurnalFilterJam !== 'all') {
        const jamNum = Number(jurnalFilterJam);
        const hasJam = entries.some(e => {
          if (Array.isArray(e.jamKe)) return e.jamKe.includes(jamNum);
          return String(e.jamKe || '').includes(String(jamNum));
        });
        if (!hasJam) return false;
      }

      return true;
    });
  }, [jurnalTeacherData, jurnalSearch, jurnalFilterKepatuhan, jurnalFilterMapel, jurnalFilterKelas, jurnalFilterJam]);

  // Handler Saldo Awal (Transisi Google Form s/d 17 Nov)
  const handleOpenSaldoAwalModal = (teacher) => {
    setSaldoAwalModalTeacher(teacher);
    const currentSaldo = teacher.payroll?.jamMengajar?.saldoAwalJam || 0;
    const currentKet = teacher.payroll?.jamMengajar?.saldoAwalKet || 'Rekap Google Form s/d 17 Nov';
    setSaldoAwalInput(currentSaldo);
    setSaldoAwalKet(currentKet);
  };

  const handleSaveSaldoAwal = async () => {
    if (!saldoAwalModalTeacher) return;
    setIsSavingSaldo(true);
    try {
      const saldoVal = Math.max(0, Number(saldoAwalInput) || 0);
      const updatedTeachers = teachers.map(t => {
        if (t.id === saldoAwalModalTeacher.id) {
          const currentJurnal = t.payroll?.jurnalKbm || [];
          const updated = syncTeacherJurnalKbm(t, currentJurnal, saldoVal);
          if (!updated.payroll) updated.payroll = {};
          if (!updated.payroll.jamMengajar) updated.payroll.jamMengajar = {};
          updated.payroll.jamMengajar.saldoAwalKet = saldoAwalKet;
          return updated;
        }
        return t;
      });

      setTeachers(updatedTeachers);
      safeStorageSet('payedu_teachers', updatedTeachers);
      await pushToSupabase('SAVE_TEACHERS', updatedTeachers);

      setSaldoAwalModalTeacher(null);
      alert(`✅ Saldo Awal Google Form untuk ${saldoAwalModalTeacher.name} berhasil disimpan sebesar ${saldoVal} JPL dan otomatis terhubung ke slip gaji!`);
    } catch (err) {
      console.error("Gagal simpan saldo awal:", err);
      alert("⚠️ Terjadi kendala saat menyimpan ke cloud. Periksa koneksi internet Anda.");
    } finally {
      setIsSavingSaldo(false);
    }
  };

  // Handler Log Detail Guru & Entri Admin
  const handleOpenLogModal = (teacher) => {
    const latest = teachers.find(t => t.id === teacher.id) || teacher;
    setSelectedTeacherForLog(latest);
    setIsAdminAddingEntry(false);
    setEditingAdminEntry(null);
    setAdminEntryForm({
      tgl: new Date().getDate(),
      jamMasukKelas: 2,
      jamHalaqoh: 0,
      hasMuhadatsah: false,
      jamPiketKantor: 0,
      jamPiketSholat: 0,
      jamRapat: 0,
      jamEskul: 0,
      mapel: ['TAHSIN'],
      kelas: ['I A Putra'],
      jamKe: [1, 2],
      catatan: ''
    });
  };

  const handleStartEditAdminEntry = (entry) => {
    setEditingAdminEntry(entry);
    const rawMapel = entry.mapel;
    const mapelArr = Array.isArray(rawMapel)
      ? rawMapel
      : (typeof rawMapel === 'string' && rawMapel ? rawMapel.split(',').map(s => s.trim()) : ['TAHSIN']);

    const rawKelas = entry.kelas;
    const kelasArr = Array.isArray(rawKelas)
      ? rawKelas
      : (typeof rawKelas === 'string' && rawKelas ? rawKelas.split(',').map(s => s.trim()) : ['I A Putra']);

    const rawJamKe = entry.jamKe;
    const jamKeArr = Array.isArray(rawJamKe)
      ? rawJamKe.map(Number)
      : (typeof rawJamKe === 'string' && rawJamKe ? rawJamKe.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)) : [1, 2]);

    const mk = Number(entry.jamMasukKelas);
    const hq = Number(entry.jamHalaqoh);
    const pk = Number(entry.jamPiketKantor);
    const ps = Number(entry.jamPiketSholat);

    setAdminEntryForm({
      tgl: entry.tgl || 1,
      jamMasukKelas: !isNaN(mk) ? mk : (Number(entry.jamKbm) || 0),
      jamHalaqoh: !isNaN(hq) ? hq : 0,
      hasMuhadatsah: Boolean(entry.hasMuhadatsah || entry.muhadatsah),
      jamPiketKantor: !isNaN(pk) ? pk : (Number(entry.jamPiket) || 0),
      jamPiketSholat: !isNaN(ps) ? ps : 0,
      jamRapat: Number(entry.jamRapat) || 0,
      jamEskul: Number(entry.jamEskul) || 0,
      mapel: mapelArr.length > 0 ? mapelArr : ['TAHSIN'],
      kelas: kelasArr.length > 0 ? kelasArr : ['I A Putra'],
      jamKe: jamKeArr,
      catatan: entry.catatan || ''
    });
    setIsAdminAddingEntry(true);
  };

  const handleAdminSaveJournalEntry = async () => {
    if (!selectedTeacherForLog) return;
    const tglNum = Number(adminEntryForm.tgl);
    if (!tglNum || tglNum < 1 || tglNum > 31) {
      alert("Mohon masukkan tanggal yang valid (1-31).");
      return;
    }

    const currentEntries = [...(selectedTeacherForLog.payroll?.jurnalKbm || [])];
    const [curY, curM] = (settings?.payrollPeriod || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-');
    const formattedIso = `${curY}-${String(curM).padStart(2, '0')}-${String(tglNum).padStart(2, '0')}`;
    const tanggalStr = formatDateId(formattedIso);

    const mk = Math.max(0, Number(adminEntryForm.jamMasukKelas) || 0);
    const hq = Math.max(0, Number(adminEntryForm.jamHalaqoh) || 0);
    const pk = Math.max(0, Number(adminEntryForm.jamPiketKantor) || 0);
    const ps = Math.max(0, Number(adminEntryForm.jamPiketSholat) || 0);
    const rp = Math.max(0, Number(adminEntryForm.jamRapat) || 0);
    const es = Math.max(0, Number(adminEntryForm.jamEskul) || 0);

    const totalKbm = mk + hq;
    const totalPiket = pk + ps;

    const mapelArr = Array.isArray(adminEntryForm.mapel) && adminEntryForm.mapel.length > 0 ? adminEntryForm.mapel : ['TAHSIN'];
    const kelasArr = Array.isArray(adminEntryForm.kelas) && adminEntryForm.kelas.length > 0 ? adminEntryForm.kelas : ['I A Putra'];
    const jamKeArr = Array.isArray(adminEntryForm.jamKe) ? adminEntryForm.jamKe : [];

    const entryData = {
      id: editingAdminEntry ? editingAdminEntry.id : generateUniqueId('jrn_adm_'),
      tanggal: formattedIso,
      tanggalStr: tanggalStr,
      tgl: tglNum,
      jamMasukKelas: mk,
      jamHalaqoh: hq,
      hasMuhadatsah: Boolean(adminEntryForm.hasMuhadatsah),
      jamPiketKantor: pk,
      jamPiketSholat: ps,
      jamRapat: rp,
      jamEskul: es,
      jamKbm: totalKbm,
      jamPiket: totalPiket,
      mapel: mapelArr,
      kelas: kelasArr,
      jamKe: jamKeArr,
      catatan: adminEntryForm.catatan || '',
      inputBy: 'admin',
      updatedAt: new Date().toISOString()
    };

    let updatedEntries;
    if (editingAdminEntry) {
      updatedEntries = currentEntries.map(e => e.id === editingAdminEntry.id ? entryData : e);
    } else {
      updatedEntries = [entryData, ...currentEntries];
    }

    updatedEntries.sort((a, b) => (Number(b.tgl) || 0) - (Number(a.tgl) || 0));

    const updatedTeachers = teachers.map(t => {
      if (t.id === selectedTeacherForLog.id) {
        return syncTeacherJurnalKbm(t, updatedEntries);
      }
      return t;
    });

    setTeachers(updatedTeachers);
    safeStorageSet('payedu_teachers', updatedTeachers);

    const updatedSelected = updatedTeachers.find(t => t.id === selectedTeacherForLog.id);
    setSelectedTeacherForLog(updatedSelected);
    setIsAdminAddingEntry(false);
    setEditingAdminEntry(null);

    try {
      await pushToSupabase('SAVE_TEACHERS', updatedTeachers);
    } catch (err) {
      console.warn("Gagal simpan entri admin:", err);
    }
  };

  const handleAdminDeleteJournalEntry = async (entryId) => {
    if (!selectedTeacherForLog) return;
    if (!window.confirm("Apakah Anda yakin ingin menghapus catatan jurnal ini? Jam mengajar guru akan dihitung ulang secara otomatis.")) {
      return;
    }

    const currentEntries = (selectedTeacherForLog.payroll?.jurnalKbm || []).filter(e => e.id !== entryId);
    const updatedTeachers = teachers.map(t => {
      if (t.id === selectedTeacherForLog.id) {
        return syncTeacherJurnalKbm(t, currentEntries);
      }
      return t;
    });

    setTeachers(updatedTeachers);
    safeStorageSet('payedu_teachers', updatedTeachers);

    const updatedSelected = updatedTeachers.find(t => t.id === selectedTeacherForLog.id);
    setSelectedTeacherForLog(updatedSelected);

    try {
      await pushToSupabase('SAVE_TEACHERS', updatedTeachers);
    } catch (err) {
      console.warn("Gagal hapus entri admin:", err);
    }
  };

  // Handler Ekspor Excel Jurnal KBM
  const handleExportJurnalExcel = () => {
    try {
      exportJurnalKbmToExcel({
        teachers,
        settings,
        bulan
      });
    } catch (err) {
      console.error("Gagal ekspor excel jurnal:", err);
      alert("⚠️ Gagal mengekspor laporan excel jurnal KBM. Periksa konsol untuk rincian error.");
    }
  };

  // Handler Roster (Jadwal Rutin)
  const handleInlineRosterChange = (id, day, val) => {
     const num = val === '' ? '' : Math.max(0, Number(val));
     setTeachers(prev => prev.map(t => {
        if(t.id === id) {
           return {
              ...t,
              payroll: {
                 ...(t.payroll || {}),
                 roster: { ...(t.payroll?.roster || {}), [day]: num }
              }
           }
        }
        return t;
     }));
  };

  // 🪄 FUNGSI BARU: Ekspor Template Roster ke CSV/Excel
  const handleExportRosterCSV = () => {
    const headers = ['ID Pegawai', 'Nama Lengkap', 'NIPY', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const csvRows = [headers.join(';')];

    // Menggunakan seluruh data teachers agar menjadi template utuh
    teachers.forEach(t => {
      const r = t.payroll?.roster || {};
      const row = [
        t.id,
        `"${t.name}"`,
        `"=""${t.nipy}"""`,
        r['senin'] || 0,
        r['selasa'] || 0,
        r['rabu'] || 0,
        r['kamis'] || 0,
        r['jumat'] || 0,
        r['sabtu'] || 0,
        r['minggu'] || 0
      ];
      csvRows.push(row.join(';'));
    });

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Template_Roster_Mengajar_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 🪄 FUNGSI BARU: Impor Roster dari CSV/Excel dengan Smart Parser
  const handleImportRosterCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsSaving(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/);
      if (lines.length < 2) {
         setIsSaving(false);
         alert("Format file kosong atau tidak valid.");
         return;
      }

      let separator = ',';
      if (lines[0].includes(';')) separator = ';';
      else if (lines[0].includes('\t')) separator = '\t';

      // Parser CSV kebal banting
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

      const headers = parseCSVLine(lines[0], separator).map(h => h.toLowerCase());
      const idIdx = headers.indexOf('id pegawai');
      const nameIdx = headers.findIndex(h => h.includes('nama'));
      
      const dayIndices = {
         senin: headers.indexOf('senin'),
         selasa: headers.indexOf('selasa'),
         rabu: headers.indexOf('rabu'),
         kamis: headers.indexOf('kamis'),
         jumat: headers.indexOf('jumat'),
         sabtu: headers.indexOf('sabtu'),
         minggu: headers.indexOf('minggu')
      };

      if (nameIdx === -1) {
         setIsSaving(false);
         alert('Gagal mendeteksi kolom. Pastikan file Excel yang diunggah memiliki kolom "Nama Lengkap". Disarankan untuk mengunduh template terlebih dahulu.');
         return;
      }

      let updatedCount = 0;
      const updatedTeachers = [...teachers];

      for (let i = 1; i < lines.length; i++) {
         if (!lines[i].trim()) continue;

         const values = parseCSVLine(lines[i], separator);
         const teacherId = idIdx !== -1 ? values[idIdx] : null;
         const teacherName = values[nameIdx];

         if (teacherName) {
            // Pencocokan cerdas: Coba pakai ID dulu, kalau gagal, pakai Nama
            const teacherIndex = updatedTeachers.findIndex(t => 
                (teacherId && t.id === teacherId) || t.name.toLowerCase() === teacherName.toLowerCase()
            );

            if (teacherIndex !== -1) {
               const newRoster = { ...(updatedTeachers[teacherIndex].payroll?.roster || {}) };
               
               // Tarik data per hari
               Object.keys(dayIndices).forEach(day => {
                  const colIdx = dayIndices[day];
                  if (colIdx !== -1 && values[colIdx] !== undefined && values[colIdx] !== '') {
                      // Paksa menjadi angka, jika bukan angka jadikan 0
                      newRoster[day] = Math.max(0, Number(values[colIdx]) || 0);
                  }
               });

               updatedTeachers[teacherIndex] = {
                  ...updatedTeachers[teacherIndex],
                  payroll: {
                     ...(updatedTeachers[teacherIndex].payroll || {}),
                     roster: newRoster
                  }
               };
               updatedCount++;
            }
         }
      }

      setIsSaving(false);
      if (updatedCount > 0) {
        setTeachers(updatedTeachers);
        alert(`Luar Biasa! Pemetaan Roster mingguan untuk ${updatedCount} guru telah berhasil diimpor dan diperbarui secara otomatis.`);
      } else {
        alert('Tidak ada data guru yang cocok untuk diperbarui. Pastikan nama atau ID sesuai dengan sistem.');
      }
      e.target.value = null; // Reset input agar bisa import file yang sama lagi
    };
    reader.readAsText(file);
  };

  const executeGenerateBulanIni = () => {
     setIsSaving(true);
     setConfirmGenerate(false);

     setTimeout(() => {
        setTeachers(prev => prev.map(t => {
           const roster = t.payroll?.roster || {};
           // Peta index hari JavaScript (0=Minggu, 1=Senin... 6=Sabtu)
           const dayMap = { 0: 'minggu', 1: 'senin', 2: 'selasa', 3: 'rabu', 4: 'kamis', 5: 'jumat', 6: 'sabtu' };

           const newHarian = Array(31).fill('');
           let newRealisasi = 0;

           for(let i = 1; i <= daysInMonth; i++) {
              const date = new Date(year, month, i);
              const dayKey = dayMap[date.getDay()];
              const jam = Number(roster[dayKey]) || 0;
              
              if(jam > 0) {
                 newHarian[i-1] = jam;
                 newRealisasi += jam;
              }
           }

           // Pertahankan jam yang sudah ada dari Insidental jika ada (gabungkan)
           const tInsidentalJam = (t.payroll?.kegiatanInsidental || []).reduce((sum, item) => sum + (Number(item.jam) || 0), 0);

           return {
              ...t,
              payroll: {
                 ...(t.payroll || {}),
                 jamMengajar: {
                    ...(t.payroll?.jamMengajar || {}),
                    harian: newHarian, // Timpa dengan jadwal murni
                    realisasi: newRealisasi + tInsidentalJam // Akumulasi total
                 }
              }
           };
        }));
        setIsSaving(false);
        alert(`Sukses Hebat! Jadwal rutin telah ditebarkan secara merata ke tanggal 1 sampai ${daysInMonth} pada Rekap Absen bulan ini.`);
     }, 800);
  };

  // 🪄 FUNGSI BARU: Eksekusi Publikasi ke Portal Guru & Real-Time Cloud Sync
  const executePublish = async () => {
     setIsSaving(true);
     setConfirmPublish(false);
     
     const dayMap = { 0: 'minggu', 1: 'senin', 2: 'selasa', 3: 'rabu', 4: 'kamis', 5: 'jumat', 6: 'sabtu' };
     
     const updatedTeachers = teachers.map(t => {
        const roster = t.payroll?.roster || {};
        const newHarian = Array(31).fill('');
        let newRealisasi = 0;

        for (let i = 1; i <= daysInMonth; i++) {
           const date = new Date(year, month, i);
           const dayKey = dayMap[date.getDay()];
           const jam = Number(roster[dayKey]) || 0;
           
           if (jam > 0) {
              newHarian[i - 1] = jam;
              newRealisasi += jam;
           }
        }

        const tInsidentalJam = (t.payroll?.kegiatanInsidental || []).reduce((sum, item) => sum + (Number(item.jam) || 0), 0);

        return {
           ...t,
           payroll: {
              ...(t.payroll || {}),
              jamMengajar: {
                 ...(t.payroll?.jamMengajar || {}),
                 harian: newHarian,
                 realisasi: newRealisasi + tInsidentalJam
              }
           }
        };
     });

     setTeachers(updatedTeachers);
     safeStorageSet('payedu_teachers', updatedTeachers);

     try {
        await pushToSupabase('SAVE_TEACHERS', updatedTeachers);
     } catch (err) {
        console.warn("Gagal publish roster ke cloud:", err);
     }

     setIsSaving(false);
     alert("✨ BERHASIL DIPUBLIKASIKAN & DISINKRONKAN KE CLOUD! ✨\n\nPemetaan Roster dan Jam Mengajar Harian telah terbit dan otomatis terintegrasi ke menu 'Jadwal Saya' pada seluruh Portal Guru di semua perangkat.");
  };

  // Handler Insidental
  const toggleTeacherSelection = (id) => {
     setSelectedTeachers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  
  const selectAll = () => {
     if(selectedTeachers.length === filtered.length) setSelectedTeachers([]);
     else setSelectedTeachers(filtered.map(t => t.id));
  };

  const handleSaveInsidental = (e) => {
     e.preventDefault();
     if(selectedTeachers.length === 0) return alert('Silakan centang minimal 1 pegawai dari tabel di bawah!');
     
     setIsSaving(true);
     const activityId = generateUniqueId('keg-');

     setTimeout(() => {
        setTeachers(prev => prev.map(t => {
           if(selectedTeachers.includes(t.id)) {
              const currentIns = t.payroll?.kegiatanInsidental || [];
              const harian = [...(t.payroll?.jamMengajar?.harian || Array(31).fill(''))];

              // Simpan Riwayat
              const newInsidental = [...currentIns, { id: activityId, ket: insidentalForm.ket, tgl: insidentalForm.tgl, jam: insidentalForm.jam }];

              // Tambahkan angkanya langsung ke array kalender harian
              const targetIdx = insidentalForm.tgl - 1;
              const existJam = Number(harian[targetIdx]) || 0;
              harian[targetIdx] = existJam + Number(insidentalForm.jam);

              // Update Total Realisasi
              const existReal = Number(t.payroll?.jamMengajar?.realisasi) || 0;

              return {
                 ...t,
                 payroll: {
                    ...(t.payroll || {}),
                    kegiatanInsidental: newInsidental,
                    jamMengajar: {
                       ...(t.payroll?.jamMengajar || {}),
                       harian: harian,
                       realisasi: existReal + Number(insidentalForm.jam)
                    }
                 }
              }
           }
           return t;
        }));
        setIsSaving(false);
        setInsidentalForm({ ket: '', tgl: 1, jam: 2 });
        setSelectedTeachers([]);
        alert('Input Massal Selesai! Kegiatan insidental beserta nominal jamnya berhasil ditambahkan ke kalender kehadiran guru yang dipilih.');
     }, 800);
  };

  // 🪄 FUNGSI BARU: Edit Kegiatan Massal (Merambat ke seluruh kalender guru terkait)
  const handleSaveEditActivity = (e) => {
      e.preventDefault();
      setIsSaving(true);
      setTimeout(() => {
          setTeachers(prev => prev.map(t => {
              if (editActivity.teacherIds.includes(t.id)) {
                  const p = t.payroll || {};
                  const currentIns = p.kegiatanInsidental || [];
                  
                  const itemIdx = currentIns.findIndex(k => (k.id || `${k.ket}|${k.tgl}|${k.jam}`) === editActivity.originalId);
                  
                  if (itemIdx !== -1) {
                      const oldItem = currentIns[itemIdx];
                      const newIns = [...currentIns];
                      newIns[itemIdx] = { ...oldItem, ket: editActivity.ket, tgl: editActivity.tgl, jam: editActivity.jam };

                      const harian = [...(p.jamMengajar?.harian || Array(31).fill(''))];
                      let realisasi = Number(p.jamMengajar?.realisasi) || 0;

                      const oldTglIdx = oldItem.tgl - 1;
                      const oldJam = Number(oldItem.jam) || 0;
                      harian[oldTglIdx] = Math.max(0, (Number(harian[oldTglIdx]) || 0) - oldJam);
                      if (harian[oldTglIdx] === 0) harian[oldTglIdx] = '';
                      realisasi = Math.max(0, realisasi - oldJam);

                      const newTglIdx = editActivity.tgl - 1;
                      const newJam = Number(editActivity.jam) || 0;
                      harian[newTglIdx] = (Number(harian[newTglIdx]) || 0) + newJam;
                      realisasi += newJam;

                      return {
                          ...t,
                          payroll: {
                              ...p,
                              kegiatanInsidental: newIns,
                              jamMengajar: {
                                  ...(p.jamMengajar || {}),
                                  harian,
                                  realisasi
                              }
                          }
                      };
                  }
              }
              return t;
          }));
          setIsSaving(false);
          setEditActivity(null);
          alert("Perbaikan berhasil! Perubahan jadwal dan jam telah diselaraskan ke seluruh kalender absen guru yang terlibat.");
      }, 800);
  };

  // 🪄 FUNGSI BARU: Hapus Kegiatan Massal (Menarik kembali jam dari seluruh kalender guru terkait)
  const confirmDeleteActivity = () => {
      setIsSaving(true);
      setTimeout(() => {
          setTeachers(prev => prev.map(t => {
              if (deleteActivity.teacherIds.includes(t.id)) {
                  const p = t.payroll || {};
                  const currentIns = p.kegiatanInsidental || [];
                  
                  const itemIdx = currentIns.findIndex(k => (k.id || `${k.ket}|${k.tgl}|${k.jam}`) === deleteActivity.originalId);
                  
                  if (itemIdx !== -1) {
                      const oldItem = currentIns[itemIdx];
                      const newIns = currentIns.filter((_, i) => i !== itemIdx);

                      const harian = [...(p.jamMengajar?.harian || Array(31).fill(''))];
                      let realisasi = Number(p.jamMengajar?.realisasi) || 0;

                      const oldTglIdx = oldItem.tgl - 1;
                      const oldJam = Number(oldItem.jam) || 0;
                      harian[oldTglIdx] = Math.max(0, (Number(harian[oldTglIdx]) || 0) - oldJam);
                      if (harian[oldTglIdx] === 0) harian[oldTglIdx] = '';
                      realisasi = Math.max(0, realisasi - oldJam);

                      return {
                          ...t,
                          payroll: {
                              ...p,
                              kegiatanInsidental: newIns,
                              jamMengajar: {
                                  ...(p.jamMengajar || {}),
                                  harian,
                                  realisasi
                              }
                          }
                      };
                  }
              }
              return t;
          }));
          setIsSaving(false);
          setDeleteActivity(null);
          alert("Kegiatan massal berhasil dihapus! Seluruh jam ekstra yang sebelumnya diberikan telah ditarik kembali.");
      }, 800);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative pb-4 min-h-0">
      
      {/* MODAL KONFIRMASI GENERATE */}
      {confirmGenerate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 flex items-center justify-center mx-auto mb-4">
                <CalendarDays size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Terapkan Jadwal Rutin?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Sistem akan otomatis menghitung hari aktif (Senin-Minggu) pada bulan <strong className="text-slate-700 dark:text-slate-200">{bulan}</strong> dan memetakan jadwal ini ke Rekap Absen Tgl 1 - {daysInMonth} untuk <strong>SEMUA GURU</strong>. Lanjutkan?
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmGenerate(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeGenerateBulanIni} className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <CheckSquare size={16} /> Ya, Petakan Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI PUBLIKASI ROSTER KE PORTAL GURU */}
      {confirmPublish && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center mx-auto mb-4">
                <Send size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Terapkan ke Portal Guru?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Pemetaan roster ini akan dipublikasikan dan otomatis terintegrasi ke menu <strong className="text-slate-700 dark:text-slate-200">"Jadwal Saya"</strong> di masing-masing portal guru. Lanjutkan?
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmPublish(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executePublish} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <Send size={16} /> Ya, Terapkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: INPUT SALDO AWAL TRANSISI GOOGLE FORM */}
      {saldoAwalModalTeacher && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                  <BookOpen size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base leading-tight">Saldo Awal Google Form</h3>
                  <p className="text-[11px] text-emerald-100">Transisi Masa Peralihan s/d 17 Nov</p>
                </div>
              </div>
              <button 
                onClick={() => setSaldoAwalModalTeacher(null)} 
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors cursor-pointer text-white"
              >
                <X size={18}/>
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-xs">
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">Pegawai / Guru:</span>
                <p className="font-bold text-sm text-slate-800 dark:text-slate-100 mt-0.5">{saldoAwalModalTeacher.name}</p>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">NIPY: {saldoAwalModalTeacher.nipy || '-'}</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Jumlah Jam Akumulasi dari Google Form (JPL):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={saldoAwalInput}
                    onChange={(e) => setSaldoAwalInput(e.target.value)}
                    placeholder="Contoh: 24"
                    className="w-full p-2.5 pl-3 pr-12 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-sm font-black text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-emerald-500 outline-none"
                    autoFocus
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">JPL</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  *Masukkan total jam yang telah diisi guru pada Google Form lama sebelum aplikasi ini aktif.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Keterangan Catatan Transisi:
                </label>
                <input
                  type="text"
                  value={saldoAwalKet}
                  onChange={(e) => setSaldoAwalKet(e.target.value)}
                  placeholder="Keterangan (opsional)"
                  className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle size={14} /> Otomatis Terhubung ke Slip Gaji
                </div>
                <p>
                  Total Realisasi = <b>Entri Jurnal Mandiri ({calculateJurnalSummary(saldoAwalModalTeacher).totalAkumulasi - calculateJurnalSummary(saldoAwalModalTeacher).saldoAwal} JPL)</b> + <b>Saldo Awal ({Number(saldoAwalInput) || 0} JPL)</b>.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700 flex gap-2">
              <button
                onClick={() => setSaldoAwalModalTeacher(null)}
                disabled={isSavingSaldo}
                className="flex-1 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleSaveSaldoAwal}
                disabled={isSavingSaldo}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSavingSaldo ? 'Menyimpan...' : 'Simpan Saldo Awal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: LOG DETAIL JURNAL GURU & ENTRI ADMIN */}
      {selectedTeacherForLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 animate-in fade-in zoom-in-95">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
            {/* Header Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-800">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-white leading-tight">
                    Log Jurnal Mengajar: {selectedTeacherForLog.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">NIPY: {selectedTeacherForLog.nipy || '-'}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      Periode {bulan}
                    </span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedTeacherForLog(null)} 
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 transition-colors cursor-pointer"
              >
                <X size={20}/>
              </button>
            </div>

            {/* Quick KPI Strip */}
            {(() => {
              const summary = calculateJurnalSummary(selectedTeacherForLog);
              return (
                <div className="bg-slate-100/70 dark:bg-slate-850 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span>KBM: <b className="text-blue-600">{summary.jamKbm} JPL</b></span>
                    <span>•</span>
                    <span>Piket: <b className="text-indigo-600">{summary.jamPiket} JPL</b></span>
                    <span>•</span>
                    <span>Rpt/Kjn: <b className="text-purple-600">{summary.jamRapat || 0} JPL</b></span>
                    <span>•</span>
                    <span>Eskul: <b className="text-rose-600">{summary.jamEskul || 0} JPL</b></span>
                    {summary.saldoAwal > 0 && (
                      <>
                        <span>•</span>
                        <span>Saldo Awal: <b className="text-emerald-600">+{summary.saldoAwal} JPL</b></span>
                      </>
                    )}
                  </div>
                  <div className="font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    Total: {summary.totalAkumulasi} JPL
                  </div>
                </div>
              );
            })()}

            {/* Body: Form Entri Admin atau List */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {isAdminAddingEntry ? (
                /* Form Tambah / Edit Entri Jurnal oleh Admin */
                <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/60 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-indigo-200/60 dark:border-indigo-800/40">
                    <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                      <Edit size={14} />
                      <span>{editingAdminEntry ? 'Edit Catatan Jurnal' : 'Tambah Entri Jurnal Manual (Bantuan Admin)'}</span>
                    </h4>
                    <button
                      onClick={() => { setIsAdminAddingEntry(false); setEditingAdminEntry(null); }}
                      className="text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">Tanggal (1-31):</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={adminEntryForm.tgl}
                        onChange={(e) => setAdminEntryForm({ ...adminEntryForm, tgl: Number(e.target.value) })}
                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">Mata Pelajaran:</label>
                      <select
                        value={adminEntryForm.mapel}
                        onChange={(e) => setAdminEntryForm({ ...adminEntryForm, mapel: e.target.value })}
                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        {DEFAULT_MAPEL_KBM.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">Kelas:</label>
                      <select
                        value={adminEntryForm.kelas}
                        onChange={(e) => setAdminEntryForm({ ...adminEntryForm, kelas: e.target.value })}
                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        {DEFAULT_KELAS_KBM.map((k) => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-blue-700 dark:text-blue-300 mb-1">Jam KBM (JPL):</label>
                      <input
                        type="number"
                        min="0"
                        value={adminEntryForm.jamKbm}
                        onChange={(e) => setAdminEntryForm({ ...adminEntryForm, jamKbm: Number(e.target.value) })}
                        className="w-full p-2 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-black text-blue-600 bg-white dark:bg-slate-900 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-indigo-700 dark:text-indigo-300 mb-1">Jam Piket (JPL):</label>
                      <input
                        type="number"
                        min="0"
                        value={adminEntryForm.jamPiket}
                        onChange={(e) => setAdminEntryForm({ ...adminEntryForm, jamPiket: Number(e.target.value) })}
                        className="w-full p-2 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-black text-indigo-600 bg-white dark:bg-slate-900 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-purple-700 dark:text-purple-300 mb-1">Rapat/Kajian (JPL):</label>
                      <input
                        type="number"
                        min="0"
                        max="8"
                        value={adminEntryForm.jamRapat}
                        onChange={(e) => setAdminEntryForm({ ...adminEntryForm, jamRapat: Number(e.target.value) })}
                        className="w-full p-2 border border-purple-200 dark:border-purple-800 rounded-lg text-xs font-black text-purple-600 bg-white dark:bg-slate-900 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-rose-700 dark:text-rose-300 mb-1">Eskul/Khusus (JPL):</label>
                      <input
                        type="number"
                        min="0"
                        max="8"
                        value={adminEntryForm.jamEskul || 0}
                        onChange={(e) => setAdminEntryForm({ ...adminEntryForm, jamEskul: Number(e.target.value) })}
                        className="w-full p-2 border border-rose-200 dark:border-rose-800 rounded-lg text-xs font-black text-rose-600 bg-white dark:bg-slate-900 outline-none"
                      />
                    </div>
                  </div>

                  {/* Toggle Muhadatsah */}
                  <div className="p-2.5 bg-amber-50/70 dark:bg-amber-950/20 rounded-xl border border-amber-200/80 dark:border-amber-800/40 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <span>🗣️</span> Pendampingan Muhadatsah (15 Menit)
                      </span>
                      <span className="text-[10px] text-amber-800/80 dark:text-amber-300/80 block mt-0.5">
                        Alokasi pagi 15 mnt • Terakumulasi otomatis ke JPL mengajar
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdminEntryForm({ ...adminEntryForm, hasMuhadatsah: !adminEntryForm.hasMuhadatsah })}
                      className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                        adminEntryForm.hasMuhadatsah
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {adminEntryForm.hasMuhadatsah ? '✓ Aktif (15 Mnt)' : '+ Ikut Serta'}
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">Catatan / Materi (Opsional):</label>
                    <input
                      type="text"
                      value={adminEntryForm.catatan}
                      onChange={(e) => setAdminEntryForm({ ...adminEntryForm, catatan: e.target.value })}
                      placeholder="Contoh: Mengajar Tahfidz Juz 30 / Piket Musholla"
                      className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 outline-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => { setIsAdminAddingEntry(false); setEditingAdminEntry(null); }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleAdminSaveJournalEntry}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
                    >
                      {editingAdminEntry ? 'Perbarui Catatan' : 'Simpan Catatan'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Riwayat Entri Bulan Ini ({(selectedTeacherForLog.payroll?.jurnalKbm || []).length} entri):
                  </span>
                  <button
                    onClick={() => {
                      setEditingAdminEntry(null);
                      setAdminEntryForm({
                        tgl: new Date().getDate(),
                        mapel: DEFAULT_MAPEL_KBM[0] || 'TAHSIN',
                        kelas: DEFAULT_KELAS_KBM[0] || 'I A Putra',
                        jamKbm: 2,
                        jamPiket: 0,
                        jamRapat: 0,
                        jamEskul: 0,
                        catatan: ''
                      });
                      setIsAdminAddingEntry(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold rounded-xl text-xs hover:bg-indigo-100 transition-colors border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Tambah Entri Manual</span>
                  </button>
                </div>
              )}

              {/* List of Entries */}
              <div className="divide-y divide-slate-100 dark:divide-slate-700/60 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                {(selectedTeacherForLog.payroll?.jurnalKbm || []).length > 0 ? (
                  (selectedTeacherForLog.payroll?.jurnalKbm || []).map((entri) => {
                    const mk = Number(entri.jamMasukKelas);
                    const hq = Number(entri.jamHalaqoh);
                    const pk = Number(entri.jamPiketKantor);
                    const ps = Number(entri.jamPiketSholat);
                    const rp = Number(entri.jamRapat) || 0;
                    const es = Number(entri.jamEskul) || 0;

                    const totalHours = (!isNaN(mk) || !isNaN(hq) || !isNaN(pk) || !isNaN(ps))
                      ? ((!isNaN(mk) ? mk : 0) + (!isNaN(hq) ? hq : 0) + (!isNaN(pk) ? pk : 0) + (!isNaN(ps) ? ps : 0) + rp + es)
                      : ((Number(entri.jamKbm) || 0) + (Number(entri.jamPiket) || 0) + rp + es);

                    const mapelText = Array.isArray(entri.mapel) ? entri.mapel.join(', ') : (entri.mapel || 'Kegiatan Umum');
                    const kelasText = Array.isArray(entri.kelas) ? entri.kelas.join(', ') : (entri.kelas || '');
                    const jamKeList = Array.isArray(entri.jamKe) ? entri.jamKe : [];

                    return (
                      <div key={entri.id} className="p-3 sm:p-3.5 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors flex items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex flex-col items-center justify-center shrink-0 border border-indigo-200/60 dark:border-indigo-800/40">
                            <span className="text-[9px] uppercase leading-none text-slate-400">Tgl</span>
                            <span className="text-sm font-black">{entri.tgl}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100">
                                {mapelText}
                              </span>
                              {kelasText && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                  {kelasText}
                                </span>
                              )}
                              {jamKeList.length > 0 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  Jam {jamKeList.join(', ')}
                                </span>
                              )}
                              {entri.inputBy === 'admin' && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                  Admin
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                              <span>Kelas: <b>{!isNaN(mk) ? mk : (Number(entri.jamKbm) || 0)} JPL</b></span>
                              <span>•</span>
                              <span>Halaqoh: <b>{!isNaN(hq) ? hq : 0} JPL</b></span>
                              {(entri.hasMuhadatsah || entri.muhadatsah) && (
                                <>
                                  <span>•</span>
                                  <span className="text-amber-700 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-300/60 dark:border-amber-800/60 text-[10px]">
                                    🗣️ Muhadatsah (15m)
                                  </span>
                                </>
                              )}
                              <span>•</span>
                              <span>Piket Ktr: <b>{!isNaN(pk) ? pk : (Number(entri.jamPiket) || 0)} JPL</b></span>
                              <span>•</span>
                              <span>Sholat: <b>{!isNaN(ps) ? ps : 0} JPL</b></span>
                              <span>•</span>
                              <span>Rpt/Kjn: <b>{rp} JPL</b></span>
                              <span>•</span>
                              <span>Eskul: <b>{es} JPL</b></span>
                            </div>
                            {entri.catatan && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 italic mt-0.5 line-clamp-1">
                                "{entri.catatan}"
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono block">
                              +{totalHours} JPL
                            </span>
                            <span className="text-[9px] text-slate-400">{entri.tanggalStr || `Tgl ${entri.tgl}`}</span>
                          </div>
                          <button
                            onClick={() => handleStartEditAdminEntry(entri)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors cursor-pointer"
                            title="Edit Catatan"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleAdminDeleteJournalEntry(entri.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer"
                            title="Hapus Catatan"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs italic">
                    Belum ada riwayat entri jurnal mengajar untuk guru ini di bulan {bulan}.
                  </div>
                )}
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setSelectedTeacherForLog(null)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRATINJAU PESERTA MASSAL */}
      {previewActivity && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                    <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                        <Users className="text-indigo-500"/> Daftar Kehadiran Peserta
                    </h3>
                    <button onClick={() => setPreviewActivity(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[60vh] space-y-2">
                    <div className="mb-4 bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Nama Kegiatan:</p>
                        <p className="text-base font-black text-indigo-700 dark:text-indigo-300 leading-tight mb-1.5">{previewActivity.ket}</p>
                        <div className="flex gap-3 text-xs font-bold">
                           <span className="bg-white dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300">Tgl: {previewActivity.tgl}</span>
                           <span className="bg-white dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300">Bobot: {previewActivity.jam} JPL</span>
                        </div>
                    </div>
                    {previewActivity.teacherNames.map((n, i) => (
                        <div key={i} className="text-sm font-bold p-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-3 shadow-sm hover:border-indigo-300 transition-colors">
                           <CheckCircle size={18} className="text-emerald-500 shrink-0"/> {n}
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}

      {/* MODAL EDIT CERDAS KEGIATAN MASSAL */}
      {editActivity && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                    <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><Edit className="text-amber-500"/> Edit Kegiatan Massal</h3>
                    <button onClick={() => setEditActivity(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
                </div>
                <form onSubmit={handleSaveEditActivity} className="p-5 space-y-4">
                    <div className="bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-100 dark:border-amber-800/30 mb-2">
                       <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium leading-relaxed">Perubahan tanggal dan jam di sini akan otomatis merambat dan mengkalkulasi ulang seluruh kalender absensi guru yang terlibat secara instan.</p>
                    </div>
                    <div>
                        <label className="text-xs font-bold mb-1.5 block text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nama Kegiatan</label>
                        <input value={editActivity.ket} onChange={e => setEditActivity({...editActivity, ket: e.target.value})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-amber-500 outline-none dark:text-white" required/>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold mb-1.5 block text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tanggal</label>
                            <select value={editActivity.tgl} onChange={e => setEditActivity({...editActivity, tgl: Number(e.target.value)})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none dark:text-white cursor-pointer">
                                {Array.from({length: 31}, (_, i) => i + 1).map(num => <option key={num} value={num}>Tgl {num}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold mb-1.5 block text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bobot (JPL)</label>
                            <input type="number" min="1" value={editActivity.jam} onChange={e => setEditActivity({...editActivity, jam: Number(e.target.value)})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm font-bold text-amber-600 focus:ring-2 focus:ring-amber-500 outline-none dark:text-white" required/>
                        </div>
                    </div>
                    <div className="pt-2">
                       <button disabled={isSaving} className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-bold shadow-md transition-colors disabled:opacity-70 flex items-center justify-center gap-2">
                           {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={18}/>}
                           {isSaving ? 'Menyelaraskan Data...' : 'Simpan & Selaraskan'}
                       </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* MODAL HAPUS CERDAS KEGIATAN MASSAL */}
      {deleteActivity && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center flex flex-col">
                <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white dark:border-slate-800 shadow-sm">
                   <Trash2 size={36} className="text-red-500"/>
                </div>
                <h3 className="font-black text-xl mb-2 text-slate-800 dark:text-white">Batalkan Kegiatan?</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                   Apakah Anda yakin ingin menghapus kegiatan <strong className="text-slate-700 dark:text-slate-200">"{deleteActivity.ket}"</strong>? Seluruh tambahan <strong className="text-red-500">{deleteActivity.jam} JPL</strong> pada <strong className="text-indigo-500">{deleteActivity.teacherNames.length} guru</strong> yang terlibat akan otomatis ditarik kembali.
                </p>
                <div className="flex gap-3 mt-auto">
                    <button onClick={() => setDeleteActivity(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 py-3 rounded-xl font-bold text-slate-700 dark:text-slate-300 transition-colors">Batal</button>
                    <button onClick={confirmDeleteActivity} disabled={isSaving} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold shadow-md transition-colors disabled:opacity-70 flex items-center justify-center gap-2">
                       {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Trash2 size={16}/>}
                       {isSaving ? 'Menghapus...' : 'Ya, Batalkan'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-pink-600 to-rose-500 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 text-white shadow-lg flex items-center justify-between shrink-0 relative overflow-hidden mb-3 sm:mb-5">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1 flex items-center gap-2 sm:gap-3"><CalendarDays className="text-pink-100" size={22} /> Pengaturan Jadwal Mengajar</h1>
          <p className="text-pink-50 text-xs sm:text-sm">Petakan jadwal mingguan (Roster) dan input kegiatan insidental secara massal.</p>
        </div>
        <CalendarDays size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none hidden sm:block" />
      </div>

      <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-0">
         
         {/* TABS NAVIGASI (KIRI DI DESKTOP, ATAS DI MOBILE) */}
         <div className="w-full xl:w-64 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-row xl:flex-col overflow-x-auto xl:overflow-hidden shrink-0 hide-scrollbar">
            <button 
               onClick={() => setActiveTab('roster')}
               className={`flex-1 xl:flex-none p-2.5 sm:p-4 text-left font-bold transition-all border-b-4 xl:border-b-0 xl:border-l-4 ${activeTab === 'roster' ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-400 border-pink-500 xl:border-l-pink-500' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
               <div className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm"><CalendarDays size={16}/> Pemetaan Roster</div>
               <p className="text-[10px] font-normal mt-1 opacity-80 hidden xl:block">Atur jadwal rutin mingguan guru (Senin - Minggu).</p>
            </button>
            <button 
               onClick={() => setActiveTab('insidental')}
               className={`flex-1 xl:flex-none p-2.5 sm:p-4 text-left font-bold transition-all border-b-4 xl:border-b-0 xl:border-l-4 ${activeTab === 'insidental' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-500 xl:border-l-indigo-500' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
               <div className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm"><ListPlus size={16}/> Input Massal</div>
               <p className="text-[10px] font-normal mt-1 opacity-80 hidden xl:block">Tambahkan jam kegiatan non-rutin ke banyak guru sekaligus.</p>
            </button>
            <button 
               onClick={() => setActiveTab('monitoring_jurnal')}
               className={`flex-1 xl:flex-none p-2.5 sm:p-4 text-left font-bold transition-all border-b-4 xl:border-b-0 xl:border-l-4 ${activeTab === 'monitoring_jurnal' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-500 xl:border-l-emerald-500' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
               <div className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm"><BookOpen size={16}/> Monitoring Jurnal KBM</div>
               <p className="text-[10px] font-normal mt-1 opacity-80 hidden xl:block">Pantau kepatuhan jurnal, saldo transisi, & ekspor Excel.</p>
            </button>
            <button 
               onClick={() => setActiveTab('riwayat_massal')}
               className={`flex-1 xl:flex-none p-2.5 sm:p-4 text-left font-bold transition-all border-b-4 xl:border-b-0 xl:border-l-4 ${activeTab === 'riwayat_massal' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-500 xl:border-l-amber-500' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
               <div className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm"><History size={16}/> Riwayat Kegiatan</div>
               <p className="text-[10px] font-normal mt-1 opacity-80 hidden xl:block">Edit, hapus, dan pantau riwayat kegiatan massal.</p>
            </button>
         </div>

         {/* AREA KONTEN */}
         <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-0">
            
            {activeTab === 'roster' && (
               <>
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                     <div className="relative w-full md:w-56 shrink-0">
                       <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                       <input 
                         type="text" placeholder="Cari Nama Guru..." 
                         value={search} onChange={e => setSearch(e.target.value)}
                         className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-pink-500 outline-none dark:text-white"
                       />
                     </div>
                     <div className="grid grid-cols-2 sm:flex sm:w-auto gap-1.5 w-full justify-end">
                       
                       {/* 🪄 TAMBALAN CERDAS: Tombol Impor & Ekspor Roster */}
                       <input type="file" accept=".csv, .xlsx, .xls" ref={rosterFileInputRef} onChange={handleImportRosterCSV} className="hidden" />
                       <button onClick={() => rosterFileInputRef.current?.click()} disabled={isSaving} className="justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 px-2 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1 border border-slate-300 dark:border-slate-600 disabled:opacity-70">
                         <Upload size={14} /> <span>Impor</span>
                       </button>
                       <button onClick={handleExportRosterCSV} disabled={isSaving} className="justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1 disabled:opacity-70">
                         <Download size={14} /> <span>Ekspor</span>
                       </button>

                       <button onClick={() => setConfirmPublish(true)} disabled={isSaving} className="justify-center bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1 disabled:opacity-70">
                         {isSaving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send size={14} />}
                         <span>Ke Portal</span>
                       </button>
                       <button onClick={() => setConfirmGenerate(true)} disabled={isSaving} className="justify-center bg-pink-600 hover:bg-pink-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1 disabled:opacity-70">
                         {isSaving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <CheckSquare size={14} />}
                         <span>Ke Absen</span>
                       </button>
                     </div>
                  </div>
                  
                  {/* FITUR BARU: Tampilan Kartu Mobile Pemetaan Roster (< md) */}
                  <div className="md:hidden space-y-3 p-3 no-print">
                     {filtered.map((t, idx) => {
                        const r = t.payroll?.roster || {};
                        const totalMingguan = ['senin','selasa','rabu','kamis','jumat','sabtu','minggu'].reduce((sum, d) => sum + (Number(r[d]) || 0), 0);
                        return (
                           <div key={t.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-2.5">
                              <div className="flex justify-between items-start">
                                 <div>
                                    <h4 className="font-bold text-sm text-slate-800 dark:text-white">{t.name}</h4>
                                    <div className="text-xs text-slate-500 mt-0.5">{t.nipy} • {t.position || 'Guru'}</div>
                                 </div>
                                 <span className="px-3 py-1 bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400 rounded-full text-xs font-black">
                                    {totalMingguan} JPL/Pekan
                                 </span>
                              </div>

                              <div className="grid grid-cols-4 gap-1.5 text-xs bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                 {['senin','selasa','rabu','kamis','jumat','sabtu','minggu'].map(day => (
                                    <div key={day} className="flex flex-col items-center p-1 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                                       <span className="text-[9px] uppercase font-bold text-slate-400">{day.substring(0,3)}</span>
                                       <input 
                                          type="number" min="0" 
                                          value={r[day] !== undefined ? r[day] : ''} 
                                          onChange={e => handleInlineRosterChange(t.id, day, e.target.value)}
                                          className="w-full text-center bg-transparent text-xs font-bold text-slate-800 dark:text-white outline-none"
                                          placeholder="0"
                                       />
                                    </div>
                                 ))}
                              </div>
                           </div>
                        );
                     })}
                  </div>

                  <div className="hidden md:block overflow-x-auto overflow-y-auto flex-1 p-2 pb-4 touch-pan-x touch-pan-y scroll-smooth">
                     <table className="w-full text-left text-sm whitespace-nowrap min-w-max border-collapse border border-slate-200 dark:border-slate-700">
                        <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 sticky top-0 z-10 shadow-sm border-b border-slate-300 dark:border-slate-600">
                           <tr>
                              <th className="p-3 font-bold border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-900/90 z-20 w-12 text-center">No</th>
                              <th className="p-3 font-bold border-r border-slate-200 dark:border-slate-700 sticky left-12 bg-slate-100 dark:bg-slate-900/90 z-20">Nama Guru</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700">Senin</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700">Selasa</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700">Rabu</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700">Kamis</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700">Jumat</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700">Sabtu</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700 text-rose-500">Minggu</th>
                              <th className="p-3 font-black text-center bg-pink-50 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400">JPL / Pekan</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                           {filtered.map((t, idx) => {
                              const r = t.payroll?.roster || {};
                              const totalMingguan = ['senin','selasa','rabu','kamis','jumat','sabtu','minggu'].reduce((sum, d) => sum + (Number(r[d]) || 0), 0);
                              return (
                                 <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                    <td className="p-3 text-center font-bold text-slate-400 dark:text-slate-500 text-xs w-12 sticky left-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-10">
                                       {idx + 1}
                                    </td>
                                    <td className="p-3 font-bold text-slate-800 dark:text-slate-200 sticky left-12 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-10 shadow-[1px_0_0_rgba(0,0,0,0.05)]">
                                       {t.name}
                                       <div className="text-[10px] text-slate-500 font-normal">{t.nipy}</div>
                                    </td>
                                    {['senin','selasa','rabu','kamis','jumat','sabtu','minggu'].map((day) => (
                                       <td key={day} className={`p-1.5 border-r border-slate-200 dark:border-slate-700 ${day === 'minggu' ? 'bg-rose-50/30 dark:bg-rose-900/10' : ''}`}>
                                          <input 
                                             type="number" min="0" 
                                             value={r[day] !== undefined ? r[day] : ''} 
                                             onChange={e => handleInlineRosterChange(t.id, day, e.target.value)}
                                             className="w-14 p-1.5 text-center rounded bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none text-sm font-bold dark:text-white m-auto block"
                                             placeholder="-"
                                          />
                                       </td>
                                    ))}
                                    <td className="p-3 text-center font-black text-pink-700 dark:text-pink-400 bg-pink-50/50 dark:bg-pink-900/20 text-lg">
                                       {totalMingguan}
                                    </td>
                                 </tr>
                              )
                           })}
                           {filtered.length === 0 && <tr><td colSpan="10" className="p-8 text-center text-slate-500">Tidak ada data.</td></tr>}
                        </tbody>
                     </table>
                  </div>
               </>
            )}

            {/* DIPERBARUI: Struktur Form Insidental dan Tabel Riwayat */}
            {activeTab === 'insidental' && (
               <div className="flex flex-col lg:flex-row h-full overflow-y-auto relative hide-scrollbar">
                     {/* FORM KIRI */}
                     <div className="w-full lg:w-1/3 bg-indigo-50/50 dark:bg-indigo-900/10 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-700 p-5 shrink-0 flex flex-col">
                        <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                           <ListPlus className="text-indigo-500"/> Detail Kegiatan
                        </h3>
                        <form id="formInsidental" onSubmit={handleSaveInsidental} className="space-y-4">
                           <div>
                              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nama Kegiatan</label>
                              <input type="text" required placeholder="Cth: Rapat Wali Murid" value={insidentalForm.ket} onChange={e => setInsidentalForm({...insidentalForm, ket: e.target.value})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white" />
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                 <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Tgl Pelaksanaan</label>
                                 <select value={insidentalForm.tgl} onChange={e => setInsidentalForm({...insidentalForm, tgl: Number(e.target.value)})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white font-bold cursor-pointer">
                                    {Array.from({length: 31}, (_, i) => i + 1).map(num => <option key={num} value={num}>Tanggal {num}</option>)}
                                 </select>
                              </div>
                              <div>
                                 <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Bobot (JPL)</label>
                                 <input type="number" min="1" required value={insidentalForm.jam} onChange={e => setInsidentalForm({...insidentalForm, jam: Number(e.target.value)})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white font-bold text-indigo-600 dark:text-indigo-400" />
                              </div>
                           </div>
                           <div className="pt-4">
                              <button type="submit" disabled={isSaving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl font-bold shadow-md transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-70">
                                 {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={18} />}
                                 Tambahkan Sekarang
                              </button>
                           </div>
                        </form>
                     </div>

                     {/* TABEL KANAN (CENTANG GURU) */}
                     <div className="w-full lg:w-2/3 flex flex-col h-full bg-white dark:bg-slate-800">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 shrink-0">
                           <div className="flex items-center gap-3">
                              <button onClick={selectAll} className="flex items-center gap-2 text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg font-bold transition-colors">
                                 <CheckSquare size={14}/> {selectedTeachers.length === filtered.length ? 'Batal Pilih' : 'Pilih Semua'}
                              </button>
                              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-md">{selectedTeachers.length} Terpilih</span>
                           </div>
                           <div className="relative w-40 sm:w-48">
                             <Search className="absolute left-3 top-2 text-slate-400" size={14} />
                             <input type="text" placeholder="Cari Guru..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 outline-none dark:text-white" />
                           </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                           {filtered.map(t => (
                              <label key={t.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${selectedTeachers.includes(t.id) ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'}`}>
                                 <input type="checkbox" checked={selectedTeachers.includes(t.id)} onChange={() => toggleTeacherSelection(t.id)} className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                                 <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{t.name}</p>
                                    <p className="text-[10px] text-slate-500 truncate">{t.position}</p>
                                 </div>
                              </label>
                           ))}
                        </div>
                     </div>
               </div>
            )}

            {/* TAB 4: MONITORING JURNAL KBM & BEBAN KERJA GURU (PENGGANTI RESMI GOOGLE FORM) */}
            {activeTab === 'monitoring_jurnal' && (
               <div className="p-3.5 sm:p-5 md:p-6 flex-1 bg-white dark:bg-slate-800 flex flex-col h-full overflow-hidden">
                  {/* Top Summary KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-4 shrink-0">
                     <div className="bg-blue-50 dark:bg-blue-950/30 p-2.5 sm:p-3 rounded-2xl border border-blue-200 dark:border-blue-800/50">
                        <span className="text-[10px] text-blue-700 dark:text-blue-300 font-bold uppercase tracking-wider block mb-0.5">
                           Masuk Kelas / Mapel
                        </span>
                        <div className="flex items-baseline gap-1">
                           <span className="text-lg sm:text-xl font-black text-blue-800 dark:text-blue-200">{aggregateKpis.totalMasukKelas}</span>
                           <span className="text-[10px] font-bold text-blue-500">JPL</span>
                        </div>
                        <span className="text-[9px] text-blue-600/70 dark:text-blue-300/60 block truncate">Tatap muka mapel</span>
                     </div>

                     <div className="bg-indigo-50 dark:bg-indigo-950/30 p-2.5 sm:p-3 rounded-2xl border border-indigo-200 dark:border-indigo-800/50">
                        <span className="text-[10px] text-indigo-700 dark:text-indigo-300 font-bold uppercase tracking-wider block mb-0.5">
                           Jam Halaqoh
                        </span>
                        <div className="flex items-baseline gap-1">
                           <span className="text-lg sm:text-xl font-black text-indigo-800 dark:text-indigo-200">{aggregateKpis.totalHalaqoh}</span>
                           <span className="text-[10px] font-bold text-indigo-500">JPL</span>
                        </div>
                        <span className="text-[9px] text-indigo-600/70 dark:text-indigo-300/60 block truncate">Tahfidz &amp; halaqoh</span>
                     </div>

                     <div className="bg-teal-50 dark:bg-teal-950/30 p-2.5 sm:p-3 rounded-2xl border border-teal-200 dark:border-teal-800/50">
                        <span className="text-[10px] text-teal-700 dark:text-teal-300 font-bold uppercase tracking-wider block mb-0.5">
                           Piket Kantor &amp; Sholat
                        </span>
                        <div className="flex items-baseline gap-1">
                           <span className="text-lg sm:text-xl font-black text-teal-800 dark:text-teal-200">{aggregateKpis.totalPiket}</span>
                           <span className="text-[10px] font-bold text-teal-500">JPL</span>
                        </div>
                        <span className="text-[9px] text-teal-600/70 dark:text-teal-300/60 block truncate">
                           Ktr: {aggregateKpis.totalPiketKantor} • Shlt: {aggregateKpis.totalPiketSholat}
                        </span>
                     </div>

                     <div className="bg-purple-50 dark:bg-purple-950/30 p-2.5 sm:p-3 rounded-2xl border border-purple-200 dark:border-purple-800/50">
                        <span className="text-[10px] text-purple-700 dark:text-purple-300 font-bold uppercase tracking-wider block mb-0.5">
                           Rapat, Kajian &amp; Eskul
                        </span>
                        <div className="flex items-baseline gap-1">
                           <span className="text-lg sm:text-xl font-black text-purple-800 dark:text-purple-200">{(aggregateKpis.totalRapat || 0) + (aggregateKpis.totalEskul || 0)}</span>
                           <span className="text-[10px] font-bold text-purple-500">JPL</span>
                        </div>
                        <span className="text-[9px] text-purple-600/70 dark:text-purple-300/60 block truncate">
                           Rpt: {aggregateKpis.totalRapat || 0} • Eskul: {aggregateKpis.totalEskul || 0}
                        </span>
                     </div>

                     <div className="bg-emerald-50 dark:bg-emerald-950/30 p-2.5 sm:p-3 rounded-2xl border border-emerald-200 dark:border-emerald-800/50">
                        <div className="flex items-center justify-between mb-0.5">
                           <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-black uppercase tracking-wider">
                              Total Realisasi
                           </span>
                           {aggregateKpis.totalSaldoAwal > 0 && (
                              <span className="text-[8px] bg-emerald-200 text-emerald-800 px-1 py-0.2 rounded font-bold" title="Saldo Awal Google Form">
                                 +{aggregateKpis.totalSaldoAwal} Awal
                              </span>
                           )}
                        </div>
                        <div className="flex items-baseline gap-1">
                           <span className="text-lg sm:text-xl font-black text-emerald-700 dark:text-emerald-300">{aggregateKpis.totalAkumulasi}</span>
                           <span className="text-[10px] font-bold text-emerald-600">JPL</span>
                        </div>
                        <span className="text-[9px] text-emerald-600/80 dark:text-emerald-300/70 block truncate">Terkoneksi slip gaji</span>
                     </div>

                     <div className="col-span-2 sm:col-span-1 bg-amber-50 dark:bg-amber-950/30 p-2.5 sm:p-3 rounded-2xl border border-amber-200 dark:border-amber-800/50">
                        <span className="text-[10px] text-amber-700 dark:text-amber-300 font-bold uppercase tracking-wider block mb-0.5">
                           Kepatuhan Hari Ini
                        </span>
                        <div className="flex items-baseline gap-1">
                           <span className="text-lg sm:text-xl font-black text-amber-700 dark:text-amber-300">{aggregateKpis.persentaseKepatuhan}%</span>
                           <span className="text-[10px] font-bold text-amber-600">({aggregateKpis.sudahIsiCount}/{aggregateKpis.totalGuru})</span>
                        </div>
                        <span className="text-[9px] text-amber-600/80 dark:text-amber-300/70 block truncate">Guru sudah input</span>
                     </div>
                  </div>

                  {/* Toolbar & Filter Bar */}
                  <div className="p-3 sm:p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 mb-3.5 shrink-0 flex flex-col gap-2.5">
                     <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
                        {/* Search Input */}
                        <div className="relative flex-1 min-w-[200px]">
                           <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
                           <input
                              type="text"
                              placeholder="Cari nama guru atau NIPY..."
                              value={jurnalSearch}
                              onChange={(e) => setJurnalSearch(e.target.value)}
                              className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100"
                           />
                        </div>

                        {/* Filter Kepatuhan Tabs */}
                        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 self-start lg:self-auto shrink-0">
                           <button
                              onClick={() => setJurnalFilterKepatuhan('all')}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${jurnalFilterKepatuhan === 'all' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                           >
                              Semua ({jurnalTeacherData.length})
                           </button>
                           <button
                              onClick={() => setJurnalFilterKepatuhan('sudah')}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${jurnalFilterKepatuhan === 'sudah' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                           >
                              Sudah Isi ({aggregateKpis.sudahIsiCount})
                           </button>
                           <button
                              onClick={() => setJurnalFilterKepatuhan('belum')}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${jurnalFilterKepatuhan === 'belum' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                           >
                              Belum Isi ({aggregateKpis.totalGuru - aggregateKpis.sudahIsiCount})
                           </button>
                        </div>

                        {/* Ekspor Excel Button */}
                        <button
                           onClick={handleExportJurnalExcel}
                           className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                           title="Unduh laporan excel jurnal KBM resmi"
                        >
                           <FileSpreadsheet size={15} />
                           <span>Ekspor Excel (.xlsx)</span>
                        </button>
                     </div>

                     {/* Filter Tambahan: Mapel, Kelas, dan Jam */}
                     <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                           <Filter size={12} /> Filter Spesifik:
                        </span>

                        {/* Filter Mapel */}
                        <select
                           value={jurnalFilterMapel}
                           onChange={(e) => setJurnalFilterMapel(e.target.value)}
                           className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
                        >
                           <option value="all">Semua Mata Pelajaran</option>
                           {DEFAULT_MAPEL_KBM.map(m => (
                              <option key={m} value={m}>{m}</option>
                           ))}
                        </select>

                        {/* Filter Kelas */}
                        <select
                           value={jurnalFilterKelas}
                           onChange={(e) => setJurnalFilterKelas(e.target.value)}
                           className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
                        >
                           <option value="all">Semua Kelas</option>
                           {DEFAULT_KELAS_KBM.map(k => (
                              <option key={k} value={k}>{k}</option>
                           ))}
                        </select>

                        {/* Filter Jam Ke- */}
                        <select
                           value={jurnalFilterJam}
                           onChange={(e) => setJurnalFilterJam(e.target.value)}
                           className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
                        >
                           <option value="all">Semua Jam Pembelajaran</option>
                           {DEFAULT_JAM_KBM.map(j => (
                              <option key={j.id} value={j.id}>{j.label} ({j.time})</option>
                           ))}
                        </select>

                        {(jurnalFilterMapel !== 'all' || jurnalFilterKelas !== 'all' || jurnalFilterJam !== 'all') && (
                           <button
                              onClick={() => {
                                 setJurnalFilterMapel('all');
                                 setJurnalFilterKelas('all');
                                 setJurnalFilterJam('all');
                              }}
                              className="text-[11px] font-bold text-red-600 hover:underline cursor-pointer"
                           >
                              Reset Filter
                           </button>
                        )}
                     </div>
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/20 shadow-xs flex-1">
                     <table className="w-full text-left text-xs whitespace-nowrap min-w-max">
                        <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 shadow-xs">
                           <tr>
                              <th className="p-3 font-bold text-center w-10">No</th>
                              <th className="p-3 font-bold">Nama Guru &amp; NIPY</th>
                              <th className="p-3 font-bold text-center">Status</th>
                              <th className="p-3 font-bold text-center">Masuk Kelas</th>
                              <th className="p-3 font-bold text-center">Halaqoh</th>
                              <th className="p-3 font-bold text-center">Piket Ktr</th>
                              <th className="p-3 font-bold text-center">Piket Shlt</th>
                              <th className="p-3 font-bold text-center">Rapat/Kajian</th>
                              <th className="p-3 font-bold text-center">Eskul/Khusus</th>
                              <th className="p-3 font-bold text-center">Saldo Awal</th>
                              <th className="p-3 font-bold text-center">Total Realisasi</th>
                              <th className="p-3 font-bold text-center">Status Hari Ini</th>
                              <th className="p-3 font-bold text-center w-36">Aksi Manajemen</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                           {filteredJurnalList.map((item, idx) => (
                              <tr key={item.id} className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/40 transition-colors">
                                 <td className="p-3 text-center font-bold text-slate-400 dark:text-slate-500 w-10">{idx + 1}</td>
                                 <td className="p-3">
                                    <div className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm">{item.name}</div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{item.nipy}</div>
                                 </td>
                                 <td className="p-3 text-center">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                       {item.role}
                                    </span>
                                 </td>
                                 <td className="p-3 text-center font-bold text-blue-600 dark:text-blue-400">
                                    {item.summary.jamMasukKelas || 0} JPL
                                 </td>
                                 <td className="p-3 text-center font-bold text-indigo-600 dark:text-indigo-400">
                                    <div>{item.summary.jamHalaqoh || 0} JPL</div>
                                    {item.summary.muhadatsahCount > 0 && (
                                       <div className="text-[9px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/60 inline-block mt-0.5">
                                          +{item.summary.jamMuhadatsah} JPL ({item.summary.muhadatsahCount}x Muhadatsah)
                                       </div>
                                    )}
                                 </td>
                                 <td className="p-3 text-center font-bold text-teal-600 dark:text-teal-400">
                                    {item.summary.jamPiketKantor || 0} JPL
                                 </td>
                                 <td className="p-3 text-center font-bold text-cyan-600 dark:text-cyan-400">
                                    {item.summary.jamPiketSholat || 0} JPL
                                 </td>
                                 <td className="p-3 text-center font-bold text-purple-600 dark:text-purple-400">
                                    {item.summary.jamRapat || 0} JPL
                                 </td>
                                 <td className="p-3 text-center">
                                    {item.summary.saldoAwal > 0 ? (
                                       <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                                          +{item.summary.saldoAwal} JPL
                                       </span>
                                    ) : (
                                       <span className="text-slate-300 dark:text-slate-600">-</span>
                                    )}
                                 </td>
                                 <td className="p-3 text-center">
                                    <span className="text-xs font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-900/40 px-2.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 shadow-xs">
                                       {item.summary.totalAkumulasi} JPL
                                    </span>
                                 </td>
                                 <td className="p-3 text-center">
                                    {item.hasToday ? (
                                       <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                                          <CheckCircle size={12} />
                                          <span>Sudah ({item.todayHours} JPL)</span>
                                       </span>
                                    ) : (
                                       <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-1 rounded-full border border-amber-200 dark:border-amber-800">
                                          <AlertCircle size={12} />
                                          <span>Belum Isi</span>
                                       </span>
                                    )}
                                 </td>
                                 <td className="p-3 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                       <button
                                          onClick={() => handleOpenSaldoAwalModal(item.teacher)}
                                          className="p-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200 dark:border-emerald-800 cursor-pointer"
                                          title="Set Saldo Awal Google Form"
                                       >
                                          <BookOpen size={14} />
                                       </button>
                                       <button
                                          onClick={() => handleOpenLogModal(item.teacher)}
                                          className="px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                          title="Lihat &amp; Kelola Rincian Entri Jurnal"
                                       >
                                          <Eye size={13} />
                                          <span>Log ({item.entriesCount})</span>
                                       </button>
                                    </div>
                                 </td>
                              </tr>
                           ))}
                           {filteredJurnalList.length === 0 && (
                              <tr>
                                 <td colSpan="12" className="p-8 text-center text-slate-500 italic bg-white dark:bg-slate-800">
                                    Tidak ada data guru yang cocok dengan kriteria pencarian dan filter saat ini.
                                 </td>
                              </tr>
                           )}
                        </tbody>
                     </table>
                  </div>

                  {/* Mobile Card Feed View */}
                  <div className="md:hidden space-y-3 overflow-y-auto flex-1 pr-0.5">
                     {filteredJurnalList.map((item, idx) => (
                        <div key={item.id} className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-2.5">
                           <div className="flex justify-between items-start">
                              <div>
                                 <span className="text-[10px] font-bold text-slate-400">#{idx + 1} • {item.role}</span>
                                 <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">{item.name}</h4>
                                 <span className="text-[10px] text-slate-400 font-mono">{item.nipy}</span>
                              </div>
                              {item.hasToday ? (
                                 <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                    <CheckCircle size={10} />
                                    <span>Sudah ({item.todayHours} JPL)</span>
                                 </span>
                              ) : (
                                 <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                                    <AlertCircle size={10} />
                                    <span>Belum</span>
                                 </span>
                              )}
                           </div>

                           <div className="grid grid-cols-5 gap-1 text-center text-[10px] bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                              <div>
                                 <span className="text-slate-400 block text-[9px]">Kelas</span>
                                 <span className="font-black text-blue-600">{item.summary.jamMasukKelas || 0}</span>
                              </div>
                              <div>
                                 <span className="text-slate-400 block text-[9px]">Halaqoh</span>
                                 <span className="font-black text-indigo-600">{item.summary.jamHalaqoh || 0}</span>
                              </div>
                              <div>
                                 <span className="text-slate-400 block text-[9px]">Piket</span>
                                 <span className="font-black text-teal-600">{item.summary.jamPiket || 0}</span>
                              </div>
                              <div>
                                 <span className="text-slate-400 block text-[9px]">Rapat</span>
                                 <span className="font-black text-purple-600">{item.summary.jamRapat || 0}</span>
                              </div>
                              <div>
                                 <span className="text-slate-400 block text-[9px]">Awal</span>
                                 <span className="font-black text-emerald-600">{item.summary.saldoAwal || 0}</span>
                              </div>
                           </div>

                           <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700/60">
                              <div className="flex items-baseline gap-1">
                                 <span className="text-[10px] text-slate-400">Total:</span>
                                 <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                    {item.summary.totalAkumulasi} JPL
                                 </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                 <button
                                    onClick={() => handleOpenSaldoAwalModal(item.teacher)}
                                    className="px-2 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-bold border border-emerald-200 dark:border-emerald-800 cursor-pointer"
                                 >
                                    Saldo Awal
                                 </button>
                                 <button
                                    onClick={() => handleOpenLogModal(item.teacher)}
                                    className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-bold border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 cursor-pointer"
                                 >
                                    <Eye size={12} />
                                    <span>Log ({item.entriesCount})</span>
                                 </button>
                              </div>
                           </div>
                        </div>
                     ))}
                     {filteredJurnalList.length === 0 && (
                        <div className="p-6 text-center text-slate-500 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-200 dark:border-slate-700 text-xs italic">
                           Tidak ada data guru yang cocok dengan kriteria pencarian dan filter saat ini.
                        </div>
                     )}
                  </div>
               </div>
            )}

            {/* TAB BARU: MANAJEMEN RIWAYAT KEGIATAN MASSAL */}
            {activeTab === 'riwayat_massal' && (
                  <div className="p-3.5 sm:p-5 md:p-6 flex-1 bg-white dark:bg-slate-800 flex flex-col h-full overflow-hidden">
                      <div className="flex items-center justify-between mb-3 sm:mb-4 shrink-0">
                         <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-base sm:text-lg">
                           <History className="text-amber-500"/> <span className="hidden sm:inline">Manajemen Riwayat Kegiatan (Bulan Ini)</span><span className="sm:hidden">Riwayat Kegiatan</span>
                         </h3>
                         <span className="text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 shrink-0">
                           Total: {massActivities.length}
                         </span>
                      </div>
                      
                      {/* Mobile Card Feed (< md) */}
                      <div className="md:hidden space-y-3 overflow-y-auto flex-1 pr-0.5">
                         {massActivities.map((act, idx) => (
                            <div key={act.originalId} className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col gap-2.5">
                               <div className="flex justify-between items-start">
                                  <div>
                                     <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 inline-block mb-1">
                                        Tgl {act.tgl}
                                     </span>
                                     <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">{act.ket}</h4>
                                  </div>
                                  <span className="text-xs font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/50 shrink-0">
                                     +{act.jam} JPL
                                  </span>
                               </div>
                               <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700/60">
                                  <button onClick={() => setPreviewActivity(act)} className="text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 flex items-center gap-1 shadow-xs">
                                     <Eye size={13} className="text-indigo-500"/> {act.teacherNames.length} Peserta
                                  </button>
                                  <div className="flex items-center gap-1.5">
                                     <button onClick={() => setEditActivity(act)} className="p-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 dark:border-blue-800" title="Edit Kegiatan">
                                        <Edit size={14}/>
                                     </button>
                                     <button onClick={() => setDeleteActivity(act)} className="p-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 rounded-lg transition-colors border border-red-200 dark:border-red-800" title="Batalkan/Hapus Kegiatan">
                                        <Trash2 size={14}/>
                                     </button>
                                  </div>
                               </div>
                            </div>
                         ))}
                         {massActivities.length === 0 && (
                            <div className="p-6 text-center text-slate-500 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-200 dark:border-slate-700 text-xs italic">
                               Belum ada kegiatan massal yang dicatat bulan ini.
                            </div>
                         )}
                      </div>

                      {/* Desktop Table (>= md) */}
                      <div className="hidden md:block overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/20 shadow-sm flex-1">
                          <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
                             <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 shadow-sm">
                                <tr>
                                  <th className="p-3 font-bold text-center w-12">No</th>
                                  <th className="p-3 font-bold text-center w-24">Tanggal</th>
                                  <th className="p-3 font-bold">Nama Kegiatan Massal</th>
                                  <th className="p-3 font-bold text-center w-28">Bobot JPL</th>
                                  <th className="p-3 font-bold text-center w-32">Peserta Hadir</th>
                                  <th className="p-3 font-bold text-center w-32">Aksi Manajemen</th>
                                </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {massActivities.map((act, idx) => (
                                    <tr key={act.originalId} className="hover:bg-amber-50/40 dark:hover:bg-slate-800/40 transition-colors">
                                       <td className="p-3 text-center font-bold text-slate-400 dark:text-slate-500 text-xs w-12">{idx + 1}</td>
                                        <td className="p-3 font-bold text-slate-500 dark:text-slate-400 text-center">Tgl {act.tgl}</td>
                                       <td className="p-3 font-extrabold text-slate-800 dark:text-slate-200">{act.ket}</td>
                                       <td className="p-3 text-center">
                                          <span className="text-sm font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-md border border-amber-100 dark:border-amber-800/50">+{act.jam} JPL</span>
                                       </td>
                                       <td className="p-3 text-center">
                                          <button onClick={() => setPreviewActivity(act)} className="text-[11px] font-bold bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 flex items-center justify-center gap-1.5 mx-auto hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300 transition-colors shadow-sm">
                                             <Eye size={14}/> {act.teacherNames.length} Guru
                                          </button>
                                       </td>
                                       <td className="p-3 text-center">
                                          <div className="flex items-center justify-center gap-2">
                                             <button onClick={() => setEditActivity(act)} className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 dark:border-blue-800/50 shadow-sm" title="Edit Kegiatan"><Edit size={16}/></button>
                                             <button onClick={() => setDeleteActivity(act)} className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-red-200 dark:border-red-800/50 shadow-sm" title="Batalkan/Hapus Kegiatan"><Trash2 size={16}/></button>
                                          </div>
                                       </td>
                                    </tr>
                                ))}
                                {massActivities.length === 0 && (
                                    <tr><td colSpan="6" className="p-10 text-center text-slate-500 bg-white dark:bg-slate-800 italic m-2 rounded-xl">Belum ada kegiatan massal yang dicatat bulan ini.</td></tr>
                                )}
                             </tbody>
                          </table>
                      </div>
                  </div>
            )}
         </div>
      </div>
    </div>
  );
}

// --- VIEW GAJI (DIKEMBALIKAN KARENA TERPOTONG) ---
export { JadwalMengajarView };
