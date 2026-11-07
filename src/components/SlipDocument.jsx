import React from 'react';
import { calculatePayroll, formatRp, formatDateId, terbilang } from '../utils/payrollUtils';

function SlipDocument({ teacher, bulan, settings }) {
  const slip = calculatePayroll(teacher, settings);
  const p = teacher.payroll || {}; // DIPERBARUI: Failsafe
  const family = teacher.family || {}; // DIPERBARUI: Failsafe
  
  const formatNum = (num) => new Intl.NumberFormat('id-ID').format(num);

  // Helper untuk format nominal rata Kiri (Rp.) Kanan (Angka)
  const renderNominal = (amount) => (
    <div className="flex justify-between w-full">
      <span>Rp.</span>
      <span>{amount ? formatNum(amount) : '-'}</span>
    </div>
  );

  // Helper BARU: untuk rincian baris agar titik dua (:) sejajar rapi sempurna layaknya "Tab"
  // DIPERBARUI: Diubah menjadi fungsi helper (renderDetailRow) untuk menghindari anti-pattern deklarasi komponen dalam komponen
  const renderDetailRow = (label, value) => (
    <div className="flex mb-0.5 w-full">
      <span className="w-[55%] shrink-0 inline-block">{label}</span>
      <span className="w-4 shrink-0 text-center">:</span>
      <span className="flex-1">{value}</span>
    </div>
  );

  // Menghitung jumlah S, I, A dari data harian (jika ada)
  const harian = p.jamMengajar?.harian || [];
  let countS = 0, countI = 0, countA = 0;
  harian.forEach(val => {
    if (val === 'S') countS++;
    if (val === 'I') countI++;
    if (val === 'A') countA++;
  });

  const wajib = p.jamMengajar?.wajib !== undefined && p.jamMengajar?.wajib !== '' ? Number(p.jamMengajar.wajib) : (teacher.status === 'Tetap' ? 60 : 0);
  
  const tepatWaktu = Math.max(0, (p.jamMengajar?.realisasi || 0) - (p.disiplin?.telat || 0));

  let potongans = [];
  // DIPERBARUI: Tambahan keterangan perhitungan tarif potongan telat dengan failsafe
  if (slip.potongTelat > 0) potongans.push({ ket: `Keterlambatan (${p.disiplin?.telat || 0} Kali x ${formatRp(p.disiplin?.tarifTelat || 0)})`, nominal: slip.potongTelat });
  if (p.potonganLainnya) potongans = [...potongans, ...p.potonganLainnya];

  // Ekstrak Tarif Keluarga Dinamis untuk ditampilkan di cetakan
  const tarifSuamiIstri = p.keluarga?.tarifSuamiIstri !== undefined ? Number(p.keluarga.tarifSuamiIstri) : 200000;
  const tarifAnak = p.keluarga?.tarifAnak !== undefined ? Number(p.keluarga.tarifAnak) : 100000;

  // TAMBAHAN: Nomor Slip & Tanggal Cetak Dinamis
  const d = new Date();
  const padZero = (num) => String(num).padStart(2, '0');
  const noSlip = `SLIP/${padZero(d.getMonth() + 1)}-${d.getFullYear()}/${teacher.id}`;
  const tanggalCetak = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="bg-white p-4 md:p-6 rounded-sm shadow-sm border border-slate-300 text-black mx-auto print-area w-full min-w-[750px] relative min-h-auto flex flex-col font-sans" style={{ maxWidth: '215.9mm' }} id="printable-area">
      
      {/* TAMBAHAN: Watermark Logo Sekolah (Transparan 4%) */}
      {settings?.logoUrl && (
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none opacity-[0.04]">
           <img src={settings.logoUrl} alt="Watermark" className="w-[80%] max-w-lg object-contain grayscale" />
        </div>
      )}

      {/* Kop Surat / Header Slip - DIPERBARUI: Layout Flex Rapi & Lencana Putih */}
      <div className="border-b-4 border-double border-black pb-4 mb-4 relative z-10 flex justify-between items-center w-full">
        
        {/* Kiri: Logo & Lencana Periode Gaji */}
        <div className="flex flex-col items-center gap-2 w-1/4 shrink-0">
          {settings?.logoUrl && (
             <img src={settings.logoUrl} alt="Logo" className="w-16 h-16 md:w-[76px] md:h-[76px] object-contain drop-shadow-sm" />
          )}
          <div className="bg-white text-black font-black text-[9px] md:text-[10px] px-4 py-1.5 rounded-full whitespace-nowrap tracking-widest shadow-sm border-2 border-black">
            PERIODE: {bulan.toUpperCase()}
          </div>
        </div>
        
        {/* Tengah: Identitas Sekolah */}
        <div className="flex flex-col justify-center text-center px-2 flex-1 min-w-0">
          {settings?.foundationName && (
             <h1 className="text-base md:text-lg font-black uppercase tracking-wider text-black leading-tight mb-0.5 whitespace-pre-line">
               {settings.foundationName}
             </h1>
          )}
          <h1 className="text-sm md:text-base font-extrabold uppercase tracking-wide text-black leading-snug mb-1 whitespace-pre-line">
            {settings?.schoolName || 'Sekolah Islam Terpadu XYZ'}
          </h1>
          <p className="text-[10px] md:text-xs text-black font-semibold mt-0.5 leading-relaxed whitespace-pre-line">
            {settings?.address || 'Jl. Pendidikan No. 123, Kec. Banjarmasin, Kalimantan Selatan 70123'}
          </p>
        </div>

        {/* Kanan: QR Code & Lencana No Slip */}
        <div className="flex flex-col items-center gap-2 w-1/4 shrink-0">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=VERIFY-${encodeURIComponent(noSlip)}&color=000000`} alt="QR Code" className="w-16 h-16 md:w-[76px] md:h-[76px] border-2 border-black p-1 rounded-lg bg-white shadow-sm" />
          <div className="bg-white text-black font-black text-[9px] md:text-[10px] px-4 py-1.5 rounded-full whitespace-nowrap tracking-widest shadow-sm border-2 border-black">
            NO: {noSlip}
          </div>
        </div>
      </div>

      {/* Identitas Pegawai (DIPERBARUI: Disederhanakan tanpa No Rekening & Periode Gaji) */}
      <div className="grid grid-cols-2 gap-4 mb-3 text-sm relative z-10">
        <div>
          {/* PERBAIKAN: Menghapus class 'uppercase' agar gelar (seperti S.Pd.I) tidak dipaksa menjadi S.PD.I */}
          <div className="flex"><span className="w-28 shrink-0 font-medium">Nama</span><span className="w-4 shrink-0 text-center">:</span><span className="font-bold flex-1">{teacher.name}</span></div>
          <div className="flex"><span className="w-28 shrink-0 font-medium">NIPY</span><span className="w-4 shrink-0 text-center">:</span><span className="flex-1">{teacher.nipy}</span></div>
        </div>
        {/* Memberikan padding left (pl) agar tergeser ke kanan seperti efek 'tab' */}
        <div className="pl-6 sm:pl-12">
          <div className="flex"><span className="w-32 shrink-0 font-medium">Status</span><span className="w-4 shrink-0 text-center">:</span><span className="flex-1">Guru {teacher.status}</span></div>
          <div className="flex"><span className="w-32 shrink-0 font-medium">TMT (Mulai Tugas)</span><span className="w-4 shrink-0 text-center">:</span><span className="flex-1">{formatDateId(teacher.tmt)}</span></div>
        </div>
      </div>

      {/* Tabel Rincian Gaji */}
      <div className="flex-1 mb-2 relative z-10">
        <table className="w-full border-collapse border border-black text-sm">
          <thead>
            <tr>
              <th className="border border-black p-1.5 text-center uppercase w-10">NO.</th>
              <th className="border border-black p-1.5 text-center uppercase"> RINCIAN KOMPONEN GAJI</th>
              <th className="border border-black p-1.5 text-center uppercase w-48">NOMINAL</th>
            </tr>
          </thead>
          <tbody>
            {/* A. TUNJANGAN */}
            <tr className="bg-slate-50"><td colSpan="3" className="border border-black p-1.5 font-bold">A. TUNJANGAN</td></tr>
            <tr>
              <td className="border border-black p-1.5 text-center align-top">1</td>
              <td className="border border-black p-1.5">
                <div className="mb-1 font-semibold">Tunjangan Berdasarkan Masa Kerja</div>
                {renderDetailRow(`TMT (Tahun Mulai Tugas) ${p.tahunMasaKerja}`, <>(<strong>{new Date().getFullYear() - p.tahunMasaKerja} tahun</strong>)</>)}
              </td>
              <td className="border border-black p-1.5 align-top">{renderNominal(slip.tMasaKerja)}</td>
            </tr>
            <tr>
              <td className="border border-black p-1.5 text-center align-top">2</td>
              <td className="border border-black p-1.5">
                {renderDetailRow("Tunjangan Berdasarkan Pendidikan", <strong>{p.pendidikan?.tingkat || teacher.education}</strong>)}
              </td>
              <td className="border border-black p-1.5 align-top">{renderNominal(slip.tPendidikan)}</td>
            </tr>
            {p.jabatans && p.jabatans.length > 0 ? p.jabatans.map((j, i) => (
              <tr key={`jab-${i}`}>
                <td className="border border-black p-1.5 text-center align-top">{i === 0 ? 3 : ''}</td>
                <td className="border border-black p-1.5">
                  <div className="mb-1 font-semibold">Jabatan {i+1} ({j.detail})</div>
                  {renderDetailRow("Penilaian Kinerja", <strong>{j.kinerja}</strong>)}
                </td>
                <td className="border border-black p-1.5 align-top">{renderNominal(j.nominal)}</td>
              </tr>
            )) : (
              <tr>
                <td className="border border-black p-1.5 text-center align-top">3</td>
                <td className="border border-black p-1.5 italic text-slate-500">Tidak ada jabatan</td>
                <td className="border border-black p-1.5 align-top">{renderNominal(0)}</td>
              </tr>
            )}
            {p.kompetensi && p.kompetensi.length > 0 ? p.kompetensi.map((k, i) => (
              <tr key={`komp-${i}`}>
                <td className="border border-black p-1.5 text-center align-top">{i === 0 ? 4 : ''}</td>
                <td className="border border-black p-1.5">
                  <div className="mb-1 font-semibold">Tunjangan Kompetensi</div>
                  {renderDetailRow("Bidang Keahlian Khusus", <span className="font-bold">{k.bidang}</span>)}
                  {renderDetailRow("Level Kompetensi", <span className="font-bold">{k.level}</span>)}
                </td>
                <td className="border border-black p-1.5 align-top">{renderNominal(k.nominal)}</td>
              </tr>
            )) : (
              <tr>
                <td className="border border-black p-1.5 text-center align-top">4</td>
                <td className="border border-black p-1.5 italic text-slate-500">Tidak ada tunjangan kompetensi</td>
                <td className="border border-black p-1.5 align-top">{renderNominal(0)}</td>
              </tr>
            )}
            <tr>
              <td className="border border-black p-1.5 text-center align-top">5</td>
              <td className="border border-black p-1.5">
                <div className="mb-1 font-semibold">Tunjangan Keluarga <span className="text-[11px] font-normal italic text-slate-600">({family.wife === 1 ? 'Menikah' : family.wife === 2 ? 'Menikah - Ditanggung Suami' : 'Belum Menikah'})</span></div>
                {/* DIPERBARUI: Label dinamis menyesuaikan gender dan pasangan 1 yayasan */}
                {renderDetailRow(teacher.gender === 'P' ? 'Suami' : 'Isteri', <>{family.wife === 1 ? <>1 Orang <span className="font-normal italic text-slate-600 ml-1">(x {formatRp(tarifSuamiIstri)})</span></> : family.wife === 2 ? <span className="italic text-slate-600 font-medium text-xs bg-slate-100 px-2 py-0.5 rounded">Ditanggung Suami</span> : '0 Orang'}</>)}
                {renderDetailRow("Anak", <>{family.wife === 1 ? (family.children || 0) : 0} Orang <span className="font-normal italic text-slate-600 ml-1">(x {formatRp(tarifAnak)})</span></>)}
              </td>
              <td className="border border-black p-1.5 align-top">{renderNominal(slip.tKeluarga)}</td>
            </tr>

            {/* B. INSENTIF KEHADIRAN & JAM MENGAJAR */}
            <tr className="bg-slate-50 print:break-inside-avoid"><td colSpan="3" className="border border-black p-1.5 font-bold">B. INSENTIF KEHADIRAN & JAM MENGAJAR</td></tr>
            <tr className="print:break-inside-avoid">
              <td className="border border-black p-1.5 text-center align-top">1</td>
              <td className="border border-black p-1.5">
                {/* DIPERBARUI: Penambahan JSJM dan Penyesuaian Label Jam Mengajar */}
                {renderDetailRow("Jabatan Setara Jam Mengajar (JSJM)", `${p.jamMengajar?.jsjm || 0} jam`)}
                {renderDetailRow("Tambahan Jam (Jam +)", `${slip.jamPlus || 0} jam`)}
                {renderDetailRow("Jam Mengajar Bulan Ini", `${p.jamMengajar?.realisasi || 0} jam`)}
                {renderDetailRow("Jam Wajib Mengajar Guru Tetap", `${wajib} jam`)}
                {renderDetailRow("Selisih Jam Mengajar", <>{slip.jamDihitung} jam <span className="font-normal italic text-slate-600 ml-1">(x {formatRp(p.jamMengajar?.tarifJPL || 0)})</span></>)}
              </td>
              <td className="border border-black p-1.5 align-top">{renderNominal(slip.tMengajar)}</td>
            </tr>
            <tr className="print:break-inside-avoid">
              <td className="border border-black p-1.5 text-center align-top">2</td>
              <td className="border border-black p-1.5">
                <div className="mb-1 font-semibold">Bonus Kedisiplinan Waktu Masuk Kelas</div>
                {renderDetailRow("Jumlah Kehadiran Tepat Waktu", <>{tepatWaktu} kali <span className="font-normal italic text-slate-600 ml-1">(x {formatRp(p.disiplin?.tarifHadir || 0)})</span></>)}
                {renderDetailRow("Jumlah Keterlambatan", `${p.disiplin?.telat || 0} kali`)}
              </td>
              <td className="border border-black p-1.5 align-top">{renderNominal(slip.bonusHadir)}</td>
            </tr>

            {/* C. INSENTIF TUGAS TAMBAHAN KHUSUS */}
            <tr className="bg-slate-50 print:break-inside-avoid"><td colSpan="3" className="border border-black p-1.5 font-bold">C. INSENTIF TUGAS TAMBAHAN KHUSUS</td></tr>
            {p.insentifTambahan && p.insentifTambahan.length > 0 ? p.insentifTambahan.map((ins, i) => (
              <tr key={`ins-${i}`} className="print:break-inside-avoid">
                <td className="border border-black p-1.5 text-center align-top">{i+1}</td>
                <td className="border border-black p-1.5">{ins.ket}</td>
                <td className="border border-black p-1.5 align-top">{renderNominal(ins.nominal)}</td>
              </tr>
            )) : (
               <tr className="print:break-inside-avoid">
                 <td className="border border-black p-1.5 text-center align-top">1</td>
                 <td className="border border-black p-1.5 italic text-slate-500">Tidak ada insentif tambahan</td>
                 <td className="border border-black p-1.5 align-top">{renderNominal(0)}</td>
               </tr>
            )}

            {/* TOTAL GAJI KOTOR */}
            <tr className="bg-slate-200 print:bg-slate-200 print:break-inside-avoid" style={{WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact'}}>
              <td colSpan="2" className="border border-black p-2 font-bold text-center uppercase tracking-wider">TOTAL GAJI KOTOR</td>
              <td className="border border-black p-2 font-bold">{renderNominal(slip.totalKotor)}</td>
            </tr>

                {/* D. POTONGAN GAJI */}
            <tr className="bg-slate-50 print:break-inside-avoid"><td colSpan="3" className="border border-black p-1.5 font-bold">D. POTONGAN GAJI</td></tr>
            {potongans.length > 0 ? potongans.map((pot, i) => (
              <tr key={`pot-${i}`} className="print:break-inside-avoid">
                <td className="border border-black p-1.5 text-center align-top">{i === 0 ? 1 : ''}</td>
                <td className="border border-black p-1.5">
                  {pot.ket}
                  {/* TAMBAHAN POIN 4: Fitur Info Sisa Saldo Kasbon/Koperasi Dinamis */}
                  {(pot.ket.toLowerCase().includes('koperasi') || pot.ket.toLowerCase().includes('kasbon') || pot.ket.toLowerCase().includes('pinjaman')) && (
                     <div className="text-[10px] text-slate-600 font-medium italic mt-0.5 ml-1">
                        *(Sisa Saldo Pinjaman/Kasbon: {formatRp(pot.sisaHutang !== undefined ? pot.sisaHutang : (pot.nominal * 4))})
                     </div>
                  )}
                </td>
                <td className="border border-black p-1.5 align-top">{renderNominal(pot.nominal)}</td>
              </tr>
            )) : (
              <tr className="print:break-inside-avoid">
                <td className="border border-black p-1.5 text-center align-top">1</td>
                <td className="border border-black p-1.5 italic text-slate-500">Tidak ada potongan</td>
                <td className="border border-black p-1.5 align-top">{renderNominal(0)}</td>
              </tr>
            )}

            {/* TOTAL POTONGAN */}
            <tr className="print:break-inside-avoid">
              <td colSpan="2" className="border border-black p-2 font-bold text-center uppercase tracking-wider">TOTAL POTONGAN</td>
              <td className="border border-black p-2 font-bold">{renderNominal(slip.totalPotongan)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* PENERIMAAN GAJI BERSIH THP (DIPERBARUI: TAMBAHAN Metode Pembayaran) */}
      <table className="w-full border-collapse border-4 border-double border-black mb-3 mt-1 relative z-10 print:break-inside-avoid">
         <tbody>
            <tr className="bg-slate-200 text-black print:bg-slate-200 print:text-black" style={{WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact'}}>
               <td className="border border-black p-2 md:p-3 font-bold text-center w-[60%] text-sm tracking-wide">
                  PENERIMAAN GAJI BERSIH (THP)
                  {teacher.bankName && <div className="text-[10px] font-normal italic mt-0.5 opacity-80">*Dana ditransfer ke rekening penerima</div>}
               </td>
               <td className="border border-black p-2 md:p-3 font-bold text-center text-lg w-[40%]">
                  {formatRp(slip.totalBersih)}
               </td>
            </tr>
            <tr>
               <td colSpan="2" className="border border-black p-2 text-center text-xs bg-slate-50">
                  Terbilang: <strong className="ml-1 uppercase text-slate-800 italic"># {terbilang(slip.totalBersih).trim()} Rupiah #</strong>
               </td>
            </tr>
         </tbody>
      </table>

      {/* Keterangan Tidak Hadir (DIPERBARUI: Dibuat sejajar 1 baris untuk hemat tempat) */}
      <div className="text-sm mb-3 mt-1 relative z-10 print:break-inside-avoid">
         <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 font-medium border border-black p-2 bg-slate-50">
           <div className="font-bold mr-2">Keterangan Tidak Hadir:</div>
           <div className="flex items-center gap-1.5"><span className="w-16">Sakit (S)</span><span>:</span><span className="font-bold">{countS} Hari</span></div>
           <div className="flex items-center gap-1.5"><span className="w-16">Izin (I)</span><span>:</span><span className="font-bold">{countI} Hari</span></div>
           <div className="flex items-center gap-1.5"><span className="w-16">Alpa (A)</span><span>:</span><span className="font-bold">{countA} Hari</span></div>
         </div>
      </div>

      {/* Bagian Tanda Tangan (TAMBAHAN POIN 1: E-Sign & Stamp) */}
      <div className="mt-auto grid grid-cols-2 text-center text-sm pt-2 relative z-10 print:break-inside-avoid">
         <div className="flex flex-col items-center justify-end">
           <p className="mb-12">Penerima,</p>
           {/* PERBAIKAN: Menghapus class 'uppercase' agar gelar tanda tangan presisi */}
           <p className="font-bold underline tracking-wide">{teacher.name}</p>
         </div>
         <div className="flex flex-col items-center justify-end relative">
           <p className="mb-2">Kuala Pembuang, {tanggalCetak}<br/>Mengetahui, Kepala Sekolah</p>
           
           {/* E-Sign Container */}
           <div className="relative w-32 h-20 flex items-center justify-center my-1">
             {/* Tanda Tangan: Cek jika ada URL kustom di pengaturan */}
             {settings?.signatureUrl ? (
               <img src={settings.signatureUrl} alt="Tanda Tangan" className="absolute w-32 h-16 object-contain z-10 mix-blend-multiply transform -rotate-2" />
             ) : (
               <svg className="absolute w-28 h-16 text-blue-900/80 transform rotate-[-5deg]" viewBox="0 0 100 50">
                 <path d="M10,40 C15,25 25,10 35,15 C45,20 40,45 50,35 C60,25 65,10 75,20 C85,30 80,45 95,30" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                 <path d="M25,28 L50,28" fill="none" stroke="currentColor" strokeWidth="1.5" />
               </svg>
             )}
           </div>
           
           {/* DIPERBARUI: Nama Kepala Sekolah menjadi dinamis dari pengaturan. Menghapus 'uppercase' agar gelar Kepala Sekolah presisi */}
           <p className="font-bold underline tracking-wide relative z-10">{settings?.principalName || 'H. Fulan, S.Pd., M.Pd'}</p>
         </div>
      </div>

      {/* TAMBAHAN: Catatan Kaki (Footer Disclaimer) */}
      <div className="mt-8 border-t border-dashed border-slate-400 pt-3 text-[10px] text-slate-500 italic text-center relative z-10 pb-2 print:break-inside-avoid">
         Dokumen slip gaji ini diterbitkan secara otomatis oleh sistem penggajian Guru SDIT QA dan dilengkapi dengan validasi QR Code. Harap simpan dokumen ini sebagai bukti yang sah. Jika terdapat ketidaksesuaian rincian, mohon hubungi Bendahara maksimal 1x24 jam sejak dokumen ini diterima.
      </div>
    </div>
  );
}

// Rekap Gaji View
export default SlipDocument;
