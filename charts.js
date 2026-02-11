/* ==========================================
   CHARTS MODULE - Chart.js Wrappers
   ========================================== */

const ChartDefaults = {
    font: { family: "'Inter', sans-serif" },
    colors: ['#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#3b82f6', '#10b981', '#f97316', '#ef4444'],
    gridColor: 'rgba(255,255,255,0.04)',
    textColor: '#a1a1aa',
    textColorLight: '#71717a'
};

Chart.defaults.font.family = ChartDefaults.font.family;
Chart.defaults.color = ChartDefaults.textColor;

const chartInstances = {};

function destroyChart(id) {
    if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function createChart(canvasId, config) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    chartInstances[canvasId] = new Chart(canvas, config);
    return chartInstances[canvasId];
}

const Charts = {
    // Doughnut: Projects by current stage
    projectsByStage(canvasId, projects) {
        const counts = {};
        STAGE_DEFINITIONS.forEach(sd => { counts[sd.key] = 0; });
        projects.filter(p => p.status === 'active').forEach(p => {
            const curr = getCurrentStage(p.stages);
            if (curr) counts[curr.stage_key] = (counts[curr.stage_key] || 0) + 1;
        });

        return createChart(canvasId, {
            type: 'doughnut',
            data: {
                labels: STAGE_DEFINITIONS.map(s => s.name),
                datasets: [{
                    data: STAGE_DEFINITIONS.map(s => counts[s.key] || 0),
                    backgroundColor: STAGE_DEFINITIONS.map(s => s.color),
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } } }
                }
            }
        });
    },

    // Horizontal bar: Deadline efficiency (planned vs actual)
    deadlineEfficiency(canvasId, projects) {
        const stageData = {};
        STAGE_DEFINITIONS.forEach(sd => { stageData[sd.key] = { planned: [], actual: [] }; });

        projects.forEach(p => {
            (p.stages || []).forEach(s => {
                if (s.status === 'completed' && s.start_date && s.deadline && s.completed_date) {
                    const planned = daysBetween(s.start_date, s.deadline);
                    const actual = daysBetween(s.start_date, s.completed_date);
                    if (planned !== null && actual !== null && planned > 0) {
                        stageData[s.stage_key]?.planned.push(planned);
                        stageData[s.stage_key]?.actual.push(actual);
                    }
                }
            });
        });

        const labels = [], planned = [], actual = [];
        STAGE_DEFINITIONS.forEach(sd => {
            const d = stageData[sd.key];
            if (d.planned.length > 0) {
                labels.push(sd.name);
                planned.push(Math.round(d.planned.reduce((a, b) => a + b, 0) / d.planned.length));
                actual.push(Math.round(d.actual.reduce((a, b) => a + b, 0) / d.actual.length));
            }
        });

        return createChart(canvasId, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Prazo estimado (dias)', data: planned, backgroundColor: 'rgba(139, 92, 246, 0.6)', borderRadius: 4 },
                    { label: 'Duração real (dias)', data: actual, backgroundColor: 'rgba(6, 182, 212, 0.6)', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: { grid: { color: ChartDefaults.gridColor }, ticks: { font: { size: 11 } } },
                    y: { grid: { display: false }, ticks: { font: { size: 11 } } }
                },
                plugins: { legend: { labels: { usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } } } }
            }
        });
    },

    // Stacked bar: Workload by persona
    workloadByPersona(canvasId, projects, personas) {
        const personaWork = {};
        personas.forEach(p => { personaWork[p.id] = { name: p.name, stages: {} }; STAGE_DEFINITIONS.forEach(sd => { personaWork[p.id].stages[sd.key] = 0; }); });

        projects.filter(p => p.status === 'active').forEach(p => {
            (p.stages || []).forEach(s => {
                if (s.assigned_persona_id && personaWork[s.assigned_persona_id] && (s.status === 'pending' || s.status === 'in_progress')) {
                    personaWork[s.assigned_persona_id].stages[s.stage_key]++;
                }
            });
        });

        const labels = [], datasets = [];
        const activePersonas = Object.values(personaWork).filter(pw => Object.values(pw.stages).some(v => v > 0));
        if (activePersonas.length === 0) return null;

        activePersonas.forEach(pw => labels.push(pw.name));
        STAGE_DEFINITIONS.forEach(sd => {
            datasets.push({
                label: sd.name,
                data: activePersonas.map(pw => pw.stages[sd.key]),
                backgroundColor: sd.color + 'AA',
                borderRadius: 4
            });
        });

        return createChart(canvasId, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
                    y: { stacked: true, grid: { color: ChartDefaults.gridColor }, ticks: { stepSize: 1, font: { size: 11 } } }
                },
                plugins: { legend: { labels: { usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } } } }
            }
        });
    },

    // Line: Projects completed per month
    completionTrend(canvasId, projects) {
        const completed = projects.filter(p => p.status === 'completed' && p.updated_at);
        const monthly = {};
        completed.forEach(p => {
            const d = new Date(p.updated_at);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthly[key] = (monthly[key] || 0) + 1;
        });

        const sortedKeys = Object.keys(monthly).sort();
        if (sortedKeys.length === 0) {
            // Create placeholder with last 6 months
            const now = new Date();
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                if (!monthly[key]) monthly[key] = 0;
            }
        }

        const labels = Object.keys(monthly).sort().map(k => {
            const [y, m] = k.split('-');
            return new Date(y, m - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        });
        const data = Object.keys(monthly).sort().map(k => monthly[k]);

        return createChart(canvasId, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Projetos concluídos',
                    data,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#8b5cf6'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: ChartDefaults.gridColor }, ticks: { font: { size: 11 } } },
                    y: { grid: { color: ChartDefaults.gridColor }, ticks: { stepSize: 1, font: { size: 11 } }, beginAtZero: true }
                },
                plugins: { legend: { display: false } }
            }
        });
    },

    // Status overview (doughnut)
    projectStatus(canvasId, projects) {
        const counts = { active: 0, completed: 0, paused: 0, cancelled: 0 };
        projects.forEach(p => { if (counts.hasOwnProperty(p.status)) counts[p.status]++; });

        return createChart(canvasId, {
            type: 'doughnut',
            data: {
                labels: ['Ativos', 'Concluídos', 'Pausados', 'Cancelados'],
                datasets: [{
                    data: [counts.active, counts.completed, counts.paused, counts.cancelled],
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } } }
                }
            }
        });
    }
};
