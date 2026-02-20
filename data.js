/* ==========================================
   DATA LAYER - Supabase Integration
   ========================================== */

const STAGE_DEFINITIONS = [
  { key: 'negotiation', name: 'Negociação', color: '#f59e0b', icon: '🤝', order: 0, business_days: null },
  { key: 'kickoff', name: 'Kick-off', color: '#f97316', icon: '🚀', order: 1, business_days: 5 },
  { key: 'copywriter', name: 'Copywriter', color: '#ec4899', icon: '✍️', order: 2, business_days: 15, optional: true },
  { key: 'design', name: 'Design', color: '#8b5cf6', icon: '🎨', order: 3, business_days: 25 },
  { key: 'development', name: 'Desenvolvimento', color: '#3b82f6', icon: '💻', order: 4, business_days: 20 },
  { key: 'golive', name: 'Go-live', color: '#10b981', icon: '🌐', order: 5, business_days: 7 }
];

// Utility: add N business days (Mon–Fri) to a Date, returns new Date
function addBusinessDays(startDate, days) {
  const date = new Date(startDate);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) added++; // skip Sun(0) and Sat(6)
  }
  return date;
}

// Utility: count business days between two dates (inclusive start, inclusive end)
function countBusinessDays(start, end) {
  const s = new Date(start), e = new Date(end);
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Format date string (YYYY-MM-DD) to Date object, then to ISO yyyy-mm-dd
function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

const STATUS_LABELS = {
  active: 'Ativo', completed: 'Concluído', paused: 'Pausado', cancelled: 'Cancelado',
  pending: 'Pendente', in_progress: 'Em Andamento', skipped: 'Pulado'
};

const PRIORITY_LABELS = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' };

// Supabase config stored in localStorage
// Supabase config stored in localStorage (Encrypted)
function getSupabaseConfig() {
  const enc = localStorage.getItem('supabase_vault');
  if (enc) return SecurityStore.decrypt(enc);

  // Migration from plaintext
  const legacy = localStorage.getItem('supabase_config');
  if (legacy) {
    try {
      const data = JSON.parse(legacy);
      saveSupabaseConfig(data.url, data.key);
      localStorage.removeItem('supabase_config');
      return data;
    } catch (e) { return null; }
  }
  return null;
}

function saveSupabaseConfig(url, key) {
  const encrypted = SecurityStore.encrypt({ url, key });
  localStorage.setItem('supabase_vault', encrypted);
}

let supabaseClient = null;

function initSupabase() {
  const cfg = getSupabaseConfig();
  if (!cfg) return false;
  try {
    supabaseClient = supabase.createClient(cfg.url, cfg.key);
    return true;
  } catch (e) {
    console.error('Supabase init error:', e);
    return false;
  }
}

function sb() {
  if (!supabaseClient) initSupabase();
  return supabaseClient;
}

// --- PERSONAS ---
const PersonaStore = {
  async getAll() {
    const { data, error } = await sb().from('personas').select('*').order('name');
    if (error) throw error;
    return data || [];
  },
  async getById(id) {
    const { data, error } = await sb().from('personas').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },
  async create(persona) {
    const { data, error } = await sb().from('personas').insert(persona).select().single();
    if (error) throw error;
    return data;
  },
  async update(id, updates) {
    const { data, error } = await sb().from('personas').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async delete(id) {
    const { error } = await sb().from('personas').delete().eq('id', id);
    if (error) throw error;
  }
};

// --- PROJECTS ---
const ProjectStore = {
  async getAll() {
    const { data, error } = await sb().from('projects').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async getById(id) {
    const { data, error } = await sb().from('projects').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },
  async create(project) {
    const { data, error } = await sb().from('projects').insert(project).select().single();
    if (error) throw error;
    return data;
  },
  async update(id, updates) {
    const { data, error } = await sb().from('projects').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async delete(id) {
    const { error } = await sb().from('projects').delete().eq('id', id);
    if (error) throw error;
  },
  async getWithStages() {
    const projects = await this.getAll();
    const stages = await StageStore.getAll();
    const personas = await PersonaStore.getAll();
    const personaMap = {};
    personas.forEach(p => personaMap[p.id] = p);
    return projects.map(proj => ({
      ...proj,
      stages: stages
        .filter(s => s.project_id === proj.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(s => ({ ...s, persona: s.assigned_persona_id ? personaMap[s.assigned_persona_id] : null }))
    }));
  }
};

// --- STAGES ---
const StageStore = {
  async getAll() {
    const { data, error } = await sb().from('project_stages').select('*').order('sort_order');
    if (error) throw error;
    return data || [];
  },
  async getByProject(projectId) {
    const { data, error } = await sb().from('project_stages').select('*').eq('project_id', projectId).order('sort_order');
    if (error) throw error;
    return data || [];
  },
  async create(stage) {
    const { data, error } = await sb().from('project_stages').insert(stage).select().single();
    if (error) throw error;
    return data;
  },
  async update(id, updates) {
    const { data, error } = await sb().from('project_stages').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async createBatch(stages) {
    const { data, error } = await sb().from('project_stages').insert(stages).select();
    if (error) throw error;
    return data;
  },
  async delete(id) {
    const { error } = await sb().from('project_stages').delete().eq('id', id);
    if (error) throw error;
  }
};

// --- ALERTS ---
const AlertStore = {
  async getAll() {
    const { data, error } = await sb().from('alerts').select('*').order('alert_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async getActive() {
    const { data, error } = await sb().from('alerts').select('*').eq('dismissed', false).order('alert_date');
    if (error) throw error;
    return data || [];
  },
  async create(alert) {
    const { data, error } = await sb().from('alerts').insert(alert).select().single();
    if (error) throw error;
    return data;
  },
  async dismiss(id) {
    const { data, error } = await sb().from('alerts').update({ dismissed: true }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async dismissAll() {
    const { error } = await sb().from('alerts').update({ dismissed: true }).eq('dismissed', false);
    if (error) throw error;
  },
  async delete(id) {
    const { error } = await sb().from('alerts').delete().eq('id', id);
    if (error) throw error;
  },
  async generateAlerts(projects) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newAlerts = [];

    for (const proj of projects) {
      if (proj.status !== 'active') continue;
      for (const stage of (proj.stages || [])) {
        if (stage.status === 'completed' || stage.status === 'skipped' || !stage.deadline) continue;
        const deadline = new Date(stage.deadline + 'T00:00:00');
        const daysUntil = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
        const stageDef = STAGE_DEFINITIONS.find(s => s.key === stage.stage_key);
        const stageName = stageDef ? stageDef.name : stage.stage_key;

        if (daysUntil < 0) {
          newAlerts.push({
            project_id: proj.id,
            stage_key: stage.stage_key,
            type: 'overdue',
            message: `${proj.name}: etapa "${stageName}" está ${Math.abs(daysUntil)} dia(s) atrasada!`,
            alert_date: today.toISOString().split('T')[0]
          });
        } else if (daysUntil <= 3) {
          newAlerts.push({
            project_id: proj.id,
            stage_key: stage.stage_key,
            type: 'deadline_warning',
            message: `${proj.name}: etapa "${stageName}" vence em ${daysUntil} dia(s).`,
            alert_date: today.toISOString().split('T')[0]
          });
        }
      }
    }

    // Dismiss previous active alerts of these types to ensure we only show the latest status
    await sb().from('alerts').update({ dismissed: true }).eq('dismissed', false).in('type', ['overdue', 'deadline_warning']);

    if (newAlerts.length > 0) {
      await sb().from('alerts').insert(newAlerts);
    }
    return newAlerts;
  }
};

// --- HELPERS ---
function getStageDefinition(key) {
  return STAGE_DEFINITIONS.find(s => s.key === key);
}

function getProjectProgress(stages) {
  if (!stages || stages.length === 0) return 0;
  const countable = stages.filter(s => s.status !== 'skipped');
  if (countable.length === 0) return 100;
  const completed = countable.filter(s => s.status === 'completed').length;
  return Math.round((completed / countable.length) * 100);
}

function getCurrentStage(stages) {
  if (!stages) return null;
  const inProgress = stages.find(s => s.status === 'in_progress');
  if (inProgress) return inProgress;
  const pending = stages.filter(s => s.status === 'pending').sort((a, b) => a.sort_order - b.sort_order);
  return pending.length > 0 ? pending[0] : null;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysUntilDeadline(deadlineStr) {
  if (!deadlineStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const deadline = new Date(deadlineStr + 'T00:00:00');
  return Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
}

function daysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  const a = new Date(d1 + 'T00:00:00');
  const b = new Date(d2 + 'T00:00:00');
  return Math.ceil((b - a) / (1000 * 60 * 60 * 24));
}

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/* --- SYSTEM SETTINGS --- */
const SystemStore = {
  defaults: {
    name: 'Gestão de Projetos',
    subtitle: 'Gerenciador de Sites',
    logoType: 'icon', // 'icon', 'url', or 'upload'
    logoUrl: '',
    logoIcon: 'G',
    logoUploadData: null,  // public URL mirrored from Supabase Storage
    logoUploadPath: null,  // storage file path for deletion
    primaryColor: '#8b5cf6',
    secondaryColor: '#06b6d4',
    theme: 'dark'
  },

  get() {
    const s = localStorage.getItem('system_settings');
    return s ? { ...this.defaults, ...JSON.parse(s) } : this.defaults;
  },

  save(settings) {
    localStorage.setItem('system_settings', JSON.stringify(settings));
    return settings;
  }
};

/* --- APP SETTINGS (Supabase-backed key/value) --- */
const AppSettingsStore = {
  async get(key) {
    try {
      const { data, error } = await sb().from('app_settings').select('value').eq('key', key).single();
      if (error || !data) return null;
      return data.value;
    } catch (e) { return null; }
  },
  async set(key, value) {
    const { error } = await sb().from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
  }
};

/* --- LOGO STORAGE (Supabase Storage bucket: app-logos) --- */
const LogoStore = {
  BUCKET: 'app-logos',

  async upload(file) {
    // Get old path to delete after successful upload
    const sys = SystemStore.get();
    const oldPath = sys.logoUploadPath || null;

    // Unique filename
    const ext = file.name.split('.').pop().toLowerCase();
    const fileName = `logo-${Date.now()}.${ext}`;

    // Upload new file
    const { error: upErr } = await sb().storage
      .from(this.BUCKET)
      .upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (upErr) throw upErr;

    // Get public URL
    const { data: { publicUrl } } = sb().storage.from(this.BUCKET).getPublicUrl(fileName);

    // Delete old file (best-effort, don't block on failure)
    if (oldPath) {
      sb().storage.from(this.BUCKET).remove([oldPath]).catch(() => { });
    }

    return { url: publicUrl, path: fileName };
  }
};

/* --- SECURITY --- */
const SecurityStore = {
  SALT: 'pjt-mgr-s3cur1ty-',

  // PIN
  async setPin(pin) {
    if (!pin) { localStorage.removeItem('app_pin'); return; }
    const hash = await this._hash(pin);
    localStorage.setItem('app_pin', hash);
  },

  async checkPin(pin) {
    const stored = localStorage.getItem('app_pin');
    if (!stored) return true;
    const hash = await this._hash(pin);
    return hash === stored;
  },

  hasPin() {
    return !!localStorage.getItem('app_pin');
  },

  // Encryption (Obfuscation)
  encrypt(data) {
    try {
      const str = JSON.stringify(data);
      return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
          return String.fromCharCode('0x' + p1);
        }));
    } catch (e) { console.error('Encrypt error', e); return null; }
  },

  decrypt(ciphertext) {
    try {
      const str = decodeURIComponent(atob(ciphertext).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(str);
    } catch (e) { return null; }
  },

  async _hash(str) {
    const msgBuffer = new TextEncoder().encode(str + this.SALT);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
};

/* --- ACTIVITY LOG --- */
const LogStore = {
  add(action, details, projectId = null) {
    const log = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      date: new Date().toISOString(),
      action,
      details,
      projectId
    };
    const logs = this.getAll();
    logs.unshift(log);
    if (logs.length > 100) logs.pop(); // Keep last 100
    localStorage.setItem('activity_log', JSON.stringify(logs));
    return log;
  },

  getAll() {
    return JSON.parse(localStorage.getItem('activity_log') || '[]');
  },

  clear() {
    localStorage.removeItem('activity_log');
  }
};
