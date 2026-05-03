-- ═══════════════════════════════════════════════════════
-- OutboundAI — Complete Database Schema
-- Run this once in Supabase Dashboard → SQL Editor.
-- Every statement uses IF NOT EXISTS / IF NOT EXISTS guards
-- so it is safe to re-run.
-- ═══════════════════════════════════════════════════════

-- ── Appointments ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL,
    date        TEXT NOT NULL,
    time        TEXT NOT NULL,
    service     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'booked',
    created_at  TEXT NOT NULL
);

-- ── Call logs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_logs (
    id                TEXT PRIMARY KEY,
    phone_number      TEXT NOT NULL,
    lead_name         TEXT,
    outcome           TEXT,
    reason            TEXT,
    duration_seconds  INTEGER,
    timestamp         TEXT NOT NULL
);

-- ── Settings (key/value store) ──────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- ── Error logs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS error_logs (
    id         TEXT PRIMARY KEY,
    source     TEXT NOT NULL,
    level      TEXT NOT NULL DEFAULT 'error',
    message    TEXT NOT NULL,
    detail     TEXT,
    timestamp  TEXT NOT NULL
);

-- Disable RLS for the service-role-only tables above
ALTER TABLE appointments DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs    DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings     DISABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs   DISABLE ROW LEVEL SECURITY;

-- Add later columns to call_logs
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS notes         TEXT;

-- ── Campaigns ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'active',
    contacts_json       TEXT NOT NULL DEFAULT '[]',
    schedule_type       TEXT NOT NULL DEFAULT 'once',
    schedule_time       TEXT DEFAULT '09:00',
    call_delay_seconds  INTEGER DEFAULT 3,
    system_prompt       TEXT,
    created_at          TEXT NOT NULL,
    last_run_at         TEXT,
    total_dispatched    INTEGER DEFAULT 0,
    total_failed        INTEGER DEFAULT 0
);
ALTER TABLE campaigns DISABLE ROW LEVEL SECURITY;

-- Cal.com booking link on appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS calcom_booking_uid TEXT;

-- ── Per-contact memory (AI-extracted insights) ─────────
CREATE TABLE IF NOT EXISTS contact_memory (
    id            TEXT PRIMARY KEY,
    phone_number  TEXT NOT NULL,
    insight       TEXT NOT NULL,
    created_at    TEXT NOT NULL
);
ALTER TABLE contact_memory DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_contact_memory_phone
    ON contact_memory (phone_number);

-- Link campaigns -> agent profile
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS agent_profile_id TEXT;

-- ── Agent profiles (named voice + model + prompt + tools) ──
CREATE TABLE IF NOT EXISTS agent_profiles (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    voice          TEXT NOT NULL DEFAULT 'Aoede',
    model          TEXT NOT NULL DEFAULT 'gemini-3.1-flash-live-preview',
    system_prompt  TEXT,
    enabled_tools  TEXT DEFAULT '[]',
    is_default     INTEGER DEFAULT 0,
    created_at     TEXT NOT NULL
);
ALTER TABLE agent_profiles DISABLE ROW LEVEL SECURITY;
