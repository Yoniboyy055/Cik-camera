create table if not exists users (
  id text primary key,
  name text,
  email text unique,
  role text,
  password text,
  created_at timestamptz default now()
);

create table if not exists projects (
  id text primary key,
  name text
);

create table if not exists task_templates (
  id text primary key,
  name text,
  active boolean default true
);

create table if not exists task_template_requirements (
  id text primary key,
  task_template_id text references task_templates(id),
  label text,
  capture_type text,
  required_order integer,
  is_required boolean default true
);

create table if not exists capture_packages (
  id text primary key,
  user_id text references users(id),
  project_id text references projects(id),
  task_template_id text references task_templates(id),
  status text,
  created_at timestamptz default now()
);

create table if not exists captures (
  id text primary key,
  package_id text references capture_packages(id),
  requirement_id text references task_template_requirements(id),
  user_id text references users(id),
  project_id text references projects(id),
  note text,
  measurement text,
  unit text,
  latitude double precision,
  longitude double precision,
  gps_accuracy_m double precision,
  altitude_m double precision,
  address text,
  evidence_sha256 text,
  capture_source text default 'worker',
  photo_url text,
  custom_project_name text,
  custom_task_text text,
  status text,
  created_at timestamptz default now()
);

insert into users (id, name, email, role, password)
values
  ('u1', 'Jordan Worker', 'worker1@grandproof.local', 'worker', 'password'),
  ('u2', 'Sam Supervisor', 'supervisor1@grandproof.local', 'supervisor', 'password')
on conflict (id) do nothing;

insert into projects (id, name)
values
  ('p1', 'Downtown Fibre Upgrade'),
  ('p2', 'North Corridor Inspection'),
  ('p3', 'Utility Trench Verification'),
  ('p4', 'Emergency Line Repair'),
  ('p5', 'Commercial Cable Run')
on conflict (id) do nothing;

insert into task_templates (id, name, active)
values
  ('temp1', 'Fibre Cable Installation', true),
  ('temp2', 'Conduit Run Verification', true),
  ('temp3', 'Trench Depth Check', true),
  ('temp4', 'Site Restoration Complete', true),
  ('temp5', 'Incident Documentation', true),
  ('temp6', 'Equipment Inspection', true),
  ('temp7', 'Emergency Repair Verification', true),
  ('temp8', 'Aerial Strand & Lash', true)
on conflict (id) do nothing;

insert into task_template_requirements (id, task_template_id, label, capture_type, required_order, is_required)
values
  ('req1', 'temp1', 'Route context overview', 'wide', 1, true),
  ('req2', 'temp1', 'Conduit or cable placement detail', 'detail', 2, true),
  ('req3', 'temp1', 'Measurement confirmation', 'measurement', 3, true),
  ('req4', 'temp2', 'Conduit run entry point', 'detail', 1, true),
  ('req5', 'temp2', 'Conduit run midpoint check', 'detail', 2, true),
  ('req6', 'temp3', 'Trench overview', 'wide', 1, true),
  ('req7', 'temp3', 'Depth measurement proof', 'measurement', 2, true),
  ('req8', 'temp4', 'Post-restoration wide shot', 'wide', 1, true),
  ('req9', 'temp5', 'Incident area overview', 'wide', 1, true),
  ('req10', 'temp5', 'Close-up evidence photo', 'detail', 2, true),
  ('req11', 'temp7', 'Repair before state', 'detail', 1, true),
  ('req12', 'temp7', 'Repair after state', 'detail', 2, true)
on conflict (id) do nothing;

-- Run once in Supabase SQL editor before production use:
-- insert into storage.buckets (id, name, public) values ('captures', 'captures', true)
-- on conflict (id) do nothing;
