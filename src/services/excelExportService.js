import * as XLSX from 'xlsx';
import { calculatePayroll, isTeacherActive, getFormattedPeriod } from '../utils/payrollUtils';

/**
 * Trigger pengunduhan file dari binary buffer di browser
 */
const downloadExcelFile = (workbook, filename) => {
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' 
  });
  
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

/**
 * 📊 EKSPOR REKAP GAJI BULANAN KE EXCEL (.XLSX)
 * Dilengkapi rincian komprehensif, header resmi sekolah, format angka, dan baris total.
 */
export const exportPayrollToExcel = ({ teachers = [], settings = {}, periode = '', filename = '' }) => {
  const activeTeachers = (teachers || []).filter(isTeacherActive);
  const formattedPeriode = getFormattedPeriod(periode || settings?.payrollPeriod);
  const schoolName = settings?.schoolName || 'SD IT Qurrata A\'yun Kandis';
  
  const finalFilename = filename || `Rekap_Gaji_${schoolName.replace(/[^a-zA-Z0-9]/g, '_')}_${formattedPeriode.replace(/\s+/g, '_')}.xlsx`;

  // 1. Susun Baris Judul & Metadata Resmi Sekolah
  const rows = [
    [schoolName.toUpperCase()],
    ['LAPORAN REKAPITULASI PENGGAJIAN GURU & PEGAWAI'],
    [`Periode: ${formattedPeriode} | Status Payroll: ${settings?.payrollStatus || 'Sah'}`],
    [`Dicetak pada: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB`],
    [], // Baris kosong pemisah
    // Header Kolom Tabel (Baris index 5 -> Excel Row 6)
    [
      'No',
      'NIPY',
      'Nama Guru / Pegawai',
      'Status',
      'Pendidikan',
      'TMT',
      'Tunjangan Masa Kerja',
      'Tunjangan Jabatan',
      'Tunjangan Pendidikan',
      'Tunjangan Kompetensi',
      'Jam Wajib',
      'Jam Realisasi',
      'Jam Tambahan (+)',
      'Jam Insidental',
      'Total Jam Diperhitungkan',
      'Tarif JPL',
      'Nominal Jam Mengajar',
      'Tepat Waktu (Jam)',
      'Bonus Hadir',
      'Tunjangan Istri/Suami',
      'Tunjangan Anak',
      'Total Tunjangan Keluarga',
      'Insentif Tambahan',
      'TOTAL PENERIMAAN KOTOR',
      'Keterlambatan (Kali)',
      'Potongan Keterlambatan',
      'Potongan Lainnya / Kasbon',
      'TOTAL POTONGAN',
      'GAJI BERSIH (TAKE HOME PAY)'
    ]
  ];

  // 2. Baris Data Guru
  let totalKotorSum = 0;
  let totalPotonganSum = 0;
  let totalBersihSum = 0;
  let totalMengajarSum = 0;
  let totalBonusHadirSum = 0;
  let totalMasaKerjaSum = 0;
  let totalJabatanSum = 0;
  let totalPendidikanSum = 0;
  let totalKompetensiSum = 0;
  let totalKeluargaSum = 0;
  let totalTambahanSum = 0;
  let totalPotongTelatSum = 0;
  let totalPotonganLainnyaSum = 0;

  activeTeachers.forEach((teacher, idx) => {
    const slip = calculatePayroll(teacher, settings);
    const p = teacher.payroll || {};

    const tMasaKerja = slip.tMasaKerja || 0;
    const tJabatan = slip.tJabatan || 0;
    const tPendidikan = slip.tPendidikan || 0;
    const tKompetensi = slip.tKompetensi || 0;
    const tMengajar = slip.tMengajar || 0;
    const bonusHadir = slip.bonusHadir || 0;
    const tKeluargaWife = slip.tKeluargaWife || 0;
    const tKeluargaAnak = slip.tKeluargaAnak || 0;
    const tKeluarga = slip.tKeluarga || 0;
    const tTambahan = slip.tTambahan || 0;
    const totalKotor = slip.totalKotor || 0;

    const potongTelat = slip.potongTelat || 0;
    const tPotonganLainnya = slip.tPotonganLainnya || 0;
    const totalPotongan = slip.totalPotongan || 0;
    const totalBersih = slip.totalBersih || 0;

    // Akumulasi total
    totalMasaKerjaSum += tMasaKerja;
    totalJabatanSum += tJabatan;
    totalPendidikanSum += tPendidikan;
    totalKompetensiSum += tKompetensi;
    totalMengajarSum += tMengajar;
    totalBonusHadirSum += bonusHadir;
    totalKeluargaSum += tKeluarga;
    totalTambahanSum += tTambahan;
    totalKotorSum += totalKotor;
    totalPotongTelatSum += potongTelat;
    totalPotonganLainnyaSum += tPotonganLainnya;
    totalPotonganSum += totalPotongan;
    totalBersihSum += totalBersih;

    const realJam = Number(p.jamMengajar?.realisasi) || 0;
    const telat = Number(p.disiplin?.telat) || 0;
    const tepatWaktu = Math.max(0, realJam - telat);
    const tInsidentalJam = (p.kegiatanInsidental || []).reduce((sum, item) => sum + (Number(item.jam) || 0), 0);

    rows.push([
      idx + 1,
      teacher.nipy || teacher.id || '-',
      teacher.name || '-',
      teacher.status || 'Tetap',
      teacher.education || '-',
      teacher.tmt || '-',
      tMasaKerja,
      tJabatan,
      tPendidikan,
      tKompetensi,
      Number(p.jamMengajar?.wajib) || (teacher.status === 'Tetap' ? 60 : 0),
      realJam,
      Number(p.jamMengajar?.jamPlus) || 0,
      tInsidentalJam,
      slip.jamDihitung || 0,
      Number(p.jamMengajar?.tarifJPL) || 0,
      tMengajar,
      tepatWaktu,
      bonusHadir,
      tKeluargaWife,
      tKeluargaAnak,
      tKeluarga,
      tTambahan,
      totalKotor,
      telat,
      potongTelat,
      tPotonganLainnya,
      totalPotongan,
      totalBersih
    ]);
  });

  // 3. Baris Total Keseluruhan
  rows.push([]); // Pemisah
  rows.push([
    'TOTAL',
    '',
    `Total ${activeTeachers.length} Guru / Pegawai`,
    '',
    '',
    '',
    totalMasaKerjaSum,
    totalJabatanSum,
    totalPendidikanSum,
    totalKompetensiSum,
    '',
    '',
    '',
    '',
    '',
    '',
    totalMengajarSum,
    '',
    totalBonusHadirSum,
    '',
    '',
    totalKeluargaSum,
    totalTambahanSum,
    totalKotorSum,
    '',
    totalPotongTelatSum,
    totalPotonganLainnyaSum,
    totalPotonganSum,
    totalBersihSum
  ]);

  // Buat Worksheet & Workbook
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Atur Lebar Kolom Otomatis (Auto Width)
  const colWidths = [
    { wch: 5 },   // No
    { wch: 14 },  // NIPY
    { wch: 30 },  // Nama
    { wch: 14 },  // Status
    { wch: 12 },  // Pendidikan
    { wch: 12 },  // TMT
    { wch: 18 },  // Masa Kerja
    { wch: 18 },  // Jabatan
    { wch: 18 },  // Pendidikan
    { wch: 18 },  // Kompetensi
    { wch: 12 },  // Wajib
    { wch: 12 },  // Realisasi
    { wch: 12 },  // Jam Plus
    { wch: 14 },  // Insidental
    { wch: 16 },  // Total Jam
    { wch: 14 },  // Tarif JPL
    { wch: 20 },  // Nominal Mengajar
    { wch: 16 },  // Tepat Waktu
    { wch: 16 },  // Bonus Hadir
    { wch: 18 },  // Suami/Istri
    { wch: 16 },  // Anak
    { wch: 20 },  // Total Keluarga
    { wch: 18 },  // Insentif Tambahan
    { wch: 22 },  // TOTAL KOTOR
    { wch: 14 },  // Telat (Kali)
    { wch: 18 },  // Potong Telat
    { wch: 20 },  // Potongan Lainnya
    { wch: 20 },  // TOTAL POTONGAN
    { wch: 24 }   // GAJI BERSIH (THP)
  ];
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Gaji');

  // Trigger unduh
  downloadExcelFile(wb, finalFilename);
  return finalFilename;
};

