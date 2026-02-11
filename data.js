/* ==========================================
   DATA LAYER - Supabase Integration
   ========================================== */

const STAGE_DEFINITIONS = [
  { key: 'negotiation', name: 'Negociação', color: '#f59e0b', icon: '🤝', order: 0 },
  { key: 'kickoff', name: 'Kick-off', color: '#f97316', icon: '🚀', order: 1 },
  { key: 'copywriter', name: 'Copywriter', color: '#ec4899', icon: '✍️', order: 2, optional: true },
  { key: 'design', name: 'Design', color: '#8b5cf6', icon: '🎨', order: 3 },
  { key: 'development', name: 'Desenvolvimento', color: '#3b82f6', icon: '💻', order: 4 },
  { key: 'golive', name: 'Go-live', color: '#10b981', icon: '🌐', order: 5 }
];

const STATUS_LABELS = {
  active: 'Ativo', completed: 'Concluído', paused: 'Pausado', cancelled: 'Cancelado',
  pending: 'Pendente', in_progress: 'Em Andamento', skipped: 'Pulado'
};

const PRIORITY_LABELS = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' };

// Supabase config stored in localStorage
function getSupabaseConfig() {
  const cfg = localStorage.getItem('supabase_config');
  return cfg ? JSON.parse(cfg) : null;
}

function saveSupabaseConfig(url, key) {
  localStorage.setItem('supabase_config', JSON.stringify({ url, key }));
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
        const stageDef = STAGE_DEFINITIONS.find(s => s.key === stage.stage_key);
        const stageName = stageDef ? stageDef.name : stage.stage_key;

        // 1. Check Deadline (pending/in_progress)
        if ((stage.status === 'pending' || stage.status === 'in_progress') && stage.deadline) {
          const deadline = new Date(stage.deadline + 'T00:00:00');
          const daysUntil = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

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

        // 2. Check Client Delay
        if (stage.client_review_start && !stage.client_review_end) {
          const start = new Date(stage.client_review_start + 'T00:00:00');
          const daysInReview = Math.floor((today - start) / (1000 * 60 * 60 * 24));
          if (daysInReview > 2) {
            newAlerts.push({
              project_id: proj.id,
              stage_key: stage.stage_key,
              type: 'client_delay',
              message: `${proj.name}: etapa "${stageName}" aguarda cliente há ${daysInReview} dias.`,
              alert_date: today.toISOString().split('T')[0]
            });
          }
        }
      }
    }

    // Clear old auto-generated alerts for today and re-create
    const todayStr = today.toISOString().split('T')[0];
    await sb().from('alerts').delete().eq('alert_date', todayStr).in('type', ['overdue', 'deadline_warning', 'client_delay']);
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
