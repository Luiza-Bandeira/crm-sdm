import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, LogOut, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lead, PipelineStage } from '../lib/supabase'
import KpiHeader from '../components/KpiHeader'
import KanbanBoard from '../components/KanbanBoard'
import LeadModal from '../components/LeadModal'

const STAGES_COLORS: Record<number, string> = {
  1: '#94a3b8', 2: '#3b82f6', 3: '#f59e0b', 4: '#8b5cf6',
  5: '#ec4899', 6: '#f97316', 7: '#22c55e', 8: '#ef4444',
}

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(new Date())

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    const [{ data: stagesData }, { data: leadsData }] = await Promise.all([
      supabase.from('pipeline_stages').select('*').order('order_index'),
      supabase.from('crm_leads_view').select('*').order('created_at', { ascending: false }),
    ])

    if (stagesData) setStages(stagesData as PipelineStage[])
    if (leadsData) {
      const enriched = (leadsData as Lead[]).map(l => ({
        ...l,
        stage_color: STAGES_COLORS[l.stage_id] || '#6366f1',
      }))
      setLeads(enriched)
    }

    setLoading(false)
    setRefreshing(false)
    setLastUpdated(new Date())
  }, [])

  useEffect(() => {
    loadData()

    // Auto-refresh every 30s
    const interval = setInterval(() => loadData(true), 30000)
    return () => clearInterval(interval)
  }, [loadData])

  async function handleStageChange(leadId: string, stageId: number) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: stageId, stage_color: STAGES_COLORS[stageId] } : l))
    await supabase.from('leads').update({ stage_id: stageId }).eq('id', leadId)
  }

  function handleLeadUpdate(updated: Lead) {
    const enriched = { ...updated, stage_color: STAGES_COLORS[updated.stage_id] || '#6366f1' }
    setLeads(prev => prev.map(l => l.id === updated.id ? enriched : l))
    if (selectedLead?.id === updated.id) setSelectedLead(enriched)
  }

  function handleLeadDelete(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id))
    setSelectedLead(null)
  }

  const filteredLeads = leads.filter(l =>
    !search ||
    l.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.phone?.includes(search)
  )

  const lastUpdatedStr = lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="dashboard">
      {/* Top Bar */}
      <header className="topbar glass">
        <div className="topbar-left">
          <div className="topbar-logo">
            <Zap size={18} color="var(--accent)" />
            <span>CRM <strong>Seu Dinheiro na Mesa</strong></span>
          </div>
          <div className="search-wrap">
            <Search size={14} className="search-icon" />
            <input
              className="search-input"
              placeholder="Buscar lead por nome ou telefone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="topbar-right">
          <span className="last-updated">atualizado às {lastUpdatedStr}</span>
          <button className={`btn btn-ghost refresh-btn ${refreshing ? 'spinning' : ''}`} onClick={() => loadData(true)}>
            <RefreshCw size={14} />Atualizar
          </button>
        </div>
      </header>

      {/* KPIs */}
      <div className="dashboard-kpis">
        <KpiHeader leads={filteredLeads} />
      </div>

      {/* Kanban */}
      <div className="dashboard-board">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>Carregando leads...</span>
          </div>
        ) : (
          <KanbanBoard
            stages={stages}
            leads={filteredLeads}
            onLeadClick={setSelectedLead}
            onStageChange={handleStageChange}
          />
        )}
      </div>

      {/* Lead Modal */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          stages={stages}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleLeadUpdate}
          onDelete={handleLeadDelete}
        />
      )}

      <style>{`
        .dashboard {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
          background: var(--bg-base);
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          border-bottom: 1px solid var(--border);
          gap: 16px;
          flex-shrink: 0;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .topbar-left { display: flex; align-items: center; gap: 20px; flex: 1; }
        .topbar-logo { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text-secondary); white-space: nowrap; }
        .topbar-logo strong { color: var(--text-primary); }
        .search-wrap { position: relative; flex: 1; max-width: 400px; }
        .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
        .search-input { padding-left: 32px !important; }
        .topbar-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .last-updated { font-size: 11px; color: var(--text-muted); }
        .refresh-btn { transition: var(--transition); }
        .refresh-btn.spinning svg { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .dashboard-kpis { padding: 16px 0 12px; flex-shrink: 0; }
        .dashboard-board { flex: 1; overflow-y: hidden; overflow-x: auto; }
        .loading-state {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 12px; height: 100%;
          color: var(--text-muted); font-size: 13px;
        }
        .spinner {
          width: 32px; height: 32px; border-radius: 50%;
          border: 3px solid var(--border);
          border-top-color: var(--accent);
          animation: spin 0.8s linear infinite;
        }
      `}</style>
    </div>
  )
}
