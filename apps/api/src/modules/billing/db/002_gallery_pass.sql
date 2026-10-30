alter table proof_projects add column if not exists uses_gallery_pass boolean not null default false;
create index if not exists proof_projects_active_pass on proof_projects(owner_id) where archived_at is null and uses_gallery_pass;
