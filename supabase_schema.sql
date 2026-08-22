-- =======================================================
-- SKRIP DATABASE SUPABASE UNTUK PAYEDU APP (SD-IT QA)
-- Jalankan skrip ini di SQL Editor di dashboard Supabase Anda.
-- =======================================================

-- 1. Tabel Pengaturan Aplikasi (General Settings & Master Rates)
CREATE TABLE IF NOT EXISTS public.settings (
    id TEXT PRIMARY KEY DEFAULT 'general',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Data Pegawai / Guru (Teachers & Staff)
CREATE TABLE IF NOT EXISTS public.teachers (
    id TEXT PRIMARY KEY,
    name TEXT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabel Arsip Rekapitulasi Penggajian Bulanan
CREATE TABLE IF NOT EXISTS public.archives (
    id TEXT PRIMARY KEY,
    period TEXT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabel Saran & Feedback
CREATE TABLE IF NOT EXISTS public.feedbacks (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabel Log Riwayat Login
CREATE TABLE IF NOT EXISTS public.login_logs (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Active RLS (Row Level Security) - Memungkinkan Akses Anonim/Public untuk Operasional Aplikasi
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

-- Kebijakan Akses Publik (Bisa disesuaikan jika ingin dipasang login Supabase Auth di masa depan)
CREATE POLICY "Allow public read/write access to settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write access to teachers" ON public.teachers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write access to archives" ON public.archives FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write access to feedbacks" ON public.feedbacks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write access to login_logs" ON public.login_logs FOR ALL USING (true) WITH CHECK (true);

-- Notifikasi Sukses
COMMENT ON TABLE public.teachers IS 'Data Pegawai & Guru SD-IT QA untuk PayEdu App';
