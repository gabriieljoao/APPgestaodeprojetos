/* ==========================================
   MAIN APPLICATION - Router & Pages
   ========================================== */

const App = {
    currentRoute: '/',
    cache: { projects: [], personas: [], alerts: [] },

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
            else if (hash === '/settings') await this.pageSettings();
            else await this.pageDashboard();
        } catch (err) {
            console.error('Route error:', err);
            document.getElementById('app').innerHTML = `<div class="setup-screen"><div class="setup-card"><h2>Erro</h2><p>${err.message}</p><button class="btn btn-primary mt-16" onclick="App.navigate('/')">Voltar</button></div></div>`;
        }
    },

    async loadData() {
        const [projects, personas, alerts] = await Promise.all([
            ProjectStore.getWithStages(),
            PersonaStore.getAll(),
            AlertStore.getActive()
        ]);
        this.cache = { projects, personas, alerts };
        return { projects, personas, alerts };
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
        <p style="font-size:11px;color:var(--text-muted);margin-top:16px">Cole a URL e a chave anônima do seu projeto Supabase. Não se esqueça de rodar o SQL de setup antes.</p>
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
                await this.route();
            } catch (e) {
                UI.toast('Erro ao conectar. Verifique as credenciais e o SQL.', 'error');
                localStorage.removeItem('supabase_config');
            }
        }
    },

    // ========== DASHBOARD ==========
    async pageDashboard() {
        const { projects, personas, alerts } = await this.loadData();
        await AlertStore.generateAlerts(projects);
        const freshAlerts = await AlertStore.getActive();
        this.cache.alerts = freshAlerts;

        const active = projects.filter(p => p.status === 'active');
        const completed = projects.filter(p => p.status === 'completed');
        let overdueCount = 0;
        active.forEach(p => (p.stages || []).forEach(s => {
            if (s.status !== 'completed' && s.status !== 'skipped' && s.deadline && daysUntilDeadline(s.deadline) < 0) overdueCount++;
        }));

        const insights = InsightsEngine.generate(projects);

        this.renderLayout('Dashboard', `
      <div class="animate-fade">
        <div class="kpi-grid stagger">
          <div class="kpi-card"><div class="kpi-icon" style="background:var(--info-bg);color:var(--info)">📂</div><div class="kpi-value">${projects.length}</div><div class="kpi-label">Total de Projetos</div></div>
          <div class="kpi-card"><div class="kpi-icon" style="background:var(--success-bg);color:var(--success)">🚀</div><div class="kpi-value">${active.length}</div><div class="kpi-label">Projetos Ativos</div></div>
          <div class="kpi-card"><div class="kpi-icon" style="background:rgba(139,92,246,0.12);color:var(--accent-violet)">✅</div><div class="kpi-value">${completed.length}</div><div class="kpi-label">Concluídos</div></div>
          <div class="kpi-card"><div class="kpi-icon" style="background:var(--error-bg);color:var(--error)">⚠️</div><div class="kpi-value">${overdueCount}</div><div class="kpi-label">Etapas Atrasadas</div></div>
        </div>

        <div class="charts-grid">
          <div class="chart-card"><h3>Projetos por Etapa</h3><div style="height:260px"><canvas id="chart-stages"></canvas></div></div>
          <div class="chart-card"><h3>Status dos Projetos</h3><div style="height:260px"><canvas id="chart-status"></canvas></div></div>
        </div>

        ${freshAlerts.length > 0 ? `
        <div class="section-title">🔔 Alertas Ativos <span style="font-size:12px;font-weight:400;color:var(--text-muted)">(${freshAlerts.length})</span>
          <button class="btn btn-ghost btn-sm ml-auto" onclick="App.dismissAllAlerts()">Limpar todos</button>
        </div>
        <div class="alerts-list mb-24">${freshAlerts.slice(0, 8).map(a => UI.renderAlertItem(a)).join('')}</div>
        ` : ''}

        ${insights.length > 0 ? `
        <div class="section-title">💡 Insights</div>
        <div class="insights-grid stagger">${insights.map(i => UI.renderInsightCard(i)).join('')}</div>
        ` : ''}
      </div>
    `);

        setTimeout(() => {
            Charts.projectsByStage('chart-stages', projects);
            Charts.projectStatus('chart-status', projects);
        }, 100);
    },

    // ========== PROJECTS PAGE ==========
    async pageProjects() {
        const { projects, personas } = await this.loadData();
        const view = localStorage.getItem('projects_view') || 'kanban';

        this.renderLayout('Projetos',
            `<div class="animate-fade">
        <div class="flex items-center justify-between mb-24">
          <div class="tabs">
            <button class="tab ${view === 'kanban' ? 'active' : ''}" onclick="localStorage.setItem('projects_view','kanban');App.pageProjects()">Kanban</button>
            <button class="tab ${view === 'list' ? 'active' : ''}" onclick="localStorage.setItem('projects_view','list');App.pageProjects()">Lista</button>
          </div>
        </div>
        <div id="projects-view">${view === 'kanban' ? this._renderKanban(projects) : this._renderProjectList(projects)}</div>
      </div>`,
            `<button class="btn btn-primary" onclick="App.openNewProject()">+ Novo Projeto</button>`
        );
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

    _renderProjectList(projects) {
        if (projects.length === 0) return UI.emptyState('📂', 'Nenhum projeto', 'Crie seu primeiro projeto para começar!', '<button class="btn btn-primary" onclick="App.openNewProject()">+ Novo Projeto</button>');
        return `<div style="display:grid;gap:12px" class="stagger">${projects.map(p => UI.renderProjectCard(p)).join('')}</div>`;
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
      <div class="form-row"><div class="form-group"><label class="form-label">Data do Contrato</label><input type="date" class="form-input" id="np-contract"></div>
      <div class="form-group"><label class="form-label">Prioridade</label><select class="form-select" id="np-priority"><option value="low">Baixa</option><option value="medium" selected>Média</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div></div>
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
                name,
                client,
                contract_date: document.getElementById('np-contract')?.value || null,
                priority: document.getElementById('np-priority')?.value || 'medium',
                notes: document.getElementById('np-notes')?.value || '',
                status: 'active'
            });

            const stages = STAGE_DEFINITIONS.map(sd => ({
                project_id: project.id,
                stage_key: sd.key,
                start_date: document.getElementById(`ns-${sd.key}-start`)?.value || null,
                deadline: document.getElementById(`ns-${sd.key}-deadline`)?.value || null,
                status: 'pending',
                sort_order: sd.order
            }));
            await StageStore.createBatch(stages);

            UI.closeModal();
            UI.toast('Projeto criado com sucesso!', 'success');
            await this.route();
        } catch (e) {
            console.error(e);
            UI.toast('Erro ao criar projeto: ' + e.message, 'error');
        }
    },

    // ========== PROJECT DETAIL ==========
    async pageProjectDetail(id) {
        const { personas } = await this.loadData();
        const project = await ProjectStore.getById(id);
        const stages = await StageStore.getByProject(id);
        const allPersonas = await PersonaStore.getAll();
        const personaMap = {};
        allPersonas.forEach(p => personaMap[p.id] = p);
        stages.forEach(s => s.persona = s.assigned_persona_id ? personaMap[s.assigned_persona_id] : null);
        project.stages = stages;

        const progress = getProjectProgress(stages);
        this.cache._currentProject = project;
        this.cache._currentStages = stages;

        this.renderLayout(`Projeto: ${project.name}`, `
      <div class="animate-fade">
        <div class="flex items-center justify-between mb-24">
          <div>
            <p class="page-subtitle" style="margin-bottom:0">Cliente: ${project.client} · Contrato: ${formatDate(project.contract_date)}</p>
          </div>
          <div class="flex gap-8">
            <span class="badge badge-${project.priority}">${PRIORITY_LABELS[project.priority]}</span>
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
        <div class="stage-cards stagger">${stages.map(s => UI.renderStageCard(s, allPersonas)).join('')}</div>

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
            await this.route();
        } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
    },

    async updateStagePersona(stageId, personaId) {
        try {
            await StageStore.update(stageId, { assigned_persona_id: personaId || null });
            UI.toast('Responsável atualizado!', 'success');
        } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
    },

    async updateProjectStatus(projectId, status) {
        try {
            await ProjectStore.update(projectId, { status });
            UI.toast('Status do projeto atualizado!', 'success');
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
            await this.route();
        } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
    },

    async deleteProject(id) {
        if (await UI.confirm('Tem certeza que deseja excluir este projeto? Esta ação não pode ser desfeita.')) {
            try {
                await ProjectStore.delete(id);
                UI.toast('Projeto excluído', 'success');
                this.navigate('/projects');
            } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
        }
    },

    // ========== PERSONAS ==========
    async pagePersonas() {
        const { personas, projects } = await this.loadData();
        const personaCounts = {};
        personas.forEach(p => { personaCounts[p.id] = 0; });
        projects.forEach(p => (p.stages || []).forEach(s => { if (s.assigned_persona_id && personaCounts.hasOwnProperty(s.assigned_persona_id)) personaCounts[s.assigned_persona_id]++; }));

        this.renderLayout('Personas', `
      <div class="animate-fade">
        ${personas.length > 0 ? `<div class="persona-grid stagger">${personas.map(p => UI.renderPersonaCard(p, personaCounts[p.id] || 0)).join('')}</div>`
                : UI.emptyState('👤', 'Nenhuma persona', 'Cadastre personas para atribuí-las às etapas dos projetos.', '<button class="btn btn-primary" onclick="App.openNewPersona()">+ Nova Persona</button>')}
      </div>`,
            `<button class="btn btn-primary" onclick="App.openNewPersona()">+ Nova Persona</button>`
        );
    },

    openNewPersona() {
        const colors = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#3b82f6', '#10b981', '#f97316', '#ef4444', '#14b8a6', '#a855f7'];
        UI.openModal('Nova Persona', `
      <div class="form-group"><label class="form-label">Nome</label><input type="text" class="form-input" id="pp-name" placeholder="Nome completo"></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Função</label><input type="text" class="form-input" id="pp-role" placeholder="ex: Designer, Copywriter, Dev"></div>
      <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="pp-email" placeholder="email@exemplo.com"></div></div>
      <div class="form-group"><label class="form-label">Cor</label><div class="flex gap-8" style="flex-wrap:wrap">${colors.map(c => `<button type="button" class="btn-icon" style="width:32px;height:32px;border-radius:50%;background:${c};border:2px solid transparent" onclick="document.querySelectorAll('#pp-colors button').forEach(b=>b.style.borderColor='transparent');this.style.borderColor='white';document.getElementById('pp-color').value='${c}'" ></button>`).join('')}</div><input type="hidden" id="pp-color" value="${colors[0]}"></div>`,
            `<button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="App.saveNewPersona()">Criar</button>`
        );
        // Add id to color container for selector
        setTimeout(() => { const fg = document.querySelector('.modal-body .flex.gap-8'); if (fg) fg.id = 'pp-colors'; }, 50);
    },

    async saveNewPersona() {
        const name = document.getElementById('pp-name')?.value.trim();
        const role = document.getElementById('pp-role')?.value.trim();
        if (!name || !role) return UI.toast('Nome e função são obrigatórios', 'warning');
        try {
            await PersonaStore.create({ name, role, email: document.getElementById('pp-email')?.value.trim() || null, color: document.getElementById('pp-color')?.value || '#8b5cf6' });
            UI.closeModal();
            UI.toast('Persona criada!', 'success');
            await this.route();
        } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
    },

    async editPersona(id) {
        const persona = await PersonaStore.getById(id);
        UI.openModal('Editar Persona', `
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
            UI.toast('Persona atualizada!', 'success');
            await this.route();
        } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
    },

    async deletePersona(id) {
        if (await UI.confirm('Excluir esta persona? Ela será desvinculada de todas as etapas.')) {
            try { await PersonaStore.delete(id); UI.toast('Persona excluída', 'success'); await this.route(); }
            catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
        }
    },

    // ========== ANALYTICS ==========
    async pageAnalytics() {
        const { projects, personas } = await this.loadData();
        const insights = InsightsEngine.generate(projects);

        this.renderLayout('Análises', `
      <div class="animate-fade">
        <div class="charts-grid">
          <div class="chart-card"><h3>Eficiência de Prazos (Estimado vs Real)</h3><div style="height:280px"><canvas id="chart-efficiency"></canvas></div></div>
          <div class="chart-card"><h3>Carga de Trabalho por Persona</h3><div style="height:280px"><canvas id="chart-workload"></canvas></div></div>
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
        }, 100);
    },

    // ========== SETTINGS ==========
    async pageSettings() {
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

    async saveSettings() {
        const url = document.getElementById('set-url')?.value.trim();
        const key = document.getElementById('set-key')?.value.trim();
        if (!url || !key) return UI.toast('Preencha todos os campos', 'warning');
        saveSupabaseConfig(url, key);
        if (initSupabase()) { UI.toast('Conexão atualizada!', 'success'); }
    },

    async clearAllData() {
        if (await UI.confirm('Limpar todos os alertas? Os projetos e personas não serão afetados.')) {
            try { await AlertStore.dismissAll(); UI.toast('Alertas limpos!', 'success'); }
            catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
        }
    },

    // ========== ALERT ACTIONS ==========
    async dismissAlert(id) {
        try { await AlertStore.dismiss(id); await this.route(); } catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
    },

    async dismissAllAlerts() {
        try { await AlertStore.dismissAll(); UI.toast('Alertas limpos!', 'success'); await this.route(); }
        catch (e) { UI.toast('Erro: ' + e.message, 'error'); }
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => App.init());
