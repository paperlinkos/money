alter table proof_projects add column if not exists protected_preview boolean not null default false;
alter table proof_projects add column if not exists watermark_text text;
alter table proof_projects add column if not exists originals_released_at timestamptz;
alter table proof_versions add column if not exists preview_storage_name text unique;
alter table proof_versions add column if not exists preview_watermark text;
