import { useState, useEffect } from 'react'
import { Calendar as CalendarIcon, Video, Clock, User, ChevronLeft, ChevronRight, MoreVertical, LayoutGrid, List } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function AgendaView() {
  const [meetings, setMeetings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  useEffect(() => {
    loadMeetings()
  }, [])

  async function loadMeetings() {
    setLoading(true)
    const { data } = await supabase
      .from('meetings')
      .select('*, leads(name, phone, stage_id)')
      .order('created_at', { ascending: false })
      .limit(50)
    
    if (data) setMeetings(data)
    setLoading(false)
  }

  const nextMeeting = meetings.find(m => m.status === 'proposed' || m.status === 'confirmed')
  
  function formatDate(iso: string) {
    if (!iso) return 'Pendente'
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="agenda-dashboard animate-fade">
      
      {/* Header with Summary Stats */}
      <header className="agenda-header">
        <div className="header-main">
          <h1>Sessões e Agendamentos</h1>
          <p>Gerencie as reuniões demonstrativas geradas pela Laura.</p>
        </div>
        
        <div className="view-controls">
          <button className={`control-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}><LayoutGrid size={16} /></button>
          <button className={`control-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}><List size={16} /></button>
        </div>
      </header>

      <div className="agenda-layout">
        
        {/* Left Side: Next Meeting Highlight & Quick Calendar */}
        <aside className="agenda-sidebar">
          
          {nextMeeting && (
            <div className="next-meeting-card">
              <div className="card-lbl">PRÓXIMA REUNIÃO</div>
              <div className="next-info">
                <h3>{nextMeeting.leads?.name || 'Lead Interessado'}</h3>
                <div className="next-time">
                  <Clock size={14} /> {formatDate(nextMeeting.created_at)}
                </div>
              </div>
              <a href={nextMeeting.meet_link} target="_blank" rel="noreferrer" className="btn btn-primary btn-glow">
                <Video size={16} /> Entrar Agora
              </a>
            </div>
          )}

          <div className="mini-calendar">
             <div className="cal-header">
               <button className="cal-nav"><ChevronLeft size={16} /></button>
               <strong>Abril 2026</strong>
               <button className="cal-nav"><ChevronRight size={16} /></button>
             </div>
             <div className="cal-grid">
               {['D','S','T','Q','Q','S','S'].map(d => <span key={d} className="cal-day-lbl">{d}</span>)}
               {Array.from({length: 30}).map((_, i) => (
                 <button key={i} className={`cal-day ${i+1 === 2 ? 'active' : ''}`}>
                   {i+1}
                   {meetings.some(m => new Date(m.created_at).getDate() === i+1) && <div className="day-dot"></div>}
                 </button>
               ))}
             </div>
          </div>
        </aside>

        {/* Right Side: Main Schedule List */}
        <main className="agenda-main">
          <div className="schedule-header">
            <h3>Compromissos para <span className="text-accent">{selectedDate.toLocaleDateString('pt-BR', {day: 'numeric', month: 'long'})}</span></h3>
            <button className="btn btn-ghost btn-sm" onClick={loadMeetings}>Atualizar</button>
          </div>

          {loading ? (
            <div className="loading-state h-full">
              <div className="spinner"></div>
              <span>Sincronizando agenda...</span>
            </div>
          ) : (
            <div className={`meetings-container ${viewMode}`}>
              {meetings.length === 0 ? (
                <div className="no-data">Nenhuma reunião encontrada para este período.</div>
              ) : (
                meetings.map(m => (
                  <div key={m.id} className="meeting-item animate-slide">
                    <div className="m-time-col">
                      <div className="m-hour">{new Date(m.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</div>
                      <div className="m-status-pill">{m.status}</div>
                    </div>
                    
                    <div className="m-content">
                      <div className="m-lead-info">
                        <div className="m-avatar"><User size={20} /></div>
                        <div>
                          <h4>{m.leads?.name || 'Lead sem Nome'}</h4>
                          <p>{m.leads?.phone}</p>
                        </div>
                      </div>
                      
                      <div className="m-actions">
                        <a href={m.meet_link} target="_blank" rel="noreferrer" className="btn btn-ghost icon-only" title="Link da Reunião">
                          <Video size={16} />
                        </a>
                        <button className="btn btn-ghost icon-only"><MoreVertical size={16} /></button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </main>

      </div>

      <style>{`
        .agenda-dashboard { display: flex; flex-direction: column; gap: 32px; height: 100%; }
        
        .agenda-header { display: flex; justify-content: space-between; align-items: flex-end; }
        .header-main h1 { font-size: 28px; font-weight: 800; margin-bottom: 4px; letter-spacing: -0.5px; }
        .header-main p { color: var(--text-muted); font-size: 14px; }
        
        .view-controls { display: flex; background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 4px; border-radius: 12px; }
        .control-btn { border: 0; background: transparent; color: var(--text-muted); width: 32px; height: 32px; border-radius: 8px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
        .control-btn.active { background: var(--border); color: #fff; }

        .agenda-layout { display: grid; grid-template-columns: 320px 1fr; gap: 32px; flex: 1; min-height: 0; }
        
        /* SIDEBAR */
        .agenda-sidebar { display: flex; flex-direction: column; gap: 24px; }
        
        .next-meeting-card {
           background: var(--grad-main); padding: 24px; border-radius: 20px;
           box-shadow: 0 20px 40px var(--accent-glow); display: flex; flex-direction: column; gap: 20px;
        }
        .card-lbl { font-size: 10px; font-weight: 800; letter-spacing: 1px; color: rgba(255,255,255,0.7); }
        .next-info h3 { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 4px; }
        .next-time { display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(255,255,255,0.9); }
        .btn-glow:hover { box-shadow: 0 0 30px #fff; transform: translateY(-2px); }

        .mini-calendar { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; padding: 20px; }
        .cal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-size: 14px; }
        .cal-nav { border: 0; background: transparent; color: var(--text-muted); cursor: pointer; }
        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; }
        .cal-day-lbl { font-size: 10px; font-weight: 700; color: var(--text-muted); padding: 8px 0; }
        .cal-day {
           border: 0; background: transparent; color: var(--text-secondary);
           font-size: 12px; font-weight: 500; height: 32px; border-radius: 8px;
           cursor: pointer; position: relative; display: flex; align-items: center; justify-content: center;
        }
        .cal-day:hover { background: var(--bg-hover); }
        .cal-day.active { background: var(--accent); color: #fff; font-weight: 700; }
        .day-dot { position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; background: var(--accent-light); border-radius: 50%; }

        /* MAIN SCHEDULE */
        .agenda-main { display: flex; flex-direction: column; gap: 20px; min-height: 0; }
        .schedule-header { display: flex; justify-content: space-between; align-items: center; }
        .schedule-header h3 { font-size: 18px; font-weight: 700; }
        
        .meetings-container { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; padding-right: 8px; }
        .meeting-item {
           background: var(--bg-card); border: 1px solid var(--border);
           border-radius: 16px; padding: 16px 24px; display: flex; align-items: center; gap: 24px;
           transition: var(--transition);
        }
        .meeting-item:hover { border-color: var(--border-bright); transform: translateX(4px); }
        
        .m-time-col { border-right: 1px solid var(--border); padding-right: 24px; min-width: 100px; }
        .m-hour { font-size: 18px; font-weight: 800; color: #fff; line-height: 1; margin-bottom: 6px; }
        .m-status-pill { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--green); }
        
        .m-content { flex: 1; display: flex; justify-content: space-between; align-items: center; }
        .m-lead-info { display: flex; align-items: center; gap: 16px; }
        .m-avatar { width: 44px; height: 44px; background: var(--bg-hover); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
        .m-lead-info h4 { font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 2px; }
        .m-lead-info p { font-size: 13px; color: var(--text-muted); }
        
        .m-actions { display: flex; gap: 8px; }

        .meetings-container.grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        }
        .grid .meeting-item { flex-direction: column; align-items: flex-start; gap: 16px; }
        .grid .m-time-col { border-right: 0; border-bottom: 1px solid var(--border); padding: 0 0 16px; width: 100%; display: flex; justify-content: space-between; align-items: center; }
        .grid .m-content { width: 100%; }

        .no-data { padding: 80px 0; text-align: center; color: var(--text-muted); border: 1px dashed var(--border); border-radius: 20px; }
      `}</style>
    </div>
  )
}
