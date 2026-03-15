import { useMemo } from 'react'
import { Users, CheckCircle, Clock, TrendingUp, Zap } from 'lucide-react'
import type { Lead } from '../lib/supabase'

interface MetricsViewProps {
  leads: Lead[]
}

export default function MetricsView({ leads }: MetricsViewProps) {
  const stats = useMemo(() => {
    const total = leads.length
    const qualified = leads.filter(l => l.stage_id >= 3).length // Qualificação ou +
    const sales = leads.filter(l => l.stage_id === 7).length // Ganho
    const hotLeads = leads.filter(l => (l.score || 0) >= 80).length
    
    // Fora do horário comercial (18:01 - 08:59)
    const offHours = leads.filter(l => {
      const date = new Date(l.created_at)
      const hour = date.getUTCHours() - 3 // Ajuste simplificado para Brasília (UTC-3)
      const localHour = hour < 0 ? hour + 24 : hour
      return localHour >= 18 || localHour < 9
    }).length

    const conversionRate = total > 0 ? ((sales / total) * 100).toFixed(1) : '0'

    return [
      { 
        label: 'Total de Leads', 
        value: total, 
        icon: Users, 
        color: 'var(--blue)', 
        bg: 'var(--blue-dim)',
        trend: '+12% este mês'
      },
      { 
        label: 'Atendimentos Feitos', 
        value: qualified, 
        icon: CheckCircle, 
        color: 'var(--green)', 
        bg: 'var(--green-dim)',
        trend: 'Taxa de qualificação'
      },
      { 
        label: 'Fora do Horário', 
        value: offHours, 
        icon: Clock, 
        color: 'var(--orange)', 
        bg: 'var(--orange-dim)',
        trend: 'Horário alternativo'
      },
      { 
        label: 'Leads Quentes', 
        value: hotLeads, 
        icon: Zap, 
        color: 'var(--purple)', 
        bg: 'var(--purple-dim)',
        trend: 'Score > 80'
      },
      { 
        label: 'Taxa de Conversão', 
        value: `${conversionRate}%`, 
        icon: TrendingUp, 
        color: 'var(--pink)', 
        bg: 'var(--pink-dim)',
        trend: 'Meta: 5%'
      }
    ]
  }, [leads])

  return (
    <div className="metrics-grid animate-fade">
      {stats.map((s, i) => (
        <div key={i} className="metric-card shadow-lg">
          <div className="metric-card-header">
            <div 
              className="metric-icon-wrap" 
              style={{ backgroundColor: s.bg }}
            >
              <s.icon size={20} color={s.color} />
            </div>
            <div className="trend-up" style={{ fontSize: '11px', fontWeight: 600 }}>
              {s.trend}
            </div>
          </div>
          <div className="metric-value">{s.value}</div>
          <div className="metric-label">{s.label}</div>
        </div>
      ))}

      {/* Conversion Progress Card */}
      <div className="metric-card shadow-lg" style={{ gridColumn: 'span 2' }}>
        <div className="metric-label" style={{ marginBottom: '12px' }}>Funil de Vendas - Conversão Geral</div>
        <div style={{ 
          height: '8px', 
          background: 'var(--bg-base)', 
          borderRadius: '99px',
          overflow: 'hidden'
        }}>
          <div style={{ 
            height: '100%', 
            width: `${parseFloat(stats[stats.length-1].value as string)}%`,
            background: 'var(--grad-main)',
            boxShadow: '0 0 10px var(--accent-glow)'
          }} />
        </div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginTop: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}>
          <span>0%</span>
          <span>Meta Mensal: 5.0%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  )
}
