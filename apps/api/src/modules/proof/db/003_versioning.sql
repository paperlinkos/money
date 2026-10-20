create index if not exists proof_versions_deliverable_number on proof_versions(deliverable_id, version_number desc);
create index if not exists proof_approvals_project_version on proof_approvals(project_id, deliverable_id, version_id);
