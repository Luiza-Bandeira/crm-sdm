import { useState, useEffect } from 'react'
import { Calendar, Video, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function AgendaView() {
  const [meetings, setMeetings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMeetings()
  }, [])

  async function loadMeetings() {
    setLoading(true)
    const { data } = await supabase.from('meetings').select('*, leads(name, phone)').order('created_at', { ascending: false }).limit(50)
    if (data) setMeetings(data)
    setLoading(false)
  }

  function timeFormat(iso: string) {
    if (!iso) return 'Agendado na hora'
    return new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
  }

  return (
    <div className="animate-fade pipeline-page">
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={24} color="var(--accent)" /> Agenda de Reuniões (Sessões Grátis)
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Os links das sessões disparados pela Laura aparecem aqui.</p>
      </div>
      
      {loading ? (
         <div className="loading-state"><div className="spinner" /><span>Carregando agenda...</span></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {meetings.length === 0 && <div style={{ color: 'var(--text-muted)' }}>Nenhum agendamento registrado até o momento.</div>}
          
          {meetings.map((m: any) => (
            <div key={m.id} style={{
              background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
              padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>{m.leads?.name || m.leads?.phone || 'Desconhecido'}</strong>
                <span style={{ fontSize: '12px', background: 'var(--green-dim)', color: 'var(--green)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  {m.status}
                </span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <Clock size={12} /> {timeFormat(m.created_at)} (Criação do Link)
              </div>
              
              {m.meet_link && (
                <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                  <a href={m.meet_link} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>
                    <Video size={16} /> Entrar na Sessão
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
