/* ==========================================
   INSIGHTS ENGINE
   ========================================== */

const InsightsEngine = {
    generate(projects) {
        const insights = [];
        const active = projects.filter(p => p.status === 'active');
        const completed = projects.filter(p => p.status === 'completed');

        this._capacityInsight(active, completed, insights);
        this._bottleneckInsight(active, completed, insights);
        this._overdueInsight(active, insights);
        this._copywriterInsight(completed, insights);
        this._personaPerformance(completed, insights);
        this._avgDurationInsight(completed, insights);

        return insights;
    },

    _capacityInsight(active, completed, insights) {
        const activeCount = active.length;
        if (completed.length >= 2) {
            const durations = completed.map(p => {
                const stages = (p.stages || []).filter(s => s.status === 'completed');
                if (stages.length < 2) return null;
                const dates = stages.map(s => new Date(s.completed_date || s.deadline)).filter(d => !isNaN(d));
                if (dates.length < 2) return null;
                const first = new Date(p.contract_date || p.created_at);
                const last = Math.max(...dates);
                return Math.ceil((last - first) / (1000 * 60 * 60 * 24));
            }).filter(Boolean);

            if (durations.length > 0) {
                const avgDays = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
                const maxParallel = Math.max(3, Math.ceil(avgDays / 7));
                const canTakeMore = activeCount < maxParallel;
                insights.push({
                    type: canTakeMore ? 'positive' : 'warning',
                    title: canTakeMore ? 'Capacidade disponível' : 'Atenção à capacidade',
                    text: `Você tem ${activeCount} projeto(s) ativo(s). Com média de ${avgDays} dias por projeto, a recomendação é no máximo ${maxParallel} projetos simultâneos. ${canTakeMore ? `Pode aceitar mais ${maxParallel - activeCount} projeto(s).` : 'Considere finalizar projetos antes de aceitar novos.'}`,
                    icon: canTakeMore ? '✅' : '⚠️'
                });
            }
        } else {
            insights.push({
                type: 'info',
                title: 'Dados insuficientes',
                text: `Conclua mais projetos para receber recomendações de capacidade. Atualmente: ${activeCount} ativo(s).`,
                icon: 'ℹ️'
            });
        }
    },

    _bottleneckInsight(active, completed, insights) {
        const allProjects = [...active, ...completed].filter(p => p.stages);
        const stageDelays = {};
        STAGE_DEFINITIONS.forEach(sd => { stageDelays[sd.key] = []; });

        allProjects.forEach(p => {
            (p.stages || []).forEach(s => {
                if (s.status === 'completed' && s.deadline && s.completed_date) {
                    const delay = daysBetween(s.deadline, s.completed_date);
                    if (delay !== null) stageDelays[s.stage_key]?.push(delay);
                }
            });
        });

        let worstStage = null, worstAvg = 0;
        Object.entries(stageDelays).forEach(([key, delays]) => {
            if (delays.length >= 2) {
                const avg = delays.reduce((a, b) => a + b, 0) / delays.length;
                if (avg > worstAvg) { worstAvg = avg; worstStage = key; }
            }
        });

        if (worstStage && worstAvg > 0) {
            const def = getStageDefinition(worstStage);
            insights.push({
                type: 'warning',
                title: 'Gargalo identificado',
                text: `A etapa "${def.name}" tem atraso médio de ${Math.round(worstAvg)} dia(s). Considere reforçar essa área ou rever os prazos.`,
                icon: '🔍'
            });
        }
    },

    _overdueInsight(active, insights) {
        let overdueCount = 0;
        active.forEach(p => {
            (p.stages || []).forEach(s => {
                if (s.status !== 'completed' && s.status !== 'skipped' && s.deadline) {
                    const d = daysUntilDeadline(s.deadline);
                    if (d !== null && d < 0) overdueCount++;
                }
            });
        });

        if (overdueCount > 0) {
            insights.push({
                type: 'negative',
                title: 'Etapas atrasadas',
                text: `Existem ${overdueCount} etapa(s) atrasada(s) nos projetos ativos. Priorize a resolução para evitar efeito cascata.`,
                icon: '🚨'
            });
        }
    },

    _copywriterInsight(completed, insights) {
        const withCopy = completed.filter(p => (p.stages || []).some(s => s.stage_key === 'copywriter' && s.status === 'completed'));
        const withoutCopy = completed.filter(p => (p.stages || []).some(s => s.stage_key === 'copywriter' && s.status === 'skipped'));

        if (withCopy.length >= 2 && withoutCopy.length >= 2) {
            const avgWith = this._avgProjectDays(withCopy);
            const avgWithout = this._avgProjectDays(withoutCopy);
            if (avgWith && avgWithout) {
                const diff = avgWith - avgWithout;
                if (Math.abs(diff) > 2) {
                    const faster = diff > 0 ? 'sem Copywriter interno' : 'com Copywriter interno';
                    insights.push({
                        type: 'info',
                        title: 'Análise de Copywriter',
                        text: `Projetos ${faster} terminam em média ${Math.abs(Math.round(diff))} dia(s) mais rápido.`,
                        icon: '📝'
                    });
                }
            }
        }
    },

    _personaPerformance(completed, insights) {
        const personaStats = {};
        completed.forEach(p => {
            (p.stages || []).forEach(s => {
                if (s.persona && s.status === 'completed' && s.deadline && s.completed_date) {
                    if (!personaStats[s.persona.id]) personaStats[s.persona.id] = { name: s.persona.name, diffs: [] };
                    const diff = daysBetween(s.deadline, s.completed_date);
                    if (diff !== null) personaStats[s.persona.id].diffs.push(diff);
                }
            });
        });

        let bestPersona = null, bestAvg = Infinity;
        Object.values(personaStats).forEach(ps => {
            if (ps.diffs.length >= 2) {
                const avg = ps.diffs.reduce((a, b) => a + b, 0) / ps.diffs.length;
                if (avg < bestAvg) { bestAvg = avg; bestPersona = ps; }
            }
        });

        if (bestPersona && bestAvg < 0) {
            insights.push({
                type: 'positive',
                title: 'Destaque de performance',
                text: `${bestPersona.name} entrega em média ${Math.abs(Math.round(bestAvg))} dia(s) antes do prazo. Excelente!`,
                icon: '⭐'
            });
        }
    },

    _avgDurationInsight(completed, insights) {
        if (completed.length < 3) return;
        const avg = this._avgProjectDays(completed);
        if (avg) {
            insights.push({
                type: 'info',
                title: 'Tempo médio de projetos',
                text: `Seus projetos concluídos levam em média ${Math.round(avg)} dias do início ao Go-live.`,
                icon: '📊'
            });
        }
    },

    _avgProjectDays(projects) {
        const durations = projects.map(p => {
            const stages = (p.stages || []).filter(s => s.status === 'completed').sort((a, b) => a.sort_order - b.sort_order);
            if (stages.length < 2) return null;
            const first = stages[0].start_date || p.contract_date;
            const last = stages[stages.length - 1].completed_date;
            if (!first || !last) return null;
            return daysBetween(first, last);
        }).filter(Boolean);
        if (durations.length === 0) return null;
        return durations.reduce((a, b) => a + b, 0) / durations.length;
    }
};