/**
 * 📑 EKSPOR DATA DARI ARSIP BULANAN KE EXCEL (.XLSX)
 */
export const exportArchiveToExcel = ({ archive, settings = {}, filename = '' }) => {
  if (!archive) throw new Error('Data arsip tidak ditemukan.');

  const teachers = archive.teachers || archive.dataGuru || [];
  const periode = archive.periode || archive.period || 'Periode Arsip';
  const customFilename = filename || `Arsip_Gaji_${String(periode).replace(/\s+/g, '_')}.xlsx`;

  return exportPayrollToExcel({
    teachers,
    settings: { ...settings, payrollPeriod: periode },
    periode,
    filename: customFilename
  });
};

/**
 * 📅 EKSPOR REKAP PRESENSI GURU KE EXCEL (.XLSX)
 * Menghasilkan 2 sheet: "Rincian Log Harian" & "Ringkasan Per Guru"
 */
export const exportAttendanceToExcel = ({ 
  presensiRecords = [], 
  teachers = [], 
  settings = {}, 
  filterMonth = '', 
  filename = '' 
}) => {
  const schoolName = settings?.schoolName || 'SD IT Qurrata A\'yun Kandis';
  const formattedPeriode = filterMonth || getFormattedPeriod(settings?.payrollPeriod);
  const finalFilename = filename || `Rekap_Presensi_${schoolName.replace(/[^a-zA-Z0-9]/g, '_')}_${String(formattedPeriode).replace(/\s+/g, '_')}.xlsx`;

  // Buat Map Nama Guru dari ID untuk lookup cepat
  const teacherMap = new Map();
  (teachers || []).forEach(t => {
    teacherMap.set(String(t.id), t);
    if (t.nipy) teacherMap.set(String(t.nipy), t);
  });

  // Filter record sesuai filter bulan jika ada
  let filtered = [...presensiRecords];
  if (filterMonth && filterMonth !== 'Semua') {
    filtered = filtered.filter(r => {
      const d = r.tanggal || r.date || '';
      return d.startsWith(filterMonth) || getFormattedPeriod(d) === filterMonth;
    });
  }

  // Urutkan presensi: Tanggal terbaru di atas
  filtered.sort((a, b) => new Date(b.tanggal || b.date || 0) - new Date(a.tanggal || a.date || 0));

  // --- SHEET 1: RINCIAN LOG HARIAN ---
  const sheet1Rows = [
    [schoolName.toUpperCase()],
    ['LOG PRESENSI & KEHADIRAN HARIAN GURU'],
    [`Periode: ${formattedPeriode} | Total Log: ${filtered.length} Catatan`],
    [`Dicetak pada: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB`],
    [],
    [
      'No',
      'Tanggal',
      'Hari',
      'Sesi Presensi',
      'NIPY',
      'Nama Guru / Pegawai',
      'Status Kehadiran',
      'Jam Masuk',
      'Jam Pulang',
      'Keterlambatan (Menit)',
      'Lokasi GPS',
      'Metode Absen',
      'Perangkat HP / Browser',
      'Catatan / Alasan'
    ]
  ];

  filtered.forEach((rec, idx) => {
    const teacher = teacherMap.get(String(rec.teacherId || rec.guruId || rec.nipy)) || {};
    const tanggalObj = rec.tanggal ? new Date(rec.tanggal) : null;
    const hari = tanggalObj && !isNaN(tanggalObj.getTime())
      ? tanggalObj.toLocaleDateString('id-ID', { weekday: 'long' })
      : '-';

    sheet1Rows.push([
      idx + 1,
      rec.tanggal || rec.date || '-',
      hari,
      rec.sesiNama || rec.sesi || 'Pagi (KBM)',
      teacher.nipy || rec.nipy || '-',
      rec.namaGuru || teacher.name || rec.teacherName || '-',
      rec.status || 'Hadir',
      rec.jamMasuk || rec.timeIn || '-',
      rec.jamPulang || rec.timeOut || '-',
      Number(rec.telatMenit) || 0,
      rec.lokasiNama || (rec.latitude ? `${rec.latitude}, ${rec.longitude}` : 'Sekolah'),
      rec.metode || (rec.qrScanned ? 'QR Code' : 'GPS / Tombol'),
      rec.deviceName || '-',
      rec.keterangan || rec.catatan || '-'
    ]);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);
  ws1['!cols'] = [
    { wch: 5 },  // No
    { wch: 14 }, // Tanggal
    { wch: 12 }, // Hari
    { wch: 16 }, // Sesi
    { wch: 14 }, // NIPY
    { wch: 28 }, // Nama
    { wch: 16 }, // Status
    { wch: 12 }, // Masuk
    { wch: 12 }, // Pulang
    { wch: 18 }, // Telat Menit
    { wch: 22 }, // Lokasi
    { wch: 16 }, // Metode
    { wch: 20 }, // Perangkat
    { wch: 28 }  // Catatan
  ];

  // --- SHEET 2: REKAPITULASI TOTAL PER GURU ---
  const activeTeachers = (teachers || []).filter(isTeacherActive);
  const teacherStats = new Map();

  activeTeachers.forEach(t => {
    teacherStats.set(String(t.id), {
      nipy: t.nipy || '-',
      name: t.name || '-',
      status: t.status || 'Tetap',
      hadir: 0,
      terlambat: 0,
      sakit: 0,
      izin: 0,
      alpa: 0,
      cuti: 0,
      dinasLuar: 0,
      totalMenitTelat: 0
    });
  });

  filtered.forEach(rec => {
    const tId = String(rec.teacherId || rec.guruId || '');
    let stat = teacherStats.get(tId);
    if (!stat && rec.nipy) {
      stat = Array.from(teacherStats.values()).find(s => s.nipy === rec.nipy);
    }

    if (stat) {
      const st = String(rec.status || '').toLowerCase();
      if (st.includes('hadir') || st === 'h') stat.hadir++;
      else if (st.includes('terlambat') || st === 't') {
        stat.hadir++; // Terlambat tetap dihitung hadir
        stat.terlambat++;
      }
      else if (st.includes('sakit') || st === 's') stat.sakit++;
      else if (st.includes('izin') || st === 'i') stat.izin++;
      else if (st.includes('alpa') || st === 'a') stat.alpa++;
      else if (st.includes('cuti') || st === 'c') stat.cuti++;
      else if (st.includes('dinas') || st === 'dl') stat.dinasLuar++;

      if (rec.telatMenit) {
        stat.totalMenitTelat += Number(rec.telatMenit) || 0;
      }
    }
  });

  const sheet2Rows = [
    [schoolName.toUpperCase()],
    ['REKAPITULASI KEHADIRAN GURU / PEGAWAI'],
    [`Periode: ${formattedPeriode}`],
    [],
    [
      'No',
      'NIPY',
      'Nama Guru / Pegawai',
      'Status Kepegawaian',
      'Total Hadir',
      'Terlambat (Kali)',
      'Total Menit Keterlambatan',
      'Sakit (Hari)',
      'Izin (Hari)',
      'Alpa (Hari)',
      'Cuti (Hari)',
      'Dinas Luar (Hari)'
    ]
  ];

  let no = 1;
  teacherStats.forEach((stat) => {
    sheet2Rows.push([
      no++,
      stat.nipy,
      stat.name,
      stat.status,
      stat.hadir,
      stat.terlambat,
      stat.totalMenitTelat,
      stat.sakit,
      stat.izin,
      stat.alpa,
      stat.cuti,
      stat.dinasLuar
    ]);
  });

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
  ws2['!cols'] = [
    { wch: 5 },  // No
    { wch: 14 }, // NIPY
    { wch: 30 }, // Nama
    { wch: 16 }, // Status
    { wch: 14 }, // Hadir
    { wch: 16 }, // Terlambat
    { wch: 22 }, // Menit Telat
    { wch: 14 }, // Sakit
    { wch: 14 }, // Izin
    { wch: 14 }, // Alpa
    { wch: 14 }, // Cuti
    { wch: 16 }  // Dinas Luar
  ];

  // Buat Workbook & Sisipkan 2 Sheet
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Log Harian');
  XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan Per Guru');

  downloadExcelFile(wb, finalFilename);
  return finalFilename;
};

/**
 * 📚 EKSPOR REKAP ABSENSI JAM MENGAJAR HARIAN KE EXCEL (.XLSX)
 * Memuat matriks 31 hari, jam plus, realisasi, wajib, selisih, dan telat.
 */
export const exportTeachingHoursToExcel = ({ 
  teachers = [], 
  settings = {}, 
  presensiGuru = [],
  bulan = '', 
  filename = '' 
}) => {
  const schoolName = settings?.schoolName || 'SD IT Qurrata A\'yun Kandis';
  const formattedPeriode = bulan || getFormattedPeriod(settings?.payrollPeriod);
  const finalFilename = filename || `Rekap_Absen_Mengajar_${schoolName.replace(/[^a-zA-Z0-9]/g, '_')}_${String(formattedPeriode).replace(/\s+/g, '_')}.xlsx`;

  const daysHeaders = Array.from({ length: 31 }, (_, i) => `Tgl ${i + 1}`);
  
  // SHEET 1: REKAP JAM MENGAJAR 31 HARI
  const sheet1Rows = [
    [schoolName.toUpperCase()],
    ['REKAPITULASI JAM MENGAJAR GURU & PEGAWAI'],
    [`Periode: ${formattedPeriode}`],
    [`Dicetak pada: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB`],
    [],
    [
      'No',
      'NIPY',
      'Nama Guru',
      'Status',
      ...daysHeaders,
      'Jam Plus (+)',
      'Total Realisasi',
      'Jam Wajib',
      'JSJM',
      'Selisih Jam',
      'Keterlambatan (Kali)',
      'Tepat Waktu (Jam)'
    ]
  ];

  let sumRealisasi = 0;
  let sumWajib = 0;
  let sumPlus = 0;
  let sumSelisih = 0;
  let sumTelat = 0;
  let sumTepatWaktu = 0;

  teachers.forEach((t, idx) => {
    const p = t.payroll || {};
    const wajib = p.jamMengajar?.wajib !== undefined && p.jamMengajar?.wajib !== '' ? Number(p.jamMengajar.wajib) : (t.status === 'Tetap' ? 60 : 0);
    const real = Number(p.jamMengajar?.realisasi) || 0;
    const jsjm = Number(p.jamMengajar?.jsjm) || 0;
    const jamPlus = Number(p.jamMengajar?.jamPlus) || 0;
    const selisih = (real + jsjm) - wajib + jamPlus;
    const telat = Number(p.disiplin?.telat) || 0;
    const tepatWaktu = Math.max(0, real - telat);

    sumRealisasi += real;
    sumWajib += wajib;
    sumPlus += jamPlus;
    sumSelisih += selisih;
    sumTelat += telat;
    sumTepatWaktu += tepatWaktu;

    const dailyData = p.jamMengajar?.harian || Array(31).fill('');
    const dailyCells = Array.from({ length: 31 }, (_, i) => dailyData[i] || '-');

    sheet1Rows.push([
      idx + 1,
      t.nipy || t.id || '-',
      t.name || '-',
      t.status || 'Tetap',
      ...dailyCells,
      jamPlus,
      real,
      wajib,
      jsjm,
      selisih,
      telat,
      tepatWaktu
    ]);
  });

  // Baris Total
  sheet1Rows.push([]);
  const emptyDays = Array(31).fill('');
  sheet1Rows.push([
    'TOTAL',
    '',
    `Total ${teachers.length} Guru`,
    '',
    ...emptyDays,
    sumPlus,
    sumRealisasi,
    sumWajib,
    '',
    sumSelisih,
    sumTelat,
    sumTepatWaktu
  ]);

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);

  // Auto width
  const cols = [
    { wch: 5 },  // No
    { wch: 14 }, // NIPY
    { wch: 28 }, // Nama
    { wch: 14 }, // Status
    ...Array(31).fill({ wch: 5 }), // 31 hari
    { wch: 12 }, // Jam Plus
    { wch: 14 }, // Realisasi
    { wch: 12 }, // Wajib
    { wch: 10 }, // JSJM
    { wch: 12 }, // Selisih
    { wch: 14 }, // Telat
    { wch: 16 }  // Tepat Waktu
  ];
  ws1['!cols'] = cols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Jam Mengajar 31 Hari');

  // Jika ada log presensi guru, sertakan Sheet 2
  if (Array.isArray(presensiGuru) && presensiGuru.length > 0) {
    const sheet2Rows = [
      [schoolName.toUpperCase()],
      ['LOG PRESENSI FINGERPRINT / GPS GURU'],
      [`Periode: ${formattedPeriode}`],
      [],
      ['No', 'Tanggal', 'Sesi', 'NIPY', 'Nama Guru', 'Status', 'Jam Masuk', 'Jam Pulang', 'Keterlambatan (Menit)', 'Lokasi', 'Catatan']
    ];

    presensiGuru.slice(0, 1000).forEach((rec, idx) => {
      sheet2Rows.push([
        idx + 1,
        rec.tanggal || rec.date || '-',
        rec.sesiNama || rec.sesi || 'Pagi',
        rec.nipy || '-',
        rec.namaGuru || rec.teacherName || '-',
        rec.status || 'Hadir',
        rec.jamMasuk || rec.timeIn || '-',
        rec.jamPulang || rec.timeOut || '-',
        Number(rec.telatMenit) || 0,
        rec.lokasiNama || 'Sekolah',
        rec.keterangan || '-'
      ]);
    });

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
    ws2['!cols'] = [
      { wch: 5 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
      { wch: 16 }, { wch: 20 }, { wch: 24 }
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Log Presensi');
  }

  downloadExcelFile(wb, finalFilename);
  return finalFilename;
};
