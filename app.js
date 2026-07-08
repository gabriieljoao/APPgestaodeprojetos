/* ==========================================
   MAIN APPLICATION - Router & Pages
   ========================================== */

const App = {
  currentRoute: '/',
  cache: { projects: [], personas: [], alerts: [], _ts: 0, systemSettings: null },
  CACHE_TTL: 30000,

  applySystemSettings() {
    const s = SystemStore.get();
    document.title = s.name + (s.subtitle ? ` | ${s.subtitle}` : '');
    const root = document.documentElement;
    root.style.setProperty('--accent-violet', s.primaryColor);
    root.style.setProperty('--accent-cyan', s.secondaryColor);
    root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${s.primaryColor}, ${s.secondaryColor})`);

    // Also update hover gradient for buttons
    // Simple approach: same gradient but relies on CSS filter brightness

    if (s.theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
    this.cache.systemSettings = s;
  },

  async init() {
    this.applySystemSettings();
    window.addEventListener('hashchange', () => this.route());
    if (!initSupabase()) {
      this.renderSetup();
      return;
    }
    await this.route();
  },

  navigate(path) {
    window.location.hash = '#' + path;
  },

  async route() {
    const hash = window.location.hash.slice(1) || '/';
    this.currentRoute = hash;
    try {
      if (hash === '/') await this.pageDashboard();
      else if (hash === '/projects') await this.pageProjects();
      else if (hash.startsWith('/projects/')) await this.pageProjectDetail(hash.split('/projects/')[1]);
      else if (hash === '/personas') await this.pagePersonas();
      else if (hash === '/analytics') await this.pageAnalytics();
      else if (hash === '/templates') this.pageTemplates();
      else if (hash === '/activity-log') await this.pageActivityLog();
      else if (hash === '/settings') this.pageSettings();
      else await this.pageDashboard();
    } catch (err) {
      console.error('Route error:', err);
      document.getElementById('app').innerHTML = `<div class="setup-screen"><div class="setup-card"><h2>Erro</h2><p>${err.message}</p><div style="display:flex;gap:8px;justify-content:center;margin-top:16px"><button class="btn btn-primary" onclick="App.navigate('/')">Tentar Novamente</button><button class="btn btn-secondary" onclick="localStorage.removeItem('supabase_vault'); localStorage.removeItem('supabase_config'); window.location.reload()">Resetar Conexão</button></div></div></div>`;
    }
  },

  async loadData(force = false) {
    const now = Date.now();
    if (!force && this.cache._ts && (now - this.cache._ts < this.CACHE_TTL)) {
      return this.cache;
    }
    const [projects, personas, alerts] = await Promise.all([
      ProjectStore.getWithStages(),
      PersonaStore.getAll(),
      AlertStore.getActive()
    ]);
    this.cache = { projects, personas, alerts, _ts: Date.now() };
    return this.cache;
  },

  invalidateCache() {
    this.cache._ts = 0;
  },

  renderLayout(pageTitle, content, headerActions = '') {
    const alertCount = this.cache.alerts?.length || 0;
    document.getElementById('app').innerHTML = `
      <div class="app-layout">
        ${UI.renderSidebar(this.currentRoute, alertCount, this.cache.systemSettings, LogStore.getAll(), this.cache.projects || [])}
        <div class="main-area">
          <div class="main-header">
            <div style="display:flex;align-items:center;gap:12px">
              <button class="btn btn-ghost btn-icon mobile-menu-btn" onclick="document.getElementById('sidebar').classList.add('open')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              </button>
              <h2>${pageTitle}</h2>
            </div>
            <div class="header-actions">
              ${headerActions}
              <div class="notif-bell-wrapper" style="position:relative">
                <button class="btn btn-ghost btn-icon" onclick="App.toggleNotifications()" title="Notificações">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                  ${alertCount > 0 ? `<span class="notif-badge">${alertCount}</span>` : ''}
                </button>
                <div class="notif-dropdown" id="notif-dropdown"></div>
              </div>
            </div>
          </div>
          <div class="main-content" id="page-content">${content}</div>
        </div>
      </div>`;
    setTimeout(() => UI.initSidebarTooltips(), 0);
  },

  renderLayoutFast(pageTitle, headerActions = '') {
    const alertCount = this.cache.alerts?.length || 0;
    document.getElementById('app').innerHTML = `
      <div class="app-layout">
        ${UI.renderSidebar(this.currentRoute, alertCount, this.cache.systemSettings, LogStore.getAll(), this.cache.projects || [])}
        <div class="main-area">
          <div class="main-header">
            <div style="display:flex;align-items:center;gap:12px">
              <button class="btn btn-ghost btn-icon mobile-menu-btn" onclick="document.getElementById('sidebar').classList.add('open')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              </button>
              <h2>${pageTitle}</h2>
            </div>
            <div class="header-actions">
              ${headerActions}
              <div class="notif-bell-wrapper" style="position:relative">
                <button class="btn btn-ghost btn-icon" onclick="App.toggleNotifications()" title="Notificações">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                  ${alertCount > 0 ? `<span class="notif-badge">${alertCount}</span>` : ''}
                </button>
                <div class="notif-dropdown" id="notif-dropdown"></div>
              </div>
            </div>
          </div>
          <div class="main-content" id="page-content"><div class="loading-spinner"></div></div>
        </div>
      </div>`;
    setTimeout(() => UI.initSidebarTooltips(), 0);
  },

  updateSidebar() {
    const logs = LogStore.getAll();
    // Cache might be partial or full. We try to use what we have.
    const projects = this.cache.projects || [];
    const alerts = this.cache.alerts || [];
    const settings = this.cache.settings || null;

    // We need to preserve collapsed state logic which is in renderSidebar
    // UI.renderSidebar now accepts logs and projects
    const sidebarHtml = UI.renderSidebar(window.location.hash.slice(1) || '/', alerts.length, settings, logs, projects);

    // Replace sidebar element
    const app = document.getElementById('app');
    const existing = document.getElementById('sidebar');
    if (existing && app) {
      // We need to be careful not to break layout. Sidebar is inside .app-layout normally.
      const temp = document.createElement('div');
      temp.innerHTML = sidebarHtml;
      const newSidebar = temp.firstElementChild;
      existing.replaceWith(newSidebar);
      UI.initSidebarTooltips();
    }
  },

  setContent(html) {
    const el = document.getElementById('page-content');
    if (el) el.innerHTML = html;
  },

  // ========== SETUP PAGE ==========
  renderSetup() {
    document.getElementById('app').innerHTML = `
    <div class="setup-screen">
      <div class="setup-card">
        <div class="setup-logo">G</div>
        <h2>Bem-vindo!</h2>
        <p>Configure a conexão com o Supabase para começar</p>
        <div class="form-group"><label class="form-label">Supabase URL</label><input type="text" class="form-input" id="setup-url" placeholder="https://xxxxx.supabase.co"></div>
        <div class="form-group"><label class="form-label">Anon Key</label><input type="text" class="form-input" id="setup-key" placeholder="eyJhbGciOiJI..."></div>
        <button class="btn btn-primary w-full mt-16" onclick="App.saveSetup()">Conectar</button>
        <p style="font-size:11px;color:var(--text-muted);margin-top:16px">Cole a URL e a chave anônima do seu projeto Supabase.</p>
      </div>
    </div>`;
  },

  async saveSetup() {
    const url = document.getElementById('setup-url').value.trim();
    const key = document.getElementById('setup-key').value.trim();
    if (!url || !key) return UI.toast('Preencha todos os campos', 'warning');
    saveSupabaseConfig(url, key);
    if (initSupabase()) {
      try {
        await PersonaStore.getAll();
        UI.toast('Conectado com sucesso!', 'success');
        this.navigate('/');
      } catch (e) {
        UI.toast('Erro ao conectar. Verifique as credenciais e o SQL.', 'error');
        localStorage.removeItem('supabase_config');
        localStorage.removeItem('supabase_vault');
      }
    }
  },

  // ========== DASHBOARD (Tabbed: Kanban | Timeline) ==========
  _dashboardTab: 'kanban',

  async pageDashboard() {
    this.renderLayoutFast('Dashboard', `<button class="btn btn-primary" onclick="App.openNewProject()">+ Novo Projeto</button>`);
    const { projects, personas, alerts } = await this.loadData();

    // Update sidebar with loaded projects (for activity log names)
    this.updateSidebar();

    // Generate alerts in background
    AlertStore.generateAlerts(projects).then(async () => {
      const fresh = await AlertStore.getActive();
      this.cache.alerts = fresh;
      const badge = document.querySelector('.nav-badge');
      if (badge && fresh.length > 0) badge.textContent = fresh.length;
      // Also update sidebar to reflect alert count
      this.updateSidebar();
    }).catch(() => { });

    this.setContent(`
      <div class="animate-fade">
        <div class="dash-tabs">
          <button class="dash-tab ${this._dashboardTab === 'kanban' ? 'active' : ''}" onclick="App.switchDashboardTab('kanban')">📋 Kanban</button>
          <button class="dash-tab ${this._dashboardTab === 'timeline' ? 'active' : ''}" onclick="App.switchDashboardTab('timeline')">🗓️ Timeline</button>
        </div>
        <div id="dash-view">
          ${this._dashboardTab === 'kanban' ? this._renderKanban(projects) : this._renderGanttTimeline(projects)}
        </div>
      </div>
    `);
  },

  async openProjectActivity(projectId) {
    if (!projectId) return;
    const { projects } = await this.loadData();
    const project = projects.find(p => p.id === projectId);

    if (!project) return UI.toast('Projeto não encontrado', 'error');

    const logs = LogStore.getAll().filter(l => l.projectId === projectId);

    const content = `
      <div style="max-height:60vh;overflow-y:auto;margin-top:16px">
        ${logs.length > 0 ? logs.map(l => `
          <div style="padding:12px;border-bottom:1px solid var(--border);margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;color:var(--text-muted);font-size:12px;margin-bottom:4px">
              <span>${new Date(l.date).toLocaleString()}</span>
              <span style="font-weight:600;color:var(--text-primary)">${l.action.replace('_', ' ')}</span>
            </div>
            <div style="color:var(--text-primary);font-size:14px">${l.details}</div>
          </div>
        `).join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted)">Nenhuma atividade neste projeto.</div>'}
      </div>
      <div style="margin-top:24px;text-align:right">
        <button class="btn btn-primary" onclick="App.navigate('/projects/${projectId}'); UI.closeModal()">
          Ver Projeto Completo
        </button>
        <button class="btn btn-ghost" onclick="UI.closeModal()">Fechar</button>
      </div>
    `;

    UI.openModal(`Histórico: ${project.name}`, content);
  },

  async pageActivityLog() {
    this.renderLayoutFast('Log de Atividades');
    const { projects } = await this.loadData();
    const projectMap = {};
    projects.forEach(p => projectMap[p.id] = p);

    const logs = LogStore.getAll().slice().reverse(); // newest first

    const rows = logs.length > 0
      ? logs.map(l => {
        const proj = l.projectId ? projectMap[l.projectId] : null;
        const projName = proj ? proj.name : (l.projectId ? 'Desconhecido' : 'Sistema');
        const projLink = proj
          ? `<a href="#" onclick="App.navigate('/projects/${proj.id}');return false;" style="color:var(--accent-cyan);font-weight:600;font-size:11px;text-decoration:none">${projName}</a>`
          : `<span style="font-size:11px;color:var(--text-muted)">${projName}</span>`;
        const action = l.action ? l.action.replace(/_/g, ' ') : '';
        return `
            <tr>
              <td style="white-space:nowrap;color:var(--text-muted);font-size:12px">${new Date(l.date).toLocaleString('pt-BR')}</td>
              <td>${projLink}</td>
              <td style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:capitalize">${action}</td>
              <td style="font-size:12px;color:var(--text-primary)">${l.details}</td>
            </tr>`;
      }).join('')
      : `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhuma atividade registrada.</td></tr>`;

    this.setContent(`
      <div class="animate-fade">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <p class="page-subtitle" style="margin:0">${logs.length} registro(s) no log.</p>
          <button class="btn btn-secondary" onclick="App.clearLog()" style="font-size:12px">🗑️ Limpar Log</button>
        </div>
        <div class="card" style="overflow:hidden;padding:0">
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="background:var(--bg-elevated);border-bottom:1px solid var(--border)">
                  <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);white-space:nowrap">Data / Hora</th>
                  <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">Projeto</th>
                  <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">Ação</th>
                  <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `);
  },

  async clearLog() {
    if (await UI.confirm('Limpar histórico de atividades?')) {
      LogStore.clear();
      this.pageDashboard();
    }
  },

  switchDashboardTab(tab) {
    this._dashboardTab = tab;
    // Update tab buttons
    document.querySelectorAll('.dash-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.dash-tab[onclick*="'${tab}'"]`)?.classList.add('active');
    // Swap view content
    const view = document.getElementById('dash-view');
    if (view) {
      const { projects } = this.cache;
      view.innerHTML = tab === 'kanban' ? this._renderKanban(projects) : this._renderGanttTimeline(projects);
    }
  },

  _renderGanttTimeline(projects, filterProjectId = '') {
    const filtered = filterProjectId ? projects.filter(p => p.id === filterProjectId) : projects;

    let html = `<div class="gantt-container">
      <div class="gantt-toolbar">
        <h3>🗓️ Timeline de Projetos</h3>
        <div class="gantt-filter">
          <button class="btn btn-secondary btn-sm mr-16" onclick="App.exportCalendar()" title="Baixar arquivo .ics">📅 Exportar Calendário</button>
          <label>Filtrar por projeto:</label>
          <select id="gantt-project-filter" onchange="App.filterTimeline(this.value)">
            <option value="">Todos os projetos</option>
            ${projects.map(p => `<option value="${p.id}" ${p.id === filterProjectId ? 'selected' : ''}>${p.name} â€” ${p.client}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="gantt-scroll">
        <div class="gantt-table">
          <div class="gantt-header-row">
            <div class="gantt-label-col">Projeto</div>
            <div class="gantt-stages-col">
              ${STAGE_DEFINITIONS.map(sd => `<div class="gantt-stage-header" style="color:${sd.color}">${sd.name}</div>`).join('')}
            </div>
          </div>`;

    if (filtered.length === 0) {
      html += `<div class="gantt-empty">Nenhum projeto encontrado</div>`;
    } else {
      filtered.forEach(p => {
        // Estimated completion: last deadline + total client review days
        const stagesWithDeadline = (p.stages || []).filter(s => s.deadline && s.status !== 'skipped');
        const lastDeadline = stagesWithDeadline.length > 0 ? stagesWithDeadline[stagesWithDeadline.length - 1].deadline : null;
        // Sum client review days across all stages
        let clientDays = 0;
        (p.stages || []).forEach(s => {
          if (s.client_review_start) {
            const end = s.client_review_end ? new Date(s.client_review_end) : new Date();
            clientDays += Math.ceil((end - new Date(s.client_review_start)) / 86400000);
          }
        });
        let estimateLabel = '';
        if (lastDeadline) {
          const adjusted = new Date(lastDeadline);
          adjusted.setDate(adjusted.getDate() + clientDays);
          estimateLabel = formatDate(adjusted.toISOString().split('T')[0]);
        }

        html += `<div class="gantt-row" onclick="App.navigate('/projects/${p.id}')">
          <div class="gantt-label-col">
            <span>${p.name}</span>
            <span class="gantt-client">${p.client}</span>
            ${estimateLabel ? `<span class="gantt-estimate">📅 Previsão: ${estimateLabel}${clientDays > 0 ? ` <span style="font-size:10px;color:var(--warning)">(+${clientDays}d cliente)</span>` : ''}</span>` : ''}
          </div>
          <div class="gantt-stages-col">`;
        STAGE_DEFINITIONS.forEach(sd => {
          const stage = (p.stages || []).find(s => s.stage_key === sd.key);
          const status = stage ? stage.status : 'pending';
          html += `<div class="gantt-cell"><div class="gantt-bar ${status}" style="background:${sd.color}" title="${sd.name}: ${STATUS_LABELS[status] || status}"></div></div>`;
        });
        html += `</div></div>`;
      });
    }

    html += `</div></div></div>`;
    return html;
  },

  filterTimeline(projectId) {
    const { projects } = this.cache;
    const container = document.querySelector('.gantt-container');
    if (container) {
      container.outerHTML = this._renderGanttTimeline(projects, projectId);
    }
  },

  _renderKanban(projects) {
    const active = projects.filter(p => p.status === 'active');
    let html = '<div class="kanban-board">';
    STAGE_DEFINITIONS.forEach(sd => {
      const inStage = active.filter(p => {
        const curr = getCurrentStage(p.stages);
        return curr && curr.stage_key === sd.key;
      });
      html += `
      <div class="kanban-column" data-stage="${sd.key}">
        <div class="kanban-column-header">
          <h4><span class="stage-dot" style="background:${sd.color}"></span>${sd.name}</h4>
          <span class="count">${inStage.length}</span>
        </div>
        <div class="kanban-column-body">
          ${inStage.length > 0 ? inStage.map(p => {
        const stage = p.stages.find(s => s.stage_key === sd.key);
        return UI.renderKanbanCard(p, stage || {});
      }).join('') : '<div style="text-align:center;padding:20px;font-size:11px;color:var(--text-muted)">Nenhum projeto</div>'}
        </div>
      </div>`;
    });
    html += '</div>';
    return html;
  },

  // ========== PROJECTS PAGE (All projects list + CRUD) ==========
  async pageProjects() {
    this.renderLayoutFast('Projetos', `<button class="btn btn-primary" onclick="App.openNewProject()">+ Novo Projeto</button>`);
    const { projects } = await this.loadData();

    this.setContent(`<div class="animate-fade">
      ${projects.length > 0
        ? `<div style="display:grid;gap:12px" class="stagger">${projects.map(p => UI.renderProjectCard(p)).join('')}</div>`
        : UI.emptyState('📂', 'Nenhum projeto', 'Crie seu primeiro projeto para começar!', '<button class="btn btn-primary" onclick="App.openNewProject()">+ Novo Projeto</button>')}
    </div>`);
  },

  // ========== NEW / EDIT PROJECT ==========
  openNewProject() {
    const stageRows = STAGE_DEFINITIONS.map(sd => `
      <div style="display:grid;grid-template-columns:120px 1fr 1fr;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px"><span class="stage-dot" style="background:${sd.color}"></span>${sd.name}${sd.optional ? ' <span style="font-size:10px;color:var(--text-muted)">(opc.)</span>' : ''}</div>
        <div><label class="form-label">Início</label><input type="date" class="form-input" id="ns-${sd.key}-start"></div>
        <div><label class="form-label">Prazo</label><input type="date" class="form-input" id="ns-${sd.key}-deadline"></div>
      </div>
    `).join('');

    UI.openModal('Novo Projeto', `
      <div class="form-row"><div class="form-group"><label class="form-label">Nome do Projeto</label><input type="text" class="form-input" id="np-name" placeholder="ex: Site Empresa XYZ"></div>
      <div class="form-group"><label class="form-label">Cliente</label><input type="text" class="form-input" id="np-client" placeholder="Nome do cliente"></div></div>
      <div class="form-group"><label class="form-label">Data do Contrato</label><input type="date" class="form-input" id="np-contract"></div>
      <div class="form-group"><label class="form-label">Observações</label><textarea class="form-textarea" id="np-notes" placeholder="Detalhes do projeto..."></textarea></div>
      <div style="margin-top:16px"><div class="form-label" style="margin-bottom:12px">Prazos por Etapa</div>${stageRows}</div>`,
      `<button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="App.saveNewProject()">Criar Projeto</button>`,
      { maxWidth: '720px' }
    );
  },

  async saveNewProject() {
    const name = document.getElementById('np-name')?.value.trim();
    const client = document.getElementById('np-client')?.value.trim();
    if (!name || !client) return UI.toast('Nome e cliente são obrigatórios', 'warning');

    try {
      const project = await ProjectStore.create({
        name, client,
        contract_date: document.getElementById('np-contract')?.value || null,
        priority: 'medium',
        notes: document.getElementById('np-notes')?.value || '',
        status: 'active'
      });

      const stages = STAGE_DEFINITIONS.map(sd => ({
        project_id: project.id, stage_key: sd.key,
        start_date: document.getElementById(`ns-${sd.key}-start`)?.value || null,
        deadline: document.getElementById(`ns-${sd.key}-deadline`)?.value || null,
        status: 'pending', sort_order: sd.order
      }));
      await StageStore.createBatch(stages);

      LogStore.add('create_project', `Novo projeto criado: ${name}`, project.id);

      UI.closeModal();
      UI.toast('Projeto criado com sucesso!', 'success');
      this.invalidateCache();
      await this.route();
    } catch (e) {
      console.error(e);
      UI.toast('Erro ao criar projeto: ' + e.message, 'error');
    }
  },

  // ========== PROJECT DETAIL ==========
  async pageProjectDetail(id) {
    this.renderLayoutFast('Carregando...');
    const { personas } = await this.loadData();
    const [project, stages] = await Promise.all([
      ProjectStore.getById(id),
      StageStore.getByProject(id)
    ]);
    const personaMap = {};
    personas.forEach(p => personaMap[p.id] = p);
    stages.forEach(s => s.persona = s.assigned_persona_id ? personaMap[s.assigned_persona_id] : null);
    project.stages = stages;

    const progress = getProjectProgress(stages);
    this.cache._currentProject = project;
    this.cache._currentStages = stages;

    const h2 = document.querySelector('.main-header h2');
    if (h2) h2.textContent = `Projeto: ${project.name}`;

    this.setContent(`
      <div class="animate-fade">
        <div class="flex items-center justify-between mb-24">
          <div>
            <p class="page-subtitle" style="margin-bottom:0">Cliente: ${project.client} · Contrato: ${formatDate(project.contract_date)}</p>
          </div>
          <div class="flex gap-8">
            <button class="btn btn-secondary" onclick="App.autoScheduleProject('${id}')" title="Preencher datas automaticamente por dias úteis">📅 Auto-Cronograma</button>
            <select class="form-select" style="width:auto;padding:6px 12px;font-size:12px" onchange="App.updateProjectStatus('${id}', this.value)">
              <option value="active" ${project.status === 'active' ? 'selected' : ''}>Ativo</option>
              <option value="paused" ${project.status === 'paused' ? 'selected' : ''}>Pausado</option>
              <option value="completed" ${project.status === 'completed' ? 'selected' : ''}>Concluído</option>
              <option value="cancelled" ${project.status === 'cancelled' ? 'selected' : ''}>Cancelado</option>
            </select>
          </div>
        </div>

        <div class="card mb-24">
          <div class="flex items-center justify-between mb-16">
            <span style="font-size:13px;font-weight:600">Progresso Geral</span>
            <span style="font-size:13px;font-weight:700">${progress}%</span>
          </div>
          <div class="progress-bar" style="height:8px"><div class="progress-fill" style="width:${progress}%"></div></div>
        </div>

        <div class="section-title">📍 Timeline</div>
        ${UI.renderTimeline(stages)}

        <div class="section-title mt-24">📋 Detalhes das Etapas</div>
        <div class="stage-cards stagger">${stages.map(s => UI.renderStageCard(s, personas)).join('')}</div>

        ${project.notes ? `<div class="card mt-24"><div class="card-header"><h3>📝 Observações</h3></div><p style="font-size:13px;color:var(--text-secondary)">${project.notes}</p></div>` : ''}

        <div class="flex gap-8 mt-24 justify-between">
          <button class="btn btn-secondary" onclick="App.navigate('/projects')">← Voltar</button>
          <div class="flex gap-8">
            <button class="btn btn-primary" onclick="App.generateProjectReport('${id}')">📄 Extrato PDF</button>
            <button class="btn btn-secondary" onclick="App.editProject('${id}')">✏️ Editar Projeto</button>
            <button class="btn btn-danger" onclick="App.deleteProject('${id}')">🗑️ Excluir</button>
          </div>
        </div>
      </div>
    `);
  },

  async updateStageStatus(stageId, status) {
    try {
      const updates = { status };
      if (status === 'completed') updates.completed_date = new Date().toISOString().split('T')[0];
      else updates.completed_date = null;
      await StageStore.update(stageId, updates);

      const stage = this.cache.stages ? this.cache.stages.find(s => s.id === stageId) : (this.cache._currentStages ? this.cache._currentStages.find(s => s.id === stageId) : null);
      if (stage) {
        const def = getStageDefinition(stage.stage_key);
        LogStore.add('update_stage', `Etapa "${def ? def.name : stage.stage_key}" alterada para ${STATUS_LABELS[status] || status}`, stage.project_id);
      }

      UI.toast('Status atualizado!', 'success');
      this.invalidateCache();
      await this.route();
    } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
  },

  async updateStagePersona(stageId, personaId) {
    try {
      await StageStore.update(stageId, { assigned_persona_id: personaId || null });
      UI.toast('Responsável atualizado!', 'success');
      this.invalidateCache();
    } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
  },

  async updateProjectStatus(projectId, status) {
    try {
      await ProjectStore.update(projectId, { status });
      LogStore.add('update_status', `Projeto alterado para ${STATUS_LABELS[status] || status}`, projectId);
      UI.toast('Status do projeto atualizado!', 'success');
      this.invalidateCache();
      await this.route();
    } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
  },

  async generateProjectReport(projectId, templateId) {
    const templates = this._getTemplates();
    if (templates.length === 0) { templates.push(this._defaultTemplate()); this._saveTemplates(templates); }

    // If no template specified and multiple exist, show picker
    if (!templateId && templates.length > 1) {
      const opts = templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      UI.openModal('Escolher Template PDF', `
        <div class="form-group">
          <label class="form-label">Selecione o template para gerar o extrato:</label>
          <select class="form-select" id="tpl-select">${opts}</select>
        </div>
      `, `
        <button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="UI.closeModal(); App.generateProjectReport('${projectId}', document.getElementById('tpl-select').value)">Gerar PDF</button>
      `);
      return;
    }

    const tpl = templateId ? templates.find(t => t.id === templateId) : templates[0];
    if (!tpl) return UI.toast('Template não encontrado', 'error');
    const cols = tpl.columns;
    const hdr = tpl.header;
    const sysName = SystemStore.get().name || 'Gestão de Projetos';

    const project = await ProjectStore.getById(projectId);
    const stages = await StageStore.getByProject(projectId);
    const { personas } = await this.loadData();
    const personaMap = {};
    personas.forEach(p => personaMap[p.id] = p);

    const statusLabels = { pending: 'Pendente', in_progress: 'Em Andamento', completed: 'Concluído', skipped: 'Pulado', paused: 'Pausado', cancelled: 'Cancelado', active: 'Ativo' };
    const statusColors = { pending: '#6b7280', in_progress: '#3b82f6', completed: '#22c55e', skipped: '#9ca3af', paused: '#f59e0b', cancelled: '#ef4444', active: '#3b82f6' };

    const totalClientDays = stages.reduce((sum, s) => {
      if (s.client_review_start) {
        const end = s.client_review_end ? new Date(s.client_review_end) : new Date();
        return sum + Math.ceil((end - new Date(s.client_review_start)) / 86400000);
      }
      return sum;
    }, 0);
    const completedStages = stages.filter(s => s.status === 'completed').length;
    const skippedStages = stages.filter(s => s.status === 'skipped').length;

    // Header subtitle parts
    const subtitleParts = [];
    if (hdr.showClient) subtitleParts.push('Cliente: ' + project.client);
    if (hdr.showContractDate) subtitleParts.push('Contrato: ' + formatDate(project.contract_date));
    if (hdr.showStatus) subtitleParts.push('Status: ' + (statusLabels[project.status] || project.status));

    // Info cards
    const infoCards = [];
    if (hdr.showProgress) infoCards.push('<div class="info-box"><div class="label">Etapas Concluídas</div><div class="value green">' + completedStages + ' / ' + (stages.length - skippedStages) + '</div></div>');
    if (hdr.showSkipped) infoCards.push('<div class="info-box"><div class="label">Etapas Puladas</div><div class="value">' + skippedStages + '</div></div>');
    if (hdr.showClientDays) infoCards.push('<div class="info-box"><div class="label">Dias com Cliente</div><div class="value orange">' + totalClientDays + ' dia' + (totalClientDays !== 1 ? 's' : '') + '</div></div>');
    if (hdr.showProgress) infoCards.push('<div class="info-box"><div class="label">Progresso</div><div class="value blue">' + getProjectProgress(stages) + '%</div></div>');
    const gridCols = infoCards.length || 1;

    // Filter stages by excluded stage keys from template
    const excludedStages = tpl.excludedStages || [];
    const visibleStages = stages.filter(s => !excludedStages.includes(s.stage_key));

    // Dynamic table columns
    const colDefs = [
      { key: 'etapa', label: 'Etapa', fn: (s, def) => '<div style="display:flex;align-items:center;gap:8px"><span style="width:10px;height:10px;border-radius:50%;background:' + def.color + ';display:inline-block"></span><strong>' + def.icon + ' ' + def.name + '</strong></div>' },
      { key: 'status', label: 'Status', fn: (s) => '<span class="status-badge" style="background:' + statusColors[s.status] + '20;color:' + statusColors[s.status] + ';border:1px solid ' + statusColors[s.status] + '40">' + (statusLabels[s.status] || s.status) + '</span>' },
      { key: 'inicio', label: 'Início', fn: (s) => formatDate(s.start_date) },
      { key: 'prazo', label: 'Prazo', fn: (s) => formatDate(s.deadline) },
      { key: 'conclusao', label: 'Conclusão', fn: (s) => formatDate(s.completed_date) },
      {
        key: 'diasUteis', label: 'Dias Úteis', fn: (s, def) => {
          if (s.start_date && s.deadline) {
            const actual = countBusinessDays(s.start_date, s.deadline);
            return `<span style="font-weight:600">${actual} dias</span>`;
          }
          return def.business_days != null ? def.business_days + ' dias' : '\u2014';
        }
      },
      { key: 'responsavel', label: 'Responsável', fn: (s) => { const p = s.assigned_persona_id ? personaMap[s.assigned_persona_id] : null; return p ? p.name : '—'; } },
      {
        key: 'aprovacaoCliente', label: 'Aprovação Cliente', fn: (s) => {
          if (!s.client_review_start) return '—';
          const d = Math.ceil(((s.client_review_end ? new Date(s.client_review_end) : new Date()) - new Date(s.client_review_start)) / 86400000);
          return 'Enviado: ' + formatDate(s.client_review_start) + '<br>' + (s.client_review_end ? 'Aprovado: ' + formatDate(s.client_review_end) : 'Aguardando...') + '<br>(' + d + ' dia' + (d !== 1 ? 's' : '') + ')';
        }
      },
      { key: 'anotacoes', label: 'Anotações', fn: (s) => s.notes ? '<em>"' + s.notes + '"</em>' : '—' }
    ];
    const activeCols = colDefs.filter(c => cols[c.key]);

    const theadHtml = activeCols.map(c => '<th>' + c.label + '</th>').join('');
    let finalStagesForPdf = visibleStages;
    let getDef = (key) => getStageDefinition(key);

    if (hdr.showMacro) {
      const macroGroups = [
        { id: 'macro_comercial', name: 'Comercial', icon: '🤝', color: '#f59e0b', keys: ['negotiation', 'kickoff'] },
        { id: 'macro_wireframe', name: 'Wireframe', icon: '📐', color: '#6366f1', keys: ['copywriter', 'wireframe'] },
        { id: 'macro_design_prog', name: 'Design + Programação', icon: '💻', color: '#8b5cf6', keys: ['design', 'development'] },
        { id: 'macro_golive', name: 'Go-live', icon: '🌐', color: '#10b981', keys: ['golive'] }
      ];

      finalStagesForPdf = [];
      const macroDefs = {};

      macroGroups.forEach(group => {
        const groupStages = visibleStages.filter(s => group.keys.includes(s.stage_key));
        if (groupStages.length === 0) return;

        const starts = groupStages.map(s => s.start_date).filter(Boolean).sort();
        const deadlines = groupStages.map(s => s.deadline).filter(Boolean).sort();
        
        // Find the final sub-stage logically (the one defined last in the group keys)
        const lastKeyInGroup = group.keys.slice().reverse().find(k => groupStages.some(s => s.stage_key === k));
        const finalStageInGroup = groupStages.find(s => s.stage_key === lastKeyInGroup);
        const macroCompletedDate = finalStageInGroup ? finalStageInGroup.completed_date : null;

        const clientStarts = groupStages.map(s => s.client_review_start).filter(Boolean).sort();
        const clientEnds = groupStages.map(s => s.client_review_end).filter(Boolean).sort();

        let totalBusinessDays = 0;
        groupStages.forEach(s => {
           const d = getStageDefinition(s.stage_key);
           totalBusinessDays += (d && d.business_days) || 0;
        });

        let mStatus = 'pending';
        if (groupStages.every(s => s.status === 'completed')) mStatus = 'completed';
        else if (groupStages.some(s => s.status === 'in_progress')) mStatus = 'in_progress';
        else if (groupStages.some(s => s.status === 'completed')) mStatus = 'in_progress';

        finalStagesForPdf.push({
          stage_key: group.id,
          status: mStatus,
          start_date: starts.length > 0 ? starts[0] : null,
          deadline: deadlines.length > 0 ? deadlines[deadlines.length - 1] : null,
          completed_date: macroCompletedDate,
          client_review_start: clientStarts.length > 0 ? clientStarts[0] : null,
          client_review_end: clientEnds.length > 0 ? clientEnds[clientEnds.length - 1] : null,
          assigned_persona_id: null,
          notes: groupStages.map(s => s.notes).filter(Boolean).join(' | ') || null
        });

        macroDefs[group.id] = {
           key: group.id,
           name: group.name,
           icon: group.icon,
           color: group.color,
           business_days: totalBusinessDays
        };
      });

      getDef = (key) => macroDefs[key];
    }

    const tbodyHtml = finalStagesForPdf.map(s => {
      const def = getDef(s.stage_key) || getStageDefinition(s.stage_key);
      if (!def) return '';
      return '<tr>' + activeCols.map(c => '<td>' + c.fn(s, def) + '</td>').join('') + '</tr>';
    }).join('');

    const now = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const reportHtml = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Extrato - ' + project.name + '</title><style>' +
      '* { margin:0; padding:0; box-sizing:border-box; }' +
      "body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color:#1f2937; background:#fff; }" +
      '.toolbar { background:#1e1b2e; padding:12px 32px; display:flex; justify-content:space-between; align-items:center; }' +
      '.toolbar button { padding:8px 20px; border:none; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; }' +
      '.toolbar .btn-print { background:linear-gradient(135deg,#8b5cf6,#6366f1); color:#fff; }' +
      '.toolbar .btn-close { background:#374151; color:#fff; }' +
      '.report { max-width:960px; margin:0 auto; padding:32px; }' +
      '.header { text-align:center; padding:24px 0 20px; border-bottom:2px solid #e5e7eb; margin-bottom:24px; }' +
      '.header h1 { font-size:22px; font-weight:800; color:#1f2937; }' +
      '.header .subtitle { font-size:13px; color:#6b7280; margin-top:6px; }' +
      '.info-grid { display:grid; grid-template-columns:repeat(' + gridCols + ',1fr); gap:12px; margin-bottom:24px; }' +
      '.info-box { background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:12px 16px; text-align:center; }' +
      '.info-box .label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:#9ca3af; margin-bottom:4px; }' +
      '.info-box .value { font-size:15px; font-weight:700; color:#1f2937; }' +
      '.info-box .value.green { color:#22c55e; } .info-box .value.blue { color:#6366f1; } .info-box .value.orange { color:#f59e0b; }' +
      '.section-title { font-size:14px; font-weight:700; color:#1f2937; margin:20px 0 10px; padding-bottom:6px; border-bottom:1px solid #e5e7eb; }' +
      'table { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:20px; }' +
      'th { background:#f3f4f6; padding:10px 8px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280; border-bottom:2px solid #e5e7eb; }' +
      'td { padding:10px 8px; border-bottom:1px solid #f3f4f6; vertical-align:top; }' +
      'tr:hover { background:#fafafa; }' +
      '.status-badge { display:inline-block; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:600; }' +
      '.footer { margin-top:32px; padding-top:16px; border-top:1px solid #e5e7eb; text-align:center; font-size:11px; color:#9ca3af; }' +
      '@media print { .toolbar { display:none !important; } body { background:#fff; } .report { padding:16px; max-width:100%; } @page { margin:10mm 12mm; size:landscape; } table { page-break-inside:auto; } tr { page-break-inside:avoid; } .header h1 { color: #1f2937 !important; } }' +
      '</style></head><body>' +
      '<div class="toolbar"><span style="color:#fff;font-size:13px;font-weight:600">📄 Extrato — ' + tpl.name + '</span><div style="display:flex;gap:8px"><button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button><button class="btn-close" onclick="window.close()">Fechar</button></div></div>' +
      '<div class="report">' +
      '<div class="header"><h1>' + project.name + '</h1>' + (subtitleParts.length > 0 ? '<div class="subtitle">' + subtitleParts.join(' · ') + '</div>' : '') + '</div>' +
      (infoCards.length > 0 ? '<div class="info-grid">' + infoCards.join('') + '</div>' : '') +
      (activeCols.length > 0 ? '<div class="section-title">📋 Detalhamento por Etapa</div><table><thead><tr>' + theadHtml + '</tr></thead><tbody>' + tbodyHtml + '</tbody></table>' : '') +
      (hdr.showProjectNotes !== false && project.notes ? '<div class="section-title">📝 Observações do Projeto</div><p style="font-size:12px;color:#4b5563;line-height:1.6;margin-bottom:20px">' + project.notes + '</p>' : '') +
      (hdr.showFooter !== false ? '<div class="footer"><p style="font-size:11px;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 16px;margin-bottom:12px;line-height:1.6;text-align:left"><strong>⚠️ Aviso:</strong> Os prazos apresentados neste documento são <strong>estimativas</strong> baseadas no planejamento atual do projeto e podem sofrer alterações ao longo do desenvolvimento. Fatores como mudanças de escopo, aprovações pendentes ou imprevistos operacionais podem impactar as datas previstas. Este extrato não constitui garantia contratual de entrega nas datas indicadas.</p>Relatório gerado em ' + now + ' · Template: ' + tpl.name + ' · ' + sysName + '</div>' : '') +
      '</div></body></html>';

    const reportWindow = window.open('', '_blank');
    reportWindow.document.write(reportHtml);
    reportWindow.document.close();
  },

  editStageDates(stageId) {
    const stage = this.cache._currentStages?.find(s => s.id === stageId);
    if (!stage) return;
    const def = getStageDefinition(stage.stage_key);
    UI.openModal(`Editar datas - ${def?.name || ''}`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Data de Início</label><input type="date" class="form-input" id="ed-start" value="${stage.start_date || ''}"></div>
        <div class="form-group"><label class="form-label">Prazo</label><input type="date" class="form-input" id="ed-deadline" value="${stage.deadline || ''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Data de Conclusão</label><input type="date" class="form-input" id="ed-completed" value="${stage.completed_date || ''}"></div>`,
      `<button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="App.saveStageDates('${stageId}')">Salvar</button>`
    );
  },

  async saveStageDates(stageId) {
    try {
      await StageStore.update(stageId, {
        start_date: document.getElementById('ed-start')?.value || null,
        deadline: document.getElementById('ed-deadline')?.value || null,
        completed_date: document.getElementById('ed-completed')?.value || null
      });
      UI.closeModal();
      UI.toast('Datas atualizadas!', 'success');
      this.invalidateCache();
      await this.route();
    } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
  },

  editStageNotes(stageId) {
    const stage = this.cache._currentStages?.find(s => s.id === stageId);
    if (!stage) return;
    const def = getStageDefinition(stage.stage_key);
    UI.openModal(`Notas - ${def?.name || ''}`,
      `<div class="form-group"><textarea class="form-textarea" id="sn-notes" rows="4" placeholder="Escreva observações sobre esta etapa...">${stage.notes || ''}</textarea></div>`,
      `<button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="App.saveStageNotes('${stageId}')">Salvar</button>`
    );
  },

  async saveStageNotes(stageId) {
    try {
      await StageStore.update(stageId, { notes: document.getElementById('sn-notes')?.value || '' });
      UI.closeModal();
      UI.toast('Notas salvas!', 'success');
      this.invalidateCache();
      await this.route();
    } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
  },

  editClientReview(stageId) {
    const stage = this.cache._currentStages?.find(s => s.id === stageId);
    if (!stage) return;
    const def = getStageDefinition(stage.stage_key);
    UI.openModal(`⏳ Aprovação do Cliente - ${def?.name || ''}`,
      `<div class="form-group">
        <label class="form-label">Data de envio ao cliente</label>
        <input type="date" class="form-input" id="cr-start" value="${stage.client_review_start || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Data de aprovação do cliente</label>
        <input type="date" class="form-input" id="cr-end" value="${stage.client_review_end || ''}">
      </div>`,
      `<button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="App.saveClientReview('${stageId}')">Salvar</button>`
    );
  },

  async saveClientReview(stageId) {
    try {
      const reviewStart = document.getElementById('cr-start')?.value || null;
      const reviewEnd = document.getElementById('cr-end')?.value || null;
      
      const stages = this.cache._currentStages || [];
      const stageIndex = stages.findIndex(s => s.id === stageId);
      
      if (stageIndex !== -1) {
        const oldStage = stages[stageIndex];
        const oldDays = (oldStage.client_review_start && oldStage.client_review_end) 
          ? countBusinessDays(oldStage.client_review_start, oldStage.client_review_end) : 0;
        const newDays = (reviewStart && reviewEnd) 
          ? countBusinessDays(reviewStart, reviewEnd) : 0;
        
        const deltaDays = newDays - oldDays;
        
        await StageStore.update(stageId, { client_review_start: reviewStart, client_review_end: reviewEnd });
        
        if (deltaDays !== 0) {
          const updates = [];
          for (let i = stageIndex; i < stages.length; i++) {
            const s = stages[i];
            const up = {};
            if (i === stageIndex) {
              if (s.deadline) up.deadline = toISODate(addBusinessDays(s.deadline, deltaDays));
            } else {
              if (s.start_date) up.start_date = toISODate(addBusinessDays(s.start_date, deltaDays));
              if (s.deadline) up.deadline = toISODate(addBusinessDays(s.deadline, deltaDays));
            }
            if (Object.keys(up).length > 0) {
              updates.push(StageStore.update(s.id, up));
            }
          }
          if (updates.length > 0) await Promise.all(updates);
          UI.toast(`Cronograma ajustado em ${deltaDays > 0 ? '+' : ''}${deltaDays} dia(s) devido à revisão do cliente.`, 'info');
        }
      } else {
        await StageStore.update(stageId, { client_review_start: reviewStart, client_review_end: reviewEnd });
      }

      UI.closeModal();
      UI.toast('Aprovação atualizada!', 'success');
      this.invalidateCache();
      await this.route();
    } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
  },

  async editProject(id) {
    const proj = this.cache._currentProject || await ProjectStore.getById(id);
    UI.openModal('Editar Projeto', `
      <div class="form-row"><div class="form-group"><label class="form-label">Nome</label><input type="text" class="form-input" id="ep-name" value="${proj.name}"></div>
      <div class="form-group"><label class="form-label">Cliente</label><input type="text" class="form-input" id="ep-client" value="${proj.client}"></div></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Data do Contrato</label><input type="date" class="form-input" id="ep-contract" value="${proj.contract_date || ''}"></div>
      <div class="form-group"><label class="form-label">Prioridade</label><select class="form-select" id="ep-priority"><option value="low" ${proj.priority === 'low' ? 'selected' : ''}>Baixa</option><option value="medium" ${proj.priority === 'medium' ? 'selected' : ''}>Média</option><option value="high" ${proj.priority === 'high' ? 'selected' : ''}>Alta</option><option value="urgent" ${proj.priority === 'urgent' ? 'selected' : ''}>Urgente</option></select></div></div>
      <div class="form-group"><label class="form-label">Observações</label><textarea class="form-textarea" id="ep-notes">${proj.notes || ''}</textarea></div>`,
      `<button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="App.saveEditProject('${id}')">Salvar</button>`
    );
  },

  async saveEditProject(id) {
    try {
      await ProjectStore.update(id, {
        name: document.getElementById('ep-name')?.value.trim(),
        client: document.getElementById('ep-client')?.value.trim(),
        contract_date: document.getElementById('ep-contract')?.value || null,
        priority: document.getElementById('ep-priority')?.value,
        notes: document.getElementById('ep-notes')?.value || ''
      });
      UI.closeModal();
      UI.toast('Projeto atualizado!', 'success');
      this.invalidateCache();
      await this.route();
    } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
  },

  // ========== AUTO SCHEDULE ==========
  autoScheduleProject(projectId) {
    const project = this.cache._currentProject;
    if (!project) return UI.toast('Projeto não encontrado no cache', 'error');

    const contractDate = project.contract_date;
    const stages = this.cache._currentStages || [];

    // Build rows only for stages that exist in DB (not skipped)
    const rows = STAGE_DEFINITIONS
      .filter(sd => stages.find(s => s.stage_key === sd.key && s.status !== 'skipped'))
      .map(sd => {
        const stage = stages.find(s => s.stage_key === sd.key);
        const defaultDays = sd.business_days || 0;
        const hasDays = sd.business_days !== null;
        return `
          <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="width:10px;height:10px;border-radius:50%;background:${sd.color};display:inline-block"></span>
              <span style="font-size:13px;font-weight:600">${sd.icon} ${sd.name}${sd.optional ? ' <span style="font-size:10px;color:var(--text-muted)">(opcional)</span>' : ''}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              ${hasDays
            ? `<input type="number" class="form-input" id="as-days-${sd.key}" value="${defaultDays}" min="1" max="365" style="width:70px;text-align:center">
                   <span style="font-size:12px;color:var(--text-muted)">dias úteis</span>`
            : `<span style="font-size:12px;color:var(--text-muted);font-style:italic">Sem prazo automático</span>`
          }
            </div>
            <div style="font-size:11px;color:var(--text-muted);text-align:right">
              ${stage?.start_date ? `Início atual: ${formatDate(stage.start_date)}` : ''}
            </div>
          </div>`;
      }).join('');

    UI.openModal('📅 Auto-Cronograma por Dias Úteis',
      `<div style="margin-bottom:16px">
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
          As datas de início e prazo de cada etapa serão calculadas automaticamente a partir da <strong>Data do Contrato</strong>.
          Ajuste os dias úteis de cada etapa antes de aplicar.
        </p>
        <div style="padding:10px 14px;background:var(--sidebar-bg);border-radius:8px;margin-bottom:16px;font-size:13px">
          📋 Data do Contrato: <strong>${contractDate ? formatDate(contractDate) : '<span style="color:var(--error)">Não definida — edite o projeto primeiro</span>'}</strong>
        </div>
        <div style="max-height:50vh;overflow-y:auto">
          <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;padding:6px 0;margin-bottom:4px">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted)">Etapa</span>
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted)">Duração</span>
            <span></span>
          </div>
          ${rows}
        </div>
      </div>`,
      `<button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="App.applyAutoSchedule('${projectId}')" ${!contractDate ? 'disabled title="Data do contrato não definida"' : ''}>Aplicar Cronograma</button>`,
      { maxWidth: '600px' }
    );
  },

  async applyAutoSchedule(projectId) {
    const project = this.cache._currentProject;
    if (!project?.contract_date) return UI.toast('Data do contrato não definida!', 'error');

    const stages = this.cache._currentStages || [];
    let cursor = new Date(project.contract_date);
    // Make sure cursor is Mon-Fri — if it's a weekend, advance to Monday
    while (cursor.getDay() === 0 || cursor.getDay() === 6) cursor.setDate(cursor.getDate() + 1);

    const updates = [];

    for (const sd of STAGE_DEFINITIONS) {
      const stage = stages.find(s => s.stage_key === sd.key);
      if (!stage || stage.status === 'skipped') continue;
      if (sd.business_days === null) {
        // Negotiation: start = contract_date, no deadline override
        updates.push(StageStore.update(stage.id, {
          start_date: toISODate(cursor)
        }));
        continue;
      }

      const inputEl = document.getElementById(`as-days-${sd.key}`);
      const days = inputEl ? parseInt(inputEl.value) || sd.business_days : sd.business_days;

      const startDate = new Date(cursor);
      const endDate = addBusinessDays(startDate, days);

      updates.push(StageStore.update(stage.id, {
        start_date: toISODate(startDate),
        deadline: toISODate(endDate)
      }));

      // Next stage starts the business day after this one ends
      cursor = addBusinessDays(endDate, 1);
    }

    try {
      await Promise.all(updates);
      UI.closeModal();
      UI.toast('Cronograma preenchido automaticamente!', 'success');
      LogStore.add('auto_schedule', 'Cronograma auto-preenchido por dias úteis', projectId);
      this.invalidateCache();
      await this.route();
    } catch (e) {
      UI.toast('Erro ao aplicar cronograma: ' + e.message, 'error');
    }
  },

  async deleteProject(id) {
    if (await UI.confirm('Tem certeza que deseja excluir este projeto? Esta ação não pode ser desfeita.')) {
      try {
        await ProjectStore.delete(id);
        UI.toast('Projeto excluído', 'success');
        this.invalidateCache();
        this.navigate('/projects');
      } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
    }
  },

  // ========== EQUIPE (formerly Personas) ==========
  async pagePersonas() {
    this.renderLayoutFast('Equipe', `<button class="btn btn-primary" onclick="App.openNewPersona()">+ Novo Membro</button>`);
    const { personas, projects } = await this.loadData();
    const personaCounts = {};
    personas.forEach(p => { personaCounts[p.id] = 0; });
    projects.forEach(p => (p.stages || []).forEach(s => { if (s.assigned_persona_id && personaCounts.hasOwnProperty(s.assigned_persona_id)) personaCounts[s.assigned_persona_id]++; }));

    this.setContent(`
      <div class="animate-fade">
        ${personas.length > 0 ? `<div class="persona-grid stagger">${personas.map(p => UI.renderPersonaCard(p, personaCounts[p.id] || 0)).join('')}</div>`
        : UI.emptyState('👤', 'Nenhum membro na equipe', 'Cadastre membros da equipe para atribuí-los às etapas dos projetos.', '<button class="btn btn-primary" onclick="App.openNewPersona()">+ Novo Membro</button>')}
      </div>`);
  },

  openNewPersona() {
    const colors = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#3b82f6', '#10b981', '#f97316', '#ef4444', '#14b8a6', '#a855f7'];
    UI.openModal('Novo Membro da Equipe', `
      <div class="form-group"><label class="form-label">Nome</label><input type="text" class="form-input" id="pp-name" placeholder="Nome completo"></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Função</label><input type="text" class="form-input" id="pp-role" placeholder="ex: Designer, Copywriter, Dev"></div>
      <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="pp-email" placeholder="email@exemplo.com"></div></div>
      <div class="form-group"><label class="form-label">Cor</label><div class="flex gap-8" id="pp-colors" style="flex-wrap:wrap">${colors.map(c => `<button type="button" class="btn-icon" style="width:32px;height:32px;border-radius:50%;background:${c};border:2px solid transparent" onclick="document.querySelectorAll('#pp-colors button').forEach(b=>b.style.borderColor='transparent');this.style.borderColor='white';document.getElementById('pp-color').value='${c}'" ></button>`).join('')}</div><input type="hidden" id="pp-color" value="${colors[0]}"></div>`,
      `<button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="App.saveNewPersona()">Criar</button>`
    );
  },

  async saveNewPersona() {
    const name = document.getElementById('pp-name')?.value.trim();
    const role = document.getElementById('pp-role')?.value.trim();
    if (!name || !role) return UI.toast('Nome e função são obrigatórios', 'warning');
    try {
      await PersonaStore.create({ name, role, email: document.getElementById('pp-email')?.value.trim() || null, color: document.getElementById('pp-color')?.value || '#8b5cf6' });
      UI.closeModal();
      UI.toast('Membro adicionado!', 'success');
      this.invalidateCache();
      await this.route();
    } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
  },

  async editPersona(id) {
    const persona = this.cache.personas?.find(p => p.id === id) || await PersonaStore.getById(id);
    UI.openModal('Editar Membro', `
      <div class="form-group"><label class="form-label">Nome</label><input type="text" class="form-input" id="ep2-name" value="${persona.name}"></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Função</label><input type="text" class="form-input" id="ep2-role" value="${persona.role}"></div>
      <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="ep2-email" value="${persona.email || ''}"></div></div>`,
      `<button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="App.saveEditPersona('${id}')">Salvar</button>`
    );
  },

  async saveEditPersona(id) {
    try {
      await PersonaStore.update(id, {
        name: document.getElementById('ep2-name')?.value.trim(),
        role: document.getElementById('ep2-role')?.value.trim(),
        email: document.getElementById('ep2-email')?.value.trim() || null
      });
      UI.closeModal();
      UI.toast('Membro atualizado!', 'success');
      this.invalidateCache();
      await this.route();
    } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
  },

  async deletePersona(id) {
    if (await UI.confirm('Excluir este membro? Ele será desvinculado de todas as etapas.')) {
      try { await PersonaStore.delete(id); UI.toast('Membro excluído', 'success'); this.invalidateCache(); await this.route(); }
      catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
    }
  },

  // ========== ANALYTICS ==========
  async pageAnalytics() {
    this.renderLayoutFast('Análises');
    const { projects, personas } = await this.loadData();
    const insights = InsightsEngine.generate(projects);

    this.setContent(`
      <div class="animate-fade">
        <div class="charts-grid">
          <div class="chart-card"><h3>Eficiência de Prazos (Estimado vs Real)</h3><div style="height:280px"><canvas id="chart-efficiency"></canvas></div></div>
          <div class="chart-card"><h3>Carga de Trabalho por Membro</h3><div style="height:280px"><canvas id="chart-workload"></canvas></div></div>
          <div class="chart-card"><h3>Tendência de Conclusão</h3><div style="height:280px"><canvas id="chart-trend"></canvas></div></div>
          <div class="chart-card"><h3>Projetos por Etapa Atual</h3><div style="height:280px"><canvas id="chart-stages2"></canvas></div></div>
        </div>
        <div class="section-title mt-24">💡 Insights & Recomendações</div>
        <div class="insights-grid stagger">${insights.length > 0 ? insights.map(i => UI.renderInsightCard(i)).join('') : '<div class="insight-card insight-info"><div class="insight-icon">📊</div><div class="insight-content"><h4>Dados insuficientes</h4><p>Conclua mais projetos para gerar insights detalhados.</p></div></div>'}</div>
      </div>
    `);

    setTimeout(() => {
      Charts.deadlineEfficiency('chart-efficiency', projects);
      Charts.workloadByPersona('chart-workload', projects, personas);
      Charts.completionTrend('chart-trend', projects);
      Charts.projectsByStage('chart-stages2', projects);
    }, 50);
  },

  // ========== PDF TEMPLATES ==========
  _getTemplates() {
    try { return JSON.parse(localStorage.getItem('pdf-templates') || '[]'); } catch { return []; }
  },
  _saveTemplates(templates) { localStorage.setItem('pdf-templates', JSON.stringify(templates)); },
  _defaultTemplate() {
    return {
      id: Date.now().toString(),
      name: 'Template Padrão',
      header: { showClient: true, showContractDate: true, showStatus: true, showProgress: true, showClientDays: true, showSkipped: true, showProjectNotes: true, showFooter: true, showMacro: false },
      columns: { etapa: true, status: true, inicio: true, prazo: true, conclusao: true, diasUteis: true, responsavel: true, aprovacaoCliente: true, anotacoes: true },
      excludedStages: []
    };
  },

  pageTemplates() {
    let templates = this._getTemplates();
    if (templates.length === 0) {
      templates = [this._defaultTemplate()];
      this._saveTemplates(templates);
    }

    const columnsLabels = { etapa: 'Etapa', status: 'Status', inicio: 'Início', prazo: 'Prazo', conclusao: 'Conclusão', diasUteis: 'Dias Úteis', responsavel: 'Responsável', aprovacaoCliente: 'Aprovação Cliente', anotacoes: 'Anotações' };
    const headerLabels = { showClient: 'Cliente', showContractDate: 'Data de Contrato', showStatus: 'Status do Projeto', showProgress: 'Progresso', showClientDays: 'Dias com Cliente', showSkipped: 'Etapas Puladas', showProjectNotes: 'Observações do Projeto', showFooter: 'Rodapé', showMacro: 'Visão Macro (Agrupar Etapas)' };

    const cardsHtml = templates.map(t => {
      const enabledCols = Object.entries(t.columns || {}).filter(([, v]) => v).map(([k]) => columnsLabels[k] || k);
      const enabledHeaders = Object.entries(t.header || {}).filter(([, v]) => v).map(([k]) => headerLabels[k] || k);
      const excluded = (t.excludedStages || []).map(k => { const d = STAGE_DEFINITIONS.find(s => s.key === k); return d ? d.name : k; });
      return `
        <div class="card template-card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3>📄 ${t.name}</h3>
            <div class="flex gap-8">
              <button class="btn btn-ghost btn-sm" onclick="App.duplicateTemplate('${t.id}')" title="Duplicar">📋</button>
              <button class="btn btn-ghost btn-sm" onclick="App.editTemplate('${t.id}')" title="Editar">✏️</button>
              ${templates.length > 1 ? `<button class="btn btn-ghost btn-sm" onclick="App.deleteTemplate('${t.id}')" title="Excluir" style="color:var(--error)">🗑️</button>` : ''}
            </div>
          </div>
          <div style="padding:0 0 4px">
            <div style="margin-bottom:8px">
              <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">Cards do Cabeçalho</span>
              <div class="flex gap-4" style="flex-wrap:wrap;margin-top:4px">
                ${enabledHeaders.map(h => `<span class="tag tag-blue">${h}</span>`).join('')}
              </div>
            </div>
            <div style="margin-bottom:8px">
              <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">Colunas da Tabela</span>
              <div class="flex gap-4" style="flex-wrap:wrap;margin-top:4px">
                ${enabledCols.map(c => `<span class="tag tag-violet">${c}</span>`).join('')}
              </div>
            </div>
            ${excluded.length > 0 ? `
            <div>
              <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">Etapas excluídas do PDF</span>
              <div class="flex gap-4" style="flex-wrap:wrap;margin-top:4px">
                ${excluded.map(n => `<span class="tag" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2)">${n}</span>`).join('')}
              </div>
            </div>` : ''}
          </div>
        </div>`;
    }).join('');

    this.renderLayout('Templates PDF', `
      <div class="animate-fade" style="max-width:800px">
        <p class="page-subtitle">Gerencie os templates de extrato PDF para projetos concluídos. Configure quais informações aparecem no cabeçalho e quais colunas são exibidas na tabela.</p>
        ${cardsHtml}
        <button class="btn btn-primary mt-16" onclick="App.openNewTemplate()">+ Novo Template</button>
      </div>
    `);
  },

  openNewTemplate() {
    const t = this._defaultTemplate();
    t.name = '';
    this._openTemplateEditor(t, true);
  },

  editTemplate(id) {
    const templates = this._getTemplates();
    const t = templates.find(x => x.id === id);
    if (!t) return;
    this._openTemplateEditor(t, false);
  },

  _openTemplateEditor(t, isNew) {
    const columnsLabels = { etapa: 'Etapa', status: 'Status', inicio: 'Data de Início', prazo: 'Prazo / Deadline', conclusao: 'Data de Conclusão', diasUteis: 'Dias Úteis', responsavel: 'Responsável', aprovacaoCliente: 'Aprovação do Cliente', anotacoes: 'Anotações' };
    const headerLabels = { showClient: 'Nome do Cliente', showContractDate: 'Data de Contrato', showStatus: 'Status do Projeto', showProgress: 'Card de Progresso', showClientDays: 'Card Dias com Cliente', showSkipped: 'Card Etapas Puladas', showProjectNotes: 'Observações do Projeto', showFooter: 'Rodapé do Relatório', showMacro: 'Visão Macro (Agrupar Etapas)' };

    const excluded = t.excludedStages || [];

    const columnsHtml = Object.entries(columnsLabels).map(([key, label]) =>
      `<label class="toggle-row"><input type="checkbox" id="tc-${key}" ${(t.columns || {})[key] ? 'checked' : ''}> <span>${label}</span></label>`
    ).join('');

    const headerHtml = Object.entries(headerLabels).map(([key, label]) =>
      `<label class="toggle-row"><input type="checkbox" id="th-${key}" ${(t.header || {})[key] ? 'checked' : ''}> <span>${label}</span></label>`
    ).join('');

    // Stage exclusion checkboxes
    const stagesHtml = STAGE_DEFINITIONS.map(sd =>
      `<label class="toggle-row">
        <input type="checkbox" id="ts-${sd.key}" ${excluded.includes(sd.key) ? '' : 'checked'}>
        <span style="display:flex;align-items:center;gap:6px">
          <b style="width:8px;height:8px;min-width:8px;min-height:8px;border-radius:50%;background:${sd.color};display:inline-block"></b>
          ${sd.icon} ${sd.name}${sd.optional ? ' <em style="font-size:10px;color:var(--text-muted)">(opcional)</em>' : ''}
        </span>
      </label>`
    ).join('');

    UI.openModal(isNew ? 'Novo Template PDF' : `Editar: ${t.name}`, `
      <div class="form-group">
        <label class="form-label">Nome do Template</label>
        <input type="text" class="form-input" id="tpl-name" value="${t.name}" placeholder="Ex: Relatório Completo">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:16px">
        <div>
          <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text-primary)">📊 Cabeçalho</div>
          <div class="toggle-list">${headerHtml}</div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text-primary)">📋 Colunas</div>
          <div class="toggle-list">${columnsHtml}</div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text-primary)">🏷️ Etapas no PDF</div>
          <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Desmarque para ocultar uma etapa do relatório.</p>
          <div class="toggle-list">${stagesHtml}</div>
        </div>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="App.saveTemplate('${t.id}', ${isNew})">Salvar Template</button>
    `, { maxWidth: '780px' });
  },

  saveTemplate(id, isNew) {
    const name = document.getElementById('tpl-name')?.value.trim();
    if (!name) return UI.toast('Dê um nome ao template', 'warning');

    const columns = {};
    ['etapa', 'status', 'inicio', 'prazo', 'conclusao', 'diasUteis', 'responsavel', 'aprovacaoCliente', 'anotacoes'].forEach(k => {
      columns[k] = document.getElementById('tc-' + k)?.checked || false;
    });
    const header = {};
    ['showClient', 'showContractDate', 'showStatus', 'showProgress', 'showClientDays', 'showSkipped', 'showProjectNotes', 'showFooter', 'showMacro'].forEach(k => {
      header[k] = document.getElementById('th-' + k)?.checked || false;
    });
    // Stages that are UNchecked = excluded
    const excludedStages = STAGE_DEFINITIONS
      .filter(sd => !document.getElementById(`ts-${sd.key}`)?.checked)
      .map(sd => sd.key);

    const templates = this._getTemplates();
    if (isNew) {
      templates.push({ id, name, header, columns, excludedStages });
    } else {
      const idx = templates.findIndex(x => x.id === id);
      if (idx >= 0) templates[idx] = { ...templates[idx], name, header, columns, excludedStages };
    }
    this._saveTemplates(templates);
    UI.closeModal();
    UI.toast('Template salvo!', 'success');
    this.pageTemplates();
  },

  deleteTemplate(id) {
    let templates = this._getTemplates();
    templates = templates.filter(x => x.id !== id);
    this._saveTemplates(templates);
    UI.toast('Template excluído', 'success');
    this.pageTemplates();
  },

  duplicateTemplate(id) {
    const templates = this._getTemplates();
    const t = templates.find(x => x.id === id);
    if (!t) return;
    const dup = JSON.parse(JSON.stringify(t));
    dup.id = Date.now().toString();
    dup.name = t.name + ' (cópia)';
    templates.push(dup);
    this._saveTemplates(templates);
    UI.toast('Template duplicado!', 'success');
    this.pageTemplates();
  },

  // ========== SETTINGS ==========
  // ========== SETTINGS ==========
  pageSettings() {
    const cfg = getSupabaseConfig();
    const sys = SystemStore.get();
    const hasPin = SecurityStore.hasPin();

    this.renderLayout('Configurações', `
      <div class="animate-fade" style="max-width:900px;display:grid;grid-template-columns:1.5fr 1fr;gap:24px">
        
        <!-- System Customization -->
        <div class="card">
          <div class="card-header"><h3>🎨 Personalização do Sistema</h3></div>
          <div class="form-group">
            <label class="form-label">Nome do Sistema</label>
            <input type="text" class="form-input" id="sys-name" value="${sys.name}">
          </div>
          <div class="form-group">
            <label class="form-label">Subtítulo</label>
            <input type="text" class="form-input" id="sys-subtitle" value="${sys.subtitle}">
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Cor Primária</label>
              <div class="flex items-center gap-8">
                <input type="color" id="sys-primary" value="${sys.primaryColor}" style="width:50px;height:40px;padding:0;border:none;border-radius:6px;cursor:pointer">
                <span class="text-muted text-sm">${sys.primaryColor}</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Cor Secundária</label>
              <div class="flex items-center gap-8">
                <input type="color" id="sys-secondary" value="${sys.secondaryColor}" style="width:50px;height:40px;padding:0;border:none;border-radius:6px;cursor:pointer">
                <span class="text-muted text-sm">${sys.secondaryColor}</span>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Tema</label>
            <select class="form-select" id="sys-theme">
              <option value="dark" ${sys.theme === 'dark' ? 'selected' : ''}>🌑 Escuro (Padrão)</option>
              <option value="light" ${sys.theme === 'light' ? 'selected' : ''}>☀️ Claro</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Logo</label>
            <select class="form-select mb-16" id="sys-logo-type" onchange="
              document.getElementById('sys-logo-url-group').style.display=this.value==='url'?'block':'none';
              document.getElementById('sys-logo-icon-group').style.display=this.value==='icon'?'block':'none';
              document.getElementById('sys-logo-upload-group').style.display=this.value==='upload'?'block':'none';
            ">
              <option value="icon" ${sys.logoType === 'icon' ? 'selected' : ''}>Ícone (Letra)</option>
              <option value="url" ${sys.logoType === 'url' ? 'selected' : ''}>Imagem (URL)</option>
              <option value="upload" ${sys.logoType === 'upload' ? 'selected' : ''}>Imagem (Upload)</option>
            </select>

            <div id="sys-logo-url-group" style="display:${sys.logoType === 'url' ? 'block' : 'none'}">
              <input type="text" class="form-input" id="sys-logo-url" value="${sys.logoUrl || ''}" placeholder="https://exemplo.com/logo.png">
            </div>
            <div id="sys-logo-icon-group" style="display:${sys.logoType === 'icon' ? 'block' : 'none'}">
              <input type="text" class="form-input" id="sys-logo-icon" value="${sys.logoIcon}" placeholder="G" maxlength="2">
            </div>
            <div id="sys-logo-upload-group" style="display:${sys.logoType === 'upload' ? 'block' : 'none'}">
              ${sys.logoUploadData ? `<img id="sys-logo-preview" src="${sys.logoUploadData}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;margin-bottom:10px;display:block">` : '<img id="sys-logo-preview" style="display:none;width:48px;height:48px;border-radius:8px;object-fit:cover;margin-bottom:10px">'}
              <input type="file" id="sys-logo-file" accept="image/*" style="display:none" onchange="App.uploadLogo(this.files[0])">
              <button id="sys-logo-upload-btn" class="btn btn-secondary" style="font-size:12px" onclick="document.getElementById('sys-logo-file').click()">📁 Escolher imagem</button>
              <p class="text-muted" style="font-size:11px;margin-top:6px">Máximo 500 KB · PNG, JPG, SVG, WebP · Salvo no servidor.</p>
            </div>
          </div>

          <button class="btn btn-primary w-full mt-24" onclick="App.saveSystemSettings()">Salvar Personalização</button>
        </div>

        <div class="flex flex-col gap-40" style="gap:40px">
          <!-- Security -->
          <div class="card">
            <div class="card-header"><h3>🛡️ Segurança</h3></div>
            <div class="form-group">
                <label class="form-label">PIN de Acesso</label>
                <div class="flex items-center justify-between mb-8">
                    <span class="text-sm" style="font-weight:600;color:${hasPin ? 'var(--success)' : 'var(--text-muted)'}">
                        ${hasPin ? '🔒 PIN ativado' : '⚠️ Nenhum PIN'}
                    </span>
                </div>
                <div class="flex gap-8">
                    <input type="password" class="form-input" id="new-pin" placeholder="Novo PIN (4+ dígitos)" maxlength="6" style="width:100%">
                    <button class="btn btn-primary" onclick="App.setPin()">Definir</button>
                </div>
                <p class="text-muted text-xs mt-8">Protege a edição de dados sensíveis.</p>
            </div>
          </div>

          <!-- Supabase -->
          <div class="card">
            <div class="card-header"><h3>🔗 Conexão Supabase <span class="badge ${cfg ? 'badge-success' : 'badge-neutral'}">${cfg ? 'Conectado' : 'Off'}</span></h3></div>
            
            <div id="supabase-locked">
                <p class="text-secondary text-sm mb-16">As credenciais estão ocultas.</p>
                <button class="btn btn-secondary w-full" onclick="App.unlockSupabase()">🔓 Desbloquear / Editar</button>
            </div>

            <div id="supabase-unlocked" style="display:none">
                <div class="form-group">
                    <label class="form-label">URL</label>
                    <div class="flex gap-8">
                        <input type="password" class="form-input w-full" id="set-url" value="${cfg?.url || ''}" style="flex:1">
                        <button class="btn btn-icon btn-ghost" onclick="App.toggleInput('set-url')">👁️</button>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Anon Key</label>
                    <div class="flex gap-8">
                        <input type="password" class="form-input w-full" id="set-key" value="${cfg?.key || ''}" style="flex:1">
                        <button class="btn btn-icon btn-ghost" onclick="App.toggleInput('set-key')">👁️</button>
                    </div>
                </div>
                <button class="btn btn-secondary w-full" onclick="App.saveSupabaseSettings()">Salvar Conexão</button>
            </div>
          </div>

          <!-- Data -->
          <div class="card">
            <div class="card-header"><h3>⚙️ Dados</h3></div>
            <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Gerencie seus dados.</p>
            
            <label class="form-label">Backup e Restauração</label>
            <div class="flex gap-8 mb-16">
                <button class="btn btn-secondary w-full" onclick="App.exportData()" title="Salvar dados em arquivo JSON">📤 Exportar</button>
                <button class="btn btn-secondary w-full" onclick="App.importData()" title="Carregar dados de arquivo JSON">📥 Importar</button>
            </div>

            <label class="form-label mt-16">Zona de Perigo</label>
            <button class="btn btn-danger w-full" onclick="App.clearAllData()">🗑️ Limpar Alertas</button>
          </div>
        </div>

      </div>
    `);
  },

  async uploadLogo(file) {
    if (!file) return;
    if (file.size > 500000) {
      UI.toast('Imagem muito grande. Use uma imagem menor que 500 KB.', 'error');
      return;
    }
    const btn = document.getElementById('sys-logo-upload-btn');
    if (btn) { btn.textContent = '⏳ Enviando...'; btn.disabled = true; }
    try {
      const { url, path } = await LogoStore.upload(file);
      window.__logoUploadData = url;
      window.__logoUploadPath = path;

      // Update preview
      const prev = document.getElementById('sys-logo-preview');
      if (prev) { prev.src = url; prev.style.display = 'block'; }

      if (btn) { btn.textContent = '✅ Enviada! Salve para confirmar.'; btn.disabled = false; }
      UI.toast('Logo carregado! Clique em Salvar Personalização.', 'success');
    } catch (e) {
      if (btn) { btn.textContent = '📁 Escolher imagem'; btn.disabled = false; }
      UI.toast('Erro ao enviar logo: ' + e.message, 'error');
    }
  },

  saveSystemSettings() {
    const sys = SystemStore.get();
    const settings = {
      name: document.getElementById('sys-name').value.trim() || 'Gestão de Projetos',
      subtitle: document.getElementById('sys-subtitle').value.trim(),
      logoType: document.getElementById('sys-logo-type').value,
      logoUrl: document.getElementById('sys-logo-url').value.trim(),
      logoIcon: document.getElementById('sys-logo-icon').value.trim() || 'G',
      logoUploadData: document.getElementById('sys-logo-type').value === 'upload'
        ? (window.__logoUploadData || sys.logoUploadData || null)
        : (sys.logoUploadData || null),
      logoUploadPath: document.getElementById('sys-logo-type').value === 'upload'
        ? (window.__logoUploadPath || sys.logoUploadPath || null)
        : (sys.logoUploadPath || null),
      primaryColor: document.getElementById('sys-primary').value,
      secondaryColor: document.getElementById('sys-secondary').value,
      theme: document.getElementById('sys-theme').value
    };

    SystemStore.save(settings);
    this.applySystemSettings();
    UI.toast('Personalização salva!', 'success');
    this.pageSettings(); // Redraw to reflect changes (though route() would also work)
    this.route(); // Sidebar update
  },

  saveSupabaseSettings() {
    const url = document.getElementById('set-url')?.value.trim();
    const key = document.getElementById('set-key')?.value.trim();
    if (!url || !key) return UI.toast('Preencha todos os campos', 'warning');
    saveSupabaseConfig(url, key);
    if (initSupabase()) { UI.toast('Conexão e criptografia atualizadas!', 'success'); }
  },

  async setPin() {
    const newPin = document.getElementById('new-pin').value.trim();

    // Require current PIN verification
    if (SecurityStore.hasPin()) {
      const current = await UI.prompt('Para alterar, digite seu PIN ATUAL:', 'password');
      if (!current) return;
      if (!await SecurityStore.checkPin(current)) return UI.toast('PIN atual incorreto!', 'error');
    }

    if (!newPin) {
      if (await UI.confirm('Remover o PIN de segurança?')) {
        await SecurityStore.setPin('');
        this.pageSettings();
        UI.toast('PIN removido', 'info');
      }
      return;
    }
    if (newPin.length < 4) return UI.toast('O PIN deve ter pelo menos 4 dígitos', 'warning');
    await SecurityStore.setPin(newPin);
    this.pageSettings();
    UI.toast('PIN definido com sucesso!', 'success');
  },

  async unlockSupabase() {
    if (SecurityStore.hasPin()) {
      const pin = await UI.prompt('Digite seu PIN de segurança para desbloquear:', 'password');
      if (!pin) return;
      if (!await SecurityStore.checkPin(pin)) return UI.toast('PIN incorreto', 'error');
    }
    document.getElementById('supabase-locked').style.display = 'none';
    document.getElementById('supabase-unlocked').style.display = 'block';
    setTimeout(() => document.getElementById('set-url')?.focus(), 100);
  },

  toggleInput(id) {
    const el = document.getElementById(id);
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
  },

  async exportData() {
    try {
      UI.toast('Gerando backup...', 'info');
      const [projects, stages, personas, alerts] = await Promise.all([
        sb().from('projects').select('*').then(r => r.data),
        sb().from('project_stages').select('*').then(r => r.data),
        sb().from('personas').select('*').then(r => r.data),
        sb().from('alerts').select('*').then(r => r.data)
      ]);

      const data = {
        system: localStorage.getItem('system_settings') ? JSON.parse(localStorage.getItem('system_settings')) : null,
        projects: projects || [],
        stages: stages || [],
        personas: personas || [],
        alerts: alerts || [],
        pin: localStorage.getItem('app_pin') || null,
        vault: localStorage.getItem('supabase_vault') || null,
        timestamp: new Date().toISOString(),
        version: '2.0'
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_gestao_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      UI.toast('Backup gerado com sucesso!', 'success');
    } catch (e) {
      console.error(e);
      UI.toast('Erro ao gerar backup: ' + e.message, 'error');
    }
  },

  async importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async event => {
        try {
          const json = JSON.parse(event.target.result);
          if (!json.timestamp) throw new Error('Formato de arquivo inválido/antigo.');

          if (await UI.confirm(`Restaurar backup de ${new Date(json.timestamp).toLocaleDateString()}? Isso substituirá TODOS os dados atuais.`)) {
            if (json.system) localStorage.setItem('system_settings', JSON.stringify(json.system));
            // Supabase Upserts
            try {
              // We need to handle potential 'undefined' if backup is old, though export is new.
              if (json.personas && json.personas.length) await sb().from('personas').upsert(json.personas);
              if (json.projects && json.projects.length) await sb().from('projects').upsert(json.projects);
              if (json.stages && json.stages.length) await sb().from('project_stages').upsert(json.stages);
              if (json.alerts && json.alerts.length) await sb().from('alerts').upsert(json.alerts);
            } catch (dbErr) {
              console.error('Erro no Supabase:', dbErr);
              // Continue?
            }
            if (json.pin) localStorage.setItem('app_pin', json.pin);
            if (json.vault) localStorage.setItem('supabase_vault', json.vault);

            UI.toast('Dados restaurados! Recarregando...', 'success');
            setTimeout(() => window.location.reload(), 1500);
          }
        } catch (err) {
          UI.toast('Erro ao importar: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  async exportCalendar() {
    const { projects } = await this.loadData();
    let events = [];

    projects.forEach(p => {
      if (p.status === 'cancelled') return;
      (p.stages || []).forEach(s => {
        if (!s.deadline || s.status === 'skipped') return;
        const def = getStageDefinition(s.stage_key);
        const deadline = s.deadline.replace(/-/g, '');
        const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

        // Add +1 day for DTEND because it's exclusive for all-day events
        const endDate = new Date(s.deadline);
        endDate.setDate(endDate.getDate() + 1);
        const dtend = endDate.toISOString().slice(0, 10).replace(/-/g, '');

        events.push(
          'BEGIN:VEVENT',
          `UID:${s.id}@gestaoproj`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;VALUE=DATE:${deadline}`,
          `DTEND;VALUE=DATE:${dtend}`,
          `SUMMARY:[${p.client}] ${def ? def.name : s.stage_key}`,
          `DESCRIPTION:Projeto: ${p.name}\\nStatus: ${STATUS_LABELS[s.status] || s.status}\\nPrazo: ${formatDate(s.deadline)}`,
          'END:VEVENT'
        );
      });
    });

    if (events.length === 0) return UI.toast('Nenhum prazo encontrado para exportar', 'info');

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//GestaoDeProjetos//PT',
      'CALSCALE:GREGORIAN',
      ...events,
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'prazos_projetos.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    UI.toast('Calendário exportado!', 'success');
  },

  async addSubtask(stageId) {
    const input = document.getElementById(`new-task-${stageId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    try {
      const stage = this.cache._currentStages ? this.cache._currentStages.find(s => s.id === stageId) : null;
      if (!stage) throw new Error('Etapa não encontrada no cache');

      const subtasks = stage.subtasks || [];
      subtasks.push({ text, done: false });

      await StageStore.update(stageId, { subtasks });

      // Update local cache to reflect immediately without full reload if possible, 
      // but StageStore.update might not update cache object in place if it returns new data or just success.
      // We manually update cache
      stage.subtasks = subtasks;

      // Re-render UI
      // If we are in project detail, we replace the stage card.
      const card = document.getElementById(`stage-${stageId}`);
      if (card) {
        const { personas } = await this.loadData();
        card.outerHTML = UI.renderStageCard(stage, personas);
        // Focus back?
        // document.getElementById(`new-task-${stageId}`)?.focus(); // ID changed? No, same ID.
      }
      // Or full page refresh is safer
      // await this.pageProjectDetail(stage.project_id);
    } catch (e) {
      console.error(e);
      UI.toast('Erro ao adicionar tarefa. Execute o SQL de migração no Supabase.', 'error');
    }
  },

  async toggleSubtask(stageId, index) {
    try {
      const stage = this.cache._currentStages ? this.cache._currentStages.find(s => s.id === stageId) : null;
      if (!stage || !stage.subtasks) return;

      stage.subtasks[index].done = !stage.subtasks[index].done;
      await StageStore.update(stageId, { subtasks: stage.subtasks });

      // Update UI
      const card = document.getElementById(`stage-${stageId}`);
      if (card) {
        const { personas } = await this.loadData();
        card.outerHTML = UI.renderStageCard(stage, personas);
      }
    } catch (e) { UI.toast('Erro ao atualizar: ' + e.message, 'error'); }
  },

  async deleteSubtask(stageId, index) {
    if (!await UI.confirm('Remover esta tarefa?')) return;
    try {
      const stage = this.cache._currentStages ? this.cache._currentStages.find(s => s.id === stageId) : null;
      if (!stage || !stage.subtasks) return;

      stage.subtasks.splice(index, 1);
      await StageStore.update(stageId, { subtasks: stage.subtasks });

      // Update UI
      const card = document.getElementById(`stage-${stageId}`);
      if (card) {
        const { personas } = await this.loadData();
        card.outerHTML = UI.renderStageCard(stage, personas);
      }
    } catch (e) { UI.toast('Erro ao remover: ' + e.message, 'error'); }
  },

  async uploadAttachment(stageId, file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return UI.toast('Arquivo muito grande (max 5MB)', 'warning');

    UI.toast('Enviando arquivo...', 'info');
    try {
      const stage = this.cache._currentStages ? this.cache._currentStages.find(s => s.id === stageId) : null;
      if (!stage) throw new Error('Etapa não encontrada');

      const ext = file.name.split('.').pop();
      const path = `${stage.project_id}/${stage.id}/${Date.now()}.${ext}`;

      const { data, error } = await sb().storage.from('attachments').upload(path, file);
      if (error) throw error;

      const { data: { publicUrl } } = sb().storage.from('attachments').getPublicUrl(path);

      const attachments = stage.attachments || [];
      attachments.push({ name: file.name, url: publicUrl, path: path, size: file.size });

      await StageStore.update(stageId, { attachments });
      stage.attachments = attachments;

      // Update UI
      const card = document.getElementById(`stage-${stageId}`);
      if (card) {
        const { personas } = await this.loadData();
        card.outerHTML = UI.renderStageCard(stage, personas);
      }
      UI.toast('Arquivo anexado!', 'success');
    } catch (e) {
      console.error(e);
      UI.toast('Erro no upload. Verifique se o bucket "attachments" existe e é público.', 'error');
    }
    // Reset input
    const input = document.getElementById(`file-${stageId}`);
    if (input) input.value = '';
  },

  async deleteAttachment(stageId, index) {
    if (!await UI.confirm('Excluir este anexo?')) return;
    try {
      const stage = this.cache._currentStages ? this.cache._currentStages.find(s => s.id === stageId) : null;
      if (!stage || !stage.attachments) return;

      const file = stage.attachments[index];
      if (file.path) {
        const { error } = await sb().storage.from('attachments').remove([file.path]);
        if (error) console.error('Erro ao apagar do storage:', error);
      }

      stage.attachments.splice(index, 1);
      await StageStore.update(stageId, { attachments: stage.attachments });

      // Update UI
      const card = document.getElementById(`stage-${stageId}`);
      if (card) {
        const { personas } = await this.loadData();
        card.outerHTML = UI.renderStageCard(stage, personas);
      }
      UI.toast('Anexo removido!', 'success');
    } catch (e) { UI.toast('Erro ao remover: ' + e.message, 'error'); }
  },

  async clearAllData() {
    if (await UI.confirm('Limpar todos os alertas? Os projetos e equipe não serão afetados.')) {
      try { await AlertStore.dismissAll(); UI.toast('Alertas limpos!', 'success'); this.invalidateCache(); }
      catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
    }
  },

  // ========== ALERT ACTIONS ==========
  _notifOpen: false,

  async toggleNotifications() {
    const dropdown = document.getElementById('notif-dropdown');
    if (!dropdown) return;
    this._notifOpen = !this._notifOpen;
    if (!this._notifOpen) { dropdown.classList.remove('open'); return; }

    // Fetch fresh alerts
    try {
      const alerts = await AlertStore.getActive();
      this.cache.alerts = alerts;
      if (alerts.length === 0) {
        dropdown.innerHTML = `<div class="notif-empty"><span>🔔</span><p>Nenhuma notificação</p></div>`;
      } else {
        dropdown.innerHTML = `
          <div class="notif-header">
            <span>Notificações (${alerts.length})</span>
            <button class="btn btn-ghost btn-sm" onclick="App.dismissAllAlerts()">Limpar tudo</button>
          </div>
          <div class="notif-list">
            ${alerts.map(a => `
              <div class="notif-item notif-${a.type}" onclick="App.notifGoToProject('${a.project_id}')">
                <div class="notif-icon">${a.type === 'overdue' ? '⚠️' : '⏰'}</div>
                <div class="notif-content">
                  <div class="notif-msg">${a.message}</div>
                  <div class="notif-date">${formatDate(a.alert_date)}</div>
                </div>
                <button class="notif-dismiss" onclick="event.stopPropagation(); App.dismissAlert('${a.id}')" title="Dispensar">✖️</button>
              </div>
            `).join('')}
          </div>`;
      }
      dropdown.classList.add('open');

      // Close on click outside
      const closeHandler = (e) => {
        if (!dropdown.contains(e.target) && !e.target.closest('.notif-bell-wrapper')) {
          this._notifOpen = false;
          dropdown.classList.remove('open');
          document.removeEventListener('click', closeHandler);
        }
      };
      setTimeout(() => document.addEventListener('click', closeHandler), 0);
    } catch (e) {
      dropdown.innerHTML = `<div class="notif-empty"><p>Erro ao carregar</p></div>`;
      dropdown.classList.add('open');
    }
  },

  notifGoToProject(projectId) {
    this._notifOpen = false;
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) dropdown.classList.remove('open');
    this.navigate('/projects/' + projectId);
  },

  async dismissAlert(id) {
    try { await AlertStore.dismiss(id); this.invalidateCache(); await this.toggleNotifications(); this._notifOpen = false; await this.toggleNotifications(); } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
  },

  async dismissAllAlerts() {
    try { await AlertStore.dismissAll(); UI.toast('Alertas limpos!', 'success'); this.invalidateCache(); this._notifOpen = false; const d = document.getElementById('notif-dropdown'); if (d) d.classList.remove('open'); await this.route(); }
    catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
  }
};

// Start
document.addEventListener('DOMContentLoaded', () => App.init());
