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
  address text,
  photo_url text,
  status text,
  created_at timestamptz default now()
);

insert into users (id, name, email, role, password)
values
  ('u1', 'John Worker', 'worker@cik.com', 'worker', 'password'),
  ('u2', 'Jane Supervisor', 'supervisor@cik.com', 'supervisor', 'password')
on conflict (id) do nothing;

insert into projects (id, name)
values
  ('p1', 'Downtown Excavation'),
  ('p2', 'Highway 401 Repair')
on conflict (id) do nothing;

insert into task_templates (id, name, active)
values
  ('temp1', 'Pipe Installation', true),
  ('temp2', 'Trench Depth Verification', true),
  ('temp3', 'Hydrovac Daylighting', true),
  ('temp4', 'Restoration Complete', true),
  ('temp5', 'Site Incident Report', true)
on conflict (id) do nothing;

insert into task_template_requirements (id, task_template_id, label, capture_type, required_order, is_required)
values
  ('req1', 'temp1', 'Wide trench context', 'wide', 1, true),
  ('req2', 'temp1', 'Tape depth proof', 'measurement', 2, true),
  ('req3', 'temp1', 'Pipe/conduit visible', 'detail', 3, true),
  ('req4', 'temp1', 'Backfill stage', 'detail', 4, true),
  ('req5', 'temp1', 'Final restored surface', 'wide', 5, true),
  ('req6', 'temp2', 'Trench overview', 'wide', 1, true),
  ('req7', 'temp2', 'Tape measurement (depth)', 'measurement', 2, true),
  ('req8', 'temp2', 'Utility markings visible', 'detail', 3, true),
  ('req9', 'temp5', 'Incident overview', 'wide', 1, true),
  ('req10', 'temp5', 'Close-up of issue', 'detail', 2, true),
  ('req11', 'temp5', 'Safety measures in place', 'detail', 3, true)
on conflict (id) do nothing;

-- Run once in Supabase SQL editor before production use:
-- insert into storage.buckets (id, name, public) values ('captures', 'captures', true)
-- on conflict (id) do nothing;
