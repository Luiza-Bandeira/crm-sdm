import { useState, useEffect } from 'react'
import { 
  Calendar as CalendarIcon, Video, Clock, User, ChevronLeft, ChevronRight, 
  Plus, Trash2, Edit2, Check, X, CalendarDays, CalendarRange, CalendarCheck, MoreVertical
} from 'lucide-react'
import { supabase } from '../lib/supabase'

interface AvailabilitySlot {
  id: string
  day_of_week: number | null
  specific_date: string | null
  start_time: string
  end_time: string
}

interface Meeting {
  id: string
  lead_id: string
  meet_link: string
  status: string
  created_at: string
  leads?: { name: string; phone: string }
}

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const HOURS = Array.from({ length: 15 }, (_, i) => i + 8) // 08:00 to 22:00

type ViewMode = 'mensal' | 'semanal' | 'diario'

export default function AgendaView() {
  const [viewMode, setViewMode] = useState<ViewMode>('mensal')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  
  // Slot Form State
  const [showSlotForm, setShowSlotForm] = useState(false)
  const [editingSlot, setEditingSlot] = useState<AvailabilitySlot | null>(null)
  const [newSlotType, setNewSlotType] = useState<'recurring' | 'specific'>('recurring')
  const [newDay, setNewDay] = useState(1)
  const [newDate, setNewDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [slotsRes, meetingsRes] = await Promise.all([
      supabase.from('availability_slots').select('*'),
      supabase.from('meetings').select('*, leads(name, phone)').order('created_at', { ascending: false })
    ])
    
    if (slotsRes.data) setSlots(slotsRes.data)
    if (meetingsRes.data) setMeetings(meetingsRes.data as Meeting[])
    setLoading(false)
  }

  async function handleSaveSlot() {
    const payload = {
      day_of_week: newSlotType === 'recurring' ? newDay : null,
      specific_date: newSlotType === 'specific' ? newDate : null,
      start_time: startTime,
      end_time: endTime
    }

    if (newSlotType === 'specific' && !newDate) return

    if (editingSlot) {
      const { data } = await supabase.from('availability_slots').update(payload).eq('id', editingSlot.id).select().single()
      if (data) setSlots(prev => prev.map(s => s.id === data.id ? data : s))
    } else {
      const { data } = await supabase.from('availability_slots').insert(payload).select().single()
      if (data) setSlots(prev => [...prev, data])
    }
    
    resetForm()
  }

  async function handleDeleteSlot(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta janela de atendimento?')) return
    await supabase.from('availability_slots').delete().eq('id', id)
    setSlots(prev => prev.filter(s => s.id !== id))
    resetForm()
  }

  function resetForm() {
    setShowSlotForm(false)
    setEditingSlot(null)
    setNewDate('')
    setStartTime('09:00')
    setEndTime('10:00')
  }

  function openEdit(slot: AvailabilitySlot) {
    setEditingSlot(slot)
    setNewSlotType(slot.specific_date ? 'specific' : 'recurring')
    if (slot.day_of_week !== null) setNewDay(slot.day_of_week)
    if (slot.specific_date) setNewDate(slot.specific_date)
    setStartTime(slot.start_time)
    setEndTime(slot.end_time)
    setShowSlotForm(true)
  }

  // Navigation logic
  const navigate = (dir: number) => {
    const next = new Date(currentDate)
    if (viewMode === 'mensal') next.setMonth(next.getMonth() + dir)
    else if (viewMode === 'semanal') next.setDate(next.getDate() + (dir * 7))
    else next.setDate(next.getDate() + dir)
    setCurrentDate(next)
  }

  // Helpers for Monthly View
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
  const getStartDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay()

  const renderMonth = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = getDaysInMonth(year, month)
    const startDay = getStartDayOfMonth(year, month)
    const today = new Date()
    
    const calendarDays = []
    for (let i = 0; i < startDay; i++) calendarDays.push(<div key={`pad-${i}`} className="cal-cell empty"></div>)
    
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = today.getDate() === d && today.getMonth() === month && today.getFullYear() === year
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayOfWeek = (startDay + d - 1) % 7
      
      const daySlots = slots.filter(s => (s.day_of_week === dayOfWeek) || (s.specific_date === dateStr))
      const dayMeetings = meetings.filter(m => {
        const mDate = new Date(m.created_at)
        return mDate.getDate() === d && mDate.getMonth() === month && mDate.getFullYear() === year
      })

      calendarDays.push(
        <div key={d} className={`cal-cell ${isToday ? 'is-today' : ''}`} onClick={() => { setNewSlotType('specific'); setNewDate(dateStr); setShowSlotForm(true); }}>
          <span className="day-num">{d}</span>
          <div className="day-indicators">
            {daySlots.map(s => <div key={s.id} className="indicator slot" onClick={(e) => { e.stopPropagation(); openEdit(s); }}></div>)}
            {dayMeetings.map(m => <div key={m.id} className="indicator meeting" title={m.leads?.name}></div>)}
          </div>
        </div>
      )
    }
    return <div className="month-grid">{DAYS.map(d => <div key={d} className="grid-header">{d.substring(0,3)}</div>)}{calendarDays}</div>
  }

  const renderWeek = () => {
    const startOfWeek = new Date(currentDate)
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay())
    
    const weekDays = Array.from({length: 7}).map((_, i) => {
        const d = new Date(startOfWeek)
        d.setDate(startOfWeek.getDate() + i)
        return d
    })

    return (
        <div className="week-view">
            <div className="time-col">
                <div className="time-header">Hora</div>
                {HOURS.map(h => <div key={h} className="time-label">{String(h).padStart(2, '0')}:00</div>)}
            </div>
            <div className="week-grid">
                {weekDays.map((d, i) => (
                    <div key={i} className="week-day-col">
                        <div className={`week-header ${d.toDateString() === new Date().toDateString() ? 'today' : ''}`}>
                            <span className="w-day-name">{DAYS[i].substring(0,3)}</span>
                            <span className="w-day-num">{d.getDate()}</span>
                        </div>
                        <div className="week-cells">
                            {HOURS.map(h => {
                                const hourStr = `${String(h).padStart(2, '0')}:00`
                                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                                
                                const slotAtHour = slots.find(s => 
                                    ((s.day_of_week === i) || (s.specific_date === dateStr)) &&
                                    (s.start_time <= hourStr && s.end_time > hourStr)
                                )

                                const meetingAtHour = meetings.find(m => {
                                    const mDate = new Date(m.created_at)
                                    return mDate.toDateString() === d.toDateString() && mDate.getHours() === h
                                })

                                return (
                                    <div key={h} className="week-cell" onClick={() => { 
                                        setNewSlotType('specific'); 
                                        setNewDate(dateStr); 
                                        setStartTime(`${String(h).padStart(2, '0')}:00`);
                                        setShowSlotForm(true); 
                                    }}>
                                        {slotAtHour && <div className="week-indicator slot" onClick={(e) => { e.stopPropagation(); openEdit(slotAtHour); }}>Livre</div>}
                                        {meetingAtHour && <div className="week-indicator meeting">Sessão: {meetingAtHour.leads?.name}</div>}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
  }

  const renderDay = () => {
    const todayStr = currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
    
    return (
        <div className="day-view">
            <div className="day-header-main">
                <h3>{todayStr}</h3>
            </div>
            <div className="day-timeline">
                {HOURS.map(h => {
                    const hourStr = `${String(h).padStart(2, '0')}:00`
                    const slotAtHour = slots.find(s => 
                        ((s.day_of_week === currentDate.getDay()) || (s.specific_date === dateStr)) &&
                        (s.start_time <= hourStr && s.end_time > hourStr)
                    )
                    const meetingAtHour = meetings.find(m => {
                        const mDate = new Date(m.created_at)
                        return mDate.toDateString() === currentDate.toDateString() && mDate.getHours() === h
                    })

                    return (
                        <div key={h} className="day-row" onClick={() => { setNewSlotType('specific'); setNewDate(dateStr); setStartTime(hourStr); setShowSlotForm(true); }}>
                            <div className="row-time">{hourStr}</div>
                            <div className="row-content">
                                {slotAtHour && <div className="day-block slot" onClick={(e) => { e.stopPropagation(); openEdit(slotAtHour); }}>Janela de Atendimento Ativa</div>}
                                {meetingAtHour && (
                                    <div className="day-block meeting">
                                        <Video size={14} /> Reunião com <strong>{meetingAtHour.leads?.name}</strong>
                                        <a href={meetingAtHour.meet_link} target="_blank" rel="noreferrer" className="row-link" onClick={e => e.stopPropagation()}>Acessar Sala</a>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
  }

  return (
    <div className="agenda-container animate-fade">
      
      <div className="agenda-top">
        <div className="top-title">
          <h1>Agenda & Disponibilidade</h1>
          <p>Coordene as janelas de atendimento da Laura e acompanhe suas sessões.</p>
        </div>

        <div className="view-selector">
          <button className={viewMode === 'mensal' ? 'active' : ''} onClick={() => setViewMode('mensal')}><CalendarDays size={16} /> Mensal</button>
          <button className={viewMode === 'semanal' ? 'active' : ''} onClick={() => setViewMode('semanal')}><CalendarRange size={16} /> Semanal</button>
          <button className={viewMode === 'diario' ? 'active' : ''} onClick={() => setViewMode('diario')}><CalendarCheck size={16} /> Diário</button>
        </div>
      </div>

      <div className="agenda-card glass">
        
        <div className="cal-controls">
          <div className="curr-month">
            <h2>
                {viewMode === 'mensal' ? `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}` : 
                 viewMode === 'semanal' ? `Semana de ${currentDate.getDate()} de ${MONTHS[currentDate.getMonth()]}` :
                 `${currentDate.getDate()} de ${MONTHS[currentDate.getMonth()]}`}
            </h2>
            <div className="nav-btns">
              <button onClick={() => navigate(-1)}><ChevronLeft size={20} /></button>
              <button onClick={() => setCurrentDate(new Date())}>Hoje</button>
              <button onClick={() => navigate(1)}><ChevronRight size={20} /></button>
            </div>
          </div>

          <button className="btn btn-primary" onClick={() => setShowSlotForm(true)}>
             <Plus size={18} /> Novo Horário
          </button>
        </div>

        <div className="cal-content">
            {loading ? <div className="cal-loading"><div className="spinner"></div></div> : (
                viewMode === 'mensal' ? renderMonth() :
                viewMode === 'semanal' ? renderWeek() :
                renderDay()
            )}
        </div>

        <div className="agenda-legend">
          <div className="leg-item"><div className="dot slot"></div><span>Livre (Janela)</span></div>
          <div className="leg-item"><div className="dot meeting"></div><span>Agendado (Lead)</span></div>
        </div>
      </div>

      {/* SLOT FORM MODAL */}
      {showSlotForm && (
        <div className="slot-modal-overlay" onClick={resetForm}>
          <div className="slot-modal animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-top">
              <h3>{editingSlot ? 'Editar Janela de Atendimento' : 'Disponibilizar Horário'}</h3>
              <button onClick={resetForm} className="btn-ghost icon-only"><X size={20} /></button>
            </div>

            <div className="modal-form">
              <div className="type-toggle-group">
                <button className={newSlotType === 'recurring' ? 'active' : ''} onClick={() => setNewSlotType('recurring')}>Recorrente</button>
                <button className={newSlotType === 'specific' ? 'active' : ''} onClick={() => setNewSlotType('specific')}>Data Única</button>
              </div>

              <div className="form-grid">
                {newSlotType === 'recurring' ? (
                  <div className="field">
                    <label>Toda(o)...</label>
                    <select value={newDay} onChange={e => setNewDay(parseInt(e.target.value))}>
                      {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="field">
                    <label>No dia...</label>
                    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
                  </div>
                )}

                <div className="time-row">
                    <div className="field">
                      <label>Das</label>
                      <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Até às</label>
                      <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                    </div>
                </div>
              </div>
              
              <div className="modal-actions">
                {editingSlot && (
                  <button className="alert-btn" onClick={() => handleDeleteSlot(editingSlot.id)}><Trash2 size={16} /> Excluir permanentemente</button>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
                  <button className="btn btn-ghost" onClick={resetForm}>Cancelar</button>
                  <button className="btn btn-primary" onClick={handleSaveSlot}><Check size={16} /> Salvar Configuração</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .agenda-container { display: flex; flex-direction: column; gap: 24px; padding: 10px; height: 100%; overflow: hidden; }
        .agenda-top { display: flex; justify-content: space-between; align-items: flex-end; }
        .top-title h1 { font-size: 24px; font-weight: 800; }
        .view-selector { display: flex; gap: 4px; background: rgba(0,0,0,0.2); padding: 4px; border-radius: 12px; border: 1px solid var(--border); }
        .view-selector button { border: 0; background: transparent; color: var(--text-secondary); display: flex; align-items: center; gap: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 8px; transition: 0.2s; }
        .view-selector button.active { background: var(--bg-hover); color: #fff; }

        .agenda-card { flex: 1; display: flex; flex-direction: column; border-radius: 24px; padding: 0; overflow: hidden; border: 1px solid var(--border); }
        .cal-controls { padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); }
        .curr-month h2 { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
        .nav-btns { display: flex; gap: 8px; }
        .nav-btns button { border: 0; background: var(--bg-hover); color: var(--text-primary); border-radius: 8px; padding: 6px 12px; font-size: 11px; cursor: pointer; }
        
        .cal-content { flex: 1; overflow-y: auto; background: rgba(0,0,0,0.1); }

        /* MONTH */
        .month-grid { display: grid; grid-template-columns: repeat(7, 1fr); height: 100%; min-height: 600px; }
        .grid-header { padding: 12px; text-align: center; font-size: 10px; font-weight: 800; color: var(--text-muted); border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); }
        .cal-cell { min-height: 110px; padding: 12px; border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); cursor: pointer; transition: 0.2s; }
        .cal-cell:hover { background: rgba(255,255,255,0.02); }
        .cal-cell.is-today { background: var(--accent-dim); }
        .day-num { font-size: 14px; font-weight: 600; color: var(--text-secondary); }
        .day-indicators { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
        .indicator { height: 6px; border-radius: 3px; }
        .indicator.slot { background: var(--accent-light); opacity: 0.5; border: 1px dashed white; }
        .indicator.meeting { background: var(--grad-main); }

        /* WEEK */
        .week-view { display: flex; height: 100%; min-height: 800px; }
        .time-col { width: 60px; border-right: 1px solid var(--border); background: rgba(0,0,0,0.2); }
        .time-header { height: 60px; }
        .time-label { height: 50px; font-size: 10px; color: var(--text-muted); text-align: center; padding-top: 8px; }
        .week-grid { flex: 1; display: grid; grid-template-columns: repeat(7, 1fr); }
        .week-day-col { border-right: 1px solid var(--border); }
        .week-header { height: 60px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-bottom: 1px solid var(--border); }
        .week-header.today { color: var(--accent-light); }
        .w-day-name { font-size: 10px; font-weight: 800; text-transform: uppercase; }
        .w-day-num { font-size: 18px; font-weight: 700; }
        .week-cells { display: flex; flex-direction: column; }
        .week-cell { height: 50px; border-bottom: 1px solid rgba(255,255,255,0.03); padding: 2px; cursor: pointer; }
        .week-cell:hover { background: rgba(255,255,255,0.02); }
        .week-indicator { height: 100%; border-radius: 4px; font-size: 9px; padding: 4px; overflow: hidden; font-weight: 700; }
        .week-indicator.slot { background: var(--accent-dim); color: var(--accent-light); border: 1px dashed var(--accent-light); }
        .week-indicator.meeting { background: var(--grad-main); color: #fff; }

        /* DAY */
        .day-view { padding: 32px; max-width: 800px; margin: 0 auto; }
        .day-header-main { margin-bottom: 32px; border-bottom: 2px solid var(--border); padding-bottom: 16px; }
        .day-timeline { display: flex; flex-direction: column; }
        .day-row { display: flex; align-items: flex-start; padding: 20px 0; border-bottom: 1px solid var(--border); cursor: pointer; transition: 0.2s; }
        .day-row:hover { background: rgba(255,255,255,0.01); }
        .row-time { width: 80px; font-size: 14px; font-weight: 700; color: var(--text-muted); }
        .row-content { flex: 1; min-height: 40px; }
        .day-block { padding: 12px 20px; border-radius: 12px; font-size: 13px; display: flex; align-items: center; gap: 10px; }
        .day-block.slot { background: var(--bg-card); border: 1px dashed var(--accent-light); color: var(--accent-light); }
        .day-block.meeting { background: var(--grad-main); color: #fff; box-shadow: 0 4px 20px var(--accent-glow); }
        .row-link { margin-left: auto; background: #fff; color: var(--accent); padding: 4px 12px; border-radius: 6px; text-decoration: none; font-size: 11px; font-weight: 800; }

        .agenda-legend { padding: 16px 32px; display: flex; gap: 24px; border-top: 1px solid var(--border); background: rgba(255,255,255,0.02); }
        .leg-item { display: flex; align-items: center; gap: 8px; font-size: 11px; }
        .dot { width: 8px; height: 8px; border-radius: 50%; }
        .dot.slot { background: var(--accent-dim); border: 1px dashed var(--accent-light); }
        .dot.meeting { background: var(--accent); }

        .slot-modal-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); z-index: 100; display: flex; align-items: center; justify-content: center; }
        .slot-modal { background: #0c0c14; border: 1px solid var(--border-bright); width: 100%; max-width: 480px; border-radius: 28px; box-shadow: var(--shadow); }
        .modal-top { padding: 24px 32px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .modal-form { padding: 32px; display: flex; flex-direction: column; gap: 24px; }
        .alert-btn { border: 0; background: transparent; color: var(--red); font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; }

        @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>
    </div>
  )
}
