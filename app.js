/* ==========================================
   MAIN APPLICATION - Router & Pages
   ========================================== */

const App = {
  currentRoute: '/',
  cache: { projects: [], personas: [], alerts: [], _ts: 0 },
  CACHE_TTL: 30000,

  async init() {
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
      else if (hash === '/settings') this.pageSettings();
      else await this.pageDashboard();
    } catch (err) {
      console.error('Route error:', err);
      document.getElementById('app').innerHTML = `<div class="setup-screen"><div class="setup-card"><h2>Erro</h2><p>${err.message}</p><button class="btn btn-primary mt-16" onclick="App.navigate('/')">Voltar</button></div></div>`;
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
        ${UI.renderSidebar(this.currentRoute, alertCount)}
        <div class="main-area">
          <div class="main-header">
            <h2>${pageTitle}</h2>
            <div class="header-actions">${headerActions}</div>
          </div>
          <div class="main-content" id="page-content">${content}</div>
        </div>
      </div>`;
  },

  renderLayoutFast(pageTitle, headerActions = '') {
    const alertCount = this.cache.alerts?.length || 0;
    document.getElementById('app').innerHTML = `
      <div class="app-layout">
        ${UI.renderSidebar(this.currentRoute, alertCount)}
        <div class="main-area">
          <div class="main-header">
            <h2>${pageTitle}</h2>
            <div class="header-actions">${headerActions}</div>
          </div>
          <div class="main-content" id="page-content"><div class="loading-spinner"></div></div>
        </div>
      </div>`;
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
      }
    }
  },

  // ========== DASHBOARD (Tabbed: Kanban | Timeline) ==========
  _dashboardTab: 'kanban',

  async pageDashboard() {
    this.renderLayoutFast('Dashboard', `<button class="btn btn-primary" onclick="App.openNewProject()">+ Novo Projeto</button>`);
    const { projects, personas, alerts } = await this.loadData();

    // Generate alerts in background
    AlertStore.generateAlerts(projects).then(async () => {
      const fresh = await AlertStore.getActive();
      this.cache.alerts = fresh;
      const badge = document.querySelector('.nav-badge');
      if (badge && fresh.length > 0) badge.textContent = fresh.length;
    }).catch(() => { });

    this.setContent(`
      <div class="animate-fade">
        <div class="dash-tabs">
          <button class="dash-tab ${this._dashboardTab === 'kanban' ? 'active' : ''}" onclick="App.switchDashboardTab('kanban')">📋 Kanban</button>
          <button class="dash-tab ${this._dashboardTab === 'timeline' ? 'active' : ''}" onclick="App.switchDashboardTab('timeline')">📅 Timeline</button>
        </div>
        <div id="dash-view">
          ${this._dashboardTab === 'kanban' ? this._renderKanban(projects) : this._renderGanttTimeline(projects)}
        </div>
      </div>
    `);
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
        <h3>📅 Timeline de Projetos</h3>
        <div class="gantt-filter">
          <label>Filtrar por projeto:</label>
          <select id="gantt-project-filter" onchange="App.filterTimeline(this.value)">
            <option value="">Todos os projetos</option>
            ${projects.map(p => `<option value="${p.id}" ${p.id === filterProjectId ? 'selected' : ''}>${p.name} — ${p.client}</option>`).join('')}
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
      UI.toast('Status do projeto atualizado!', 'success');
      this.invalidateCache();
      await this.route();
    } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
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
      await StageStore.update(stageId, { client_review_start: reviewStart, client_review_end: reviewEnd });
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

  // ========== SETTINGS ==========
  pageSettings() {
    const cfg = getSupabaseConfig();
    this.renderLayout('Configurações', `
      <div class="animate-fade" style="max-width:600px">
        <div class="card mb-24">
          <div class="card-header"><h3>🔗 Conexão Supabase</h3></div>
          <div class="form-group"><label class="form-label">URL</label><input type="text" class="form-input" id="set-url" value="${cfg?.url || ''}"></div>
          <div class="form-group"><label class="form-label">Anon Key</label><input type="text" class="form-input" id="set-key" value="${cfg?.key || ''}"></div>
          <button class="btn btn-primary" onclick="App.saveSettings()">Salvar Conexão</button>
        </div>
        <div class="card">
          <div class="card-header"><h3>⚙️ Dados</h3></div>
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Gerencie seus dados da aplicação.</p>
          <button class="btn btn-danger" onclick="App.clearAllData()">🗑️ Limpar todos os alertas</button>
        </div>
      </div>
    `);
  },

  saveSettings() {
    const url = document.getElementById('set-url')?.value.trim();
    const key = document.getElementById('set-key')?.value.trim();
    if (!url || !key) return UI.toast('Preencha todos os campos', 'warning');
    saveSupabaseConfig(url, key);
    if (initSupabase()) { UI.toast('Conexão atualizada!', 'success'); }
  },

  async clearAllData() {
    if (await UI.confirm('Limpar todos os alertas? Os projetos e equipe não serão afetados.')) {
      try { await AlertStore.dismissAll(); UI.toast('Alertas limpos!', 'success'); this.invalidateCache(); }
      catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
    }
  },

  // ========== ALERT ACTIONS ==========
  async dismissAlert(id) {
    try { await AlertStore.dismiss(id); this.invalidateCache(); await this.route(); } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
  },

  async dismissAllAlerts() {
    try { await AlertStore.dismissAll(); UI.toast('Alertas limpos!', 'success'); this.invalidateCache(); await this.route(); }
    catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
  }
};

// Start
document.addEventListener('DOMContentLoaded', () => App.init());
