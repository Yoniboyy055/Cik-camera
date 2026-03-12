import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database('cik_proof.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    role TEXT,
    password TEXT
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT
  );

  CREATE TABLE IF NOT EXISTS task_templates (
    id TEXT PRIMARY KEY,
    name TEXT,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS task_template_requirements (
    id TEXT PRIMARY KEY,
    task_template_id TEXT,
    label TEXT,
    capture_type TEXT,
    required_order INTEGER,
    is_required INTEGER DEFAULT 1,
    FOREIGN KEY(task_template_id) REFERENCES task_templates(id)
  );

  CREATE TABLE IF NOT EXISTS capture_packages (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    project_id TEXT,
    task_template_id TEXT,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(task_template_id) REFERENCES task_templates(id)
  );

  CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY,
    package_id TEXT,
    requirement_id TEXT,
    user_id TEXT,
    project_id TEXT,
    note TEXT,
    measurement TEXT,
    unit TEXT,
    latitude REAL,
    longitude REAL,
    address TEXT,
    photo_url TEXT,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(package_id) REFERENCES capture_packages(id),
    FOREIGN KEY(requirement_id) REFERENCES task_template_requirements(id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
  );

  INSERT OR IGNORE INTO users (id, name, email, role, password) VALUES 
    ('u1', 'John Worker', 'worker@cik.com', 'worker', 'password'),
    ('u2', 'Jane Supervisor', 'supervisor@cik.com', 'supervisor', 'password');

  INSERT OR IGNORE INTO projects (id, name) VALUES 
    ('p1', 'Downtown Excavation'),
    ('p2', 'Highway 401 Repair');

  INSERT OR IGNORE INTO task_templates (id, name) VALUES 
    ('temp1', 'Pipe Installation'),
    ('temp2', 'Trench Depth Verification'),
    ('temp3', 'Hydrovac Daylighting'),
    ('temp4', 'Restoration Complete'),
    ('temp5', 'Site Incident Report');

  INSERT OR IGNORE INTO task_template_requirements (id, task_template_id, label, capture_type, required_order) VALUES 
    ('req1', 'temp1', 'Wide trench context', 'wide', 1),
    ('req2', 'temp1', 'Tape depth proof', 'measurement', 2),
    ('req3', 'temp1', 'Pipe/conduit visible', 'detail', 3),
    ('req4', 'temp1', 'Backfill stage', 'detail', 4),
    ('req5', 'temp1', 'Final restored surface', 'wide', 5),
    
    ('req6', 'temp2', 'Trench overview', 'wide', 1),
    ('req7', 'temp2', 'Tape measurement (depth)', 'measurement', 2),
    ('req8', 'temp2', 'Utility markings visible', 'detail', 3),
    
    ('req9', 'temp5', 'Incident overview', 'wide', 1),
    ('req10', 'temp5', 'Close-up of issue', 'detail', 2),
    ('req11', 'temp5', 'Safety measures in place', 'detail', 3);
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }
  app.use('/uploads', express.static(uploadsDir));

  // API Routes
  app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE email = ? AND password = ?').get(email, password);
    if (user) {
      res.json({ user });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  app.get('/api/projects', (req, res) => {
    const projects = db.prepare('SELECT * FROM projects').all();
    res.json(projects);
  });

  app.get('/api/task-templates', (req, res) => {
    const templates = db.prepare('SELECT * FROM task_templates WHERE active = 1').all();
    res.json(templates);
  });

  app.get('/api/task-templates/:id/requirements', (req, res) => {
    const { id } = req.params;
    const requirements = db.prepare('SELECT * FROM task_template_requirements WHERE task_template_id = ? ORDER BY required_order ASC').all(id);
    res.json(requirements);
  });

  app.post('/api/capture-packages', (req, res) => {
    const { user_id, project_id, task_template_id } = req.body;
    const id = uuidv4();
    db.prepare('INSERT INTO capture_packages (id, user_id, project_id, task_template_id, status) VALUES (?, ?, ?, ?, ?)')
      .run(id, user_id, project_id, task_template_id, 'in_progress');
    res.json({ id });
  });

  app.post('/api/captures', (req, res) => {
    const { user_id, project_id, package_id, requirement_id, note, measurement, unit, latitude, longitude, address, photo_data } = req.body;
    
    const id = uuidv4();
    let photo_url = '';

    if (photo_data) {
      const base64Data = photo_data.replace(/^data:image\/\w+;base64,/, "");
      const filename = `${id}.jpg`;
      const filepath = path.join(uploadsDir, filename);
      fs.writeFileSync(filepath, base64Data, 'base64');
      photo_url = `/uploads/${filename}`;
    }

    const stmt = db.prepare(`
      INSERT INTO captures (id, package_id, requirement_id, user_id, project_id, note, measurement, unit, latitude, longitude, address, photo_url, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded')
    `);
    
    stmt.run(id, package_id, requirement_id, user_id, project_id, note, measurement, unit, latitude, longitude, address, photo_url);
    
    res.json({ success: true, id });
  });

  app.get('/api/captures', (req, res) => {
    const captures = db.prepare(`
      SELECT c.*, u.name as user_name, p.name as project_name, r.label as requirement_label, tt.name as template_name
      FROM captures c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN projects p ON c.project_id = p.id
      LEFT JOIN task_template_requirements r ON c.requirement_id = r.id
      LEFT JOIN capture_packages cp ON c.package_id = cp.id
      LEFT JOIN task_templates tt ON cp.task_template_id = tt.id
      ORDER BY c.created_at DESC
    `).all();
    res.json(captures);
  });

  app.patch('/api/captures/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    db.prepare('UPDATE captures SET status = ? WHERE id = ?').run(status, id);
    res.json({ success: true });
  });

  app.patch('/api/packages/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    db.prepare('UPDATE capture_packages SET status = ? WHERE id = ?').run(status, id);
    // Also update all captures in this package
    db.prepare('UPDATE captures SET status = ? WHERE package_id = ?').run(status, id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
