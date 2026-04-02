import { useState, useEffect } from 'react'
import { X, Save, Settings, Plus, Trash2, Calendar, Clock, User, Bell, ShieldCheck, Globe } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface AvailabilitySlot {
  id: string
  day_of_week: number | null
  specific_date: string | null
  start_time: string
  end_time: string
}

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

type Tab = 'geral' | 'agenda' | 'consultor'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('geral')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form states for new slot
  const [type, setType] = useState<'recurring' | 'specific'>('recurring')
  const [newDay, setNewDay] = useState(1)
  const [newDate, setNewDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    const [settingsRes, slotsRes] = await Promise.all([
      supabase.from('scheduling_settings').select('*').maybeSingle(),
      supabase.from('availability_slots').select('*').order('day_of_week', { ascending: true }).order('specific_date', { ascending: true })
    ])

    if (settingsRes.data) {
      setPhone(settingsRes.data.consultant_phone || '')
      setName(settingsRes.data.consultant_name || '')
    }
    if (slotsRes.data) setSlots(slotsRes.data as AvailabilitySlot[])
    setLoading(false)
  }

  async function handleSaveSettings() {
    setSaving(true)
    const { data } = await supabase.from('scheduling_settings').select('id').maybeSingle()
    const payload = { 
      consultant_phone: phone, 
      consultant_name: name,
      agent_enabled: true 
    }

    if (data) {
      await supabase.from('scheduling_settings').update(payload).eq('id', data.id)
    } else {
      await supabase.from('scheduling_settings').insert(payload)
    }
    setSaving(false)
  }

  async function handleAddSlot() {
    const payload = {
      day_of_week: type === 'recurring' ? newDay : null,
      specific_date: type === 'specific' ? newDate : null,
      start_time: startTime,
      end_time: endTime
    }

    if (type === 'specific' && !newDate) return

    const { data } = await supabase.from('availability_slots').insert(payload).select().single()
    if (data) {
      setSlots(prev => [...prev, data as AvailabilitySlot].sort((a,b) => (a.day_of_week ?? 99) - (b.day_of_week ?? 99)))
      setNewDate('')
    }
  }

  async function handleDeleteSlot(id: string) {
    await supabase.from('availability_slots').delete().eq('id', id)
    setSlots(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-modal animate-fade" onClick={e => e.stopPropagation()}>
        
        {/* Sidebar Nav */}
        <aside className="settings-sidebar">
          <div className="sidebar-header">
            <Settings className="text-accent" size={24} />
            <div>
              <h3>Configurações</h3>
              <span>Laura CRM v3.2</span>
            </div>
          </div>
          
          <nav className="sidebar-nav">
            <button className={`nav-btn ${activeTab === 'geral' ? 'active' : ''}`} onClick={() => setActiveTab('geral')}>
              <Globe size={18} /> Geral
            </button>
            <button className={`nav-btn ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')}>
              <Calendar size={18} /> Agenda da Laura
            </button>
            <button className={`nav-btn ${activeTab === 'consultor' ? 'active' : ''}`} onClick={() => setActiveTab('consultor')}>
              <User size={18} /> Consultor Responsável
            </button>
          </nav>

          <div className="sidebar-footer">
            <div className="status-pill">
              <div className="status-dot"></div>
              Agent Laura Online
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="settings-main">
          <header className="main-header">
            <div className="header-info">
              <h2>{activeTab === 'geral' ? 'Configurações Gerais' : activeTab === 'agenda' ? 'Agenda & Disponibilidade' : 'Perfil do Consultor'}</h2>
              <p>Gerencie como o seu CRM e a IA se comportam no dia a dia.</p>
            </div>
            <button className="close-x" onClick={onClose}><X size={20} /></button>
          </header>

          <div className="main-scrollable">
            {loading ? (
              <div className="settings-loading">
                <div className="spinner"></div>
                <span>Sincronizando...</span>
              </div>
            ) : (
              <div className="tab-container animate-slide">
                
                {activeTab === 'geral' && (
                  <div className="tab-pane">
                    <div className="settings-card">
                      <div className="card-header">
                        <Bell size={18} />
                        <h4>Notificações e Sistema</h4>
                      </div>
                      <div className="card-body">
                        <div className="setting-row">
                          <div className="row-info">
                            <h5>IA Ativa no Pipeline</h5>
                            <p>Permite que a Laura responda novos leads automaticamente.</p>
                          </div>
                          <div className="toggle active"></div>
                        </div>
                        <div className="setting-row">
                          <div className="row-info">
                            <h5>Transcrição de Áudios</h5>
                            <p>Laura transcreve e entende áudios enviados pelos leads.</p>
                          </div>
                          <div className="toggle active"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'agenda' && (
                  <div className="tab-pane">
                    <div className="availability-grid">
                      <div className="availability-form">
                        <div className="card-header">
                          <Plus size={18} />
                          <h4>Novo Horário</h4>
                        </div>
                        <div className="form-box">
                          <div className="type-selector">
                            <button className={type === 'recurring' ? 'selected' : ''} onClick={() => setType('recurring')}>Semanal</button>
                            <button className={type === 'specific' ? 'selected' : ''} onClick={() => setType('specific')}>Data Única</button>
                          </div>
                          
                          <div className="inputs-row">
                            {type === 'recurring' ? (
                              <div className="field">
                                <label>Dia da Semana</label>
                                <select value={newDay} onChange={e => setNewDay(parseInt(e.target.value))}>
                                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                                </select>
                              </div>
                            ) : (
                              <div className="field">
                                <label>Escolha a Data</label>
                                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
                              </div>
                            )}
                          </div>

                          <div className="inputs-row">
                            <div className="field">
                              <label>Hora Início</label>
                              <div className="time-wrap"><Clock size={12} /><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
                            </div>
                            <div className="field">
                              <label>Hora Fim</label>
                              <div className="time-wrap"><Clock size={12} /><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
                            </div>
                          </div>

                          <button className="btn btn-primary" onClick={handleAddSlot} style={{ width: '100%', marginTop: '8px' }}>
                            <Plus size={16} /> Adicionar à Agenda
                          </button>
                        </div>
                      </div>

                      <div className="availability-list">
                        <div className="card-header">
                          <ShieldCheck size={18} />
                          <h4>Horários Ativos</h4>
                        </div>
                        <div className="slots-scroller">
                          {slots.length === 0 ? (
                            <div className="no-slots">Nenhuma janela de tempo configurada.</div>
                          ) : (
                            slots.map(slot => (
                              <div key={slot.id} className="slot-item">
                                <div className="slot-main">
                                  {slot.specific_date ? (
                                    <div className="slot-tag tag-purple">Única</div>
                                  ) : (
                                    <div className="slot-tag tag-blue">Semanal</div>
                                  )}
                                  <div className="slot-details">
                                    <strong>{slot.specific_date ? new Date(slot.specific_date).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : DAYS[slot.day_of_week!]}</strong>
                                    <span>{slot.start_time} - {slot.end_time}</span>
                                  </div>
                                </div>
                                <button className="slot-del" onClick={() => handleDeleteSlot(slot.id)}><Trash2 size={14} /></button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'consultor' && (
                  <div className="tab-pane">
                    <div className="settings-card">
                      <div className="card-header">
                        <User size={18} />
                        <h4>Perfil do Consultor</h4>
                      </div>
                      <div className="card-body">
                        <div className="inputs-row">
                          <div className="field">
                            <label>Nome do Responsável</label>
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Rodrigo Silva" />
                          </div>
                          <div className="field">
                            <label>WhatsApp de Alerta</label>
                            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ex: 5511999999999" />
                          </div>
                        </div>
                        <p className="field-hint">A Laura enviará notificações de novas reuniões agendadas para este número.</p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>

          <footer className="main-footer">
             <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
             <button className="btn btn-primary" onClick={handleSaveSettings} disabled={saving}>
               <Save size={16} /> {saving ? 'Sincronizando...' : 'Salvar Alterações'}
             </button>
          </footer>
        </main>

        <style>{`
          .settings-modal {
            background: #080810;
            width: 100%;
            max-width: 1000px;
            height: 700px;
            display: flex;
            border-radius: 24px;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow: 0 30px 60px rgba(0,0,0,0.8);
            overflow: hidden;
            position: relative;
          }

          /* SIDEBAR */
          .settings-sidebar {
            width: 280px;
            background: rgba(255,255,255,0.02);
            border-right: 1px solid rgba(255,255,255,0.06);
            padding: 32px 16px;
            display: flex;
            flex-direction: column;
            gap: 40px;
          }
          .sidebar-header { display: flex; align-items: center; gap: 12px; padding: 0 8px; }
          .sidebar-header h3 { font-size: 16px; font-weight: 700; color: #fff; margin: 0; }
          .sidebar-header span { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }

          .sidebar-nav { display: flex; flex-direction: column; gap: 6px; flex: 1; }
          .nav-btn {
            border: 0; background: transparent;
            display: flex; align-items: center; gap: 12px;
            padding: 12px 16px; border-radius: 12px;
            color: var(--text-secondary); font-size: 14px; font-weight: 500;
            cursor: pointer; transition: all 0.2s;
            text-align: left;
          }
          .nav-btn:hover { background: rgba(255,255,255,0.05); color: #fff; }
          .nav-btn.active { background: var(--accent-dim); color: var(--accent-light); box-shadow: inset 0 0 0 1px rgba(99,102,241,0.2); }

          .sidebar-footer { padding: 0 8px; }
          .status-pill {
            display: flex; align-items: center; gap: 8px;
            background: rgba(16,185,129,0.08); color: #10b981;
            padding: 6px 12px; border-radius: 99px; font-size: 11px; font-weight: 600;
          }
          .status-dot { width: 6px; height: 6px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981; }

          /* MAIN CONTENT */
          .settings-main { flex: 1; display: flex; flex-direction: column; background: #080810; }
          .main-header {
            padding: 32px; border-bottom: 1px solid rgba(255,255,255,0.06);
            display: flex; align-items: flex-start; justify-content: space-between;
          }
          .header-info h2 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
          .header-info p { font-size: 14px; color: var(--text-muted); margin: 0; }
          .close-x { border: 0; background: rgba(255,255,255,0.05); color: var(--text-secondary); border-radius: 50%; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
          .close-x:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

          .main-scrollable { flex: 1; padding: 32px; overflow-y: auto; }
          .tab-pane { display: flex; flex-direction: column; gap: 24px; }

          /* CARDS */
          .settings-card {
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 20px; padding: 24px;
          }
          .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; color: var(--accent-light); }
          .card-header h4 { font-size: 15px; font-weight: 600; color: #fff; margin: 0; }

          .setting-row { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,0.03); }
          .setting-row:last-child { border: 0; }
          .row-info h5 { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
          .row-info p { font-size: 12px; color: var(--text-muted); margin: 0; }
          .toggle { width: 44px; height: 22px; background: rgba(255,255,255,0.1); border-radius: 99px; position: relative; cursor: pointer; }
          .toggle.active { background: var(--accent); }
          .toggle::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; background: #fff; border-radius: 50%; transition: all 0.2s; }
          .toggle.active::after { transform: translateX(22px); }

          /* AVAILABILITY SPECIFIC */
          .availability-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
          .availability-form, .availability-list { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; padding: 24px; }
          
          .type-selector { display: flex; gap: 6px; background: rgba(0,0,0,0.3); padding: 4px; border-radius: 12px; margin-bottom: 20px; }
          .type-selector button { flex: 1; border: 0; background: transparent; color: var(--text-muted); font-size: 12px; font-weight: 600; padding: 8px; border-radius: 8px; cursor: pointer; transition: 0.2s; }
          .type-selector button.selected { background: rgba(255,255,255,0.08); color: #fff; }

          .inputs-row { display: flex; gap: 16px; margin-bottom: 16px; }
          .field { flex: 1; display: flex; flex-direction: column; gap: 8px; }
          .field label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; }
          .time-wrap { position: relative; display: flex; align-items: center; }
          .time-wrap svg { position: absolute; left: 12px; color: var(--text-muted); }
          .time-wrap input { padding-left: 32px; }

          .slots-scroller { display: flex; flex-direction: column; gap: 10px; max-height: 380px; overflow-y: auto; padding-right: 4px; }
          .slot-item {
            background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
            border-radius: 14px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;
          }
          .slot-main { display: flex; align-items: center; gap: 16px; }
          .slot-tag { font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 4px 8px; border-radius: 6px; }
          .tag-blue { background: rgba(59,130,246,0.1); color: #60a5fa; }
          .tag-purple { background: rgba(168,85,247,0.1); color: #c084fc; }
          .slot-details { display: flex; flex-direction: column; }
          .slot-details strong { font-size: 14px; color: #fff; }
          .slot-details span { font-size: 12px; color: var(--text-muted); }
          .slot-del { border: 0; background: transparent; color: var(--text-muted); cursor: pointer; transition: 0.2s; }
          .slot-del:hover { color: #ef4444; }
          .no-slots { padding: 40px 0; text-align: center; color: var(--text-muted); font-size: 13px; }

          .field-hint { font-size: 12px; color: var(--text-muted); margin-top: 12px; font-style: italic; }

          .main-footer { padding: 24px 32px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; gap: 12px; justify-content: flex-end; }
          
          .settings-loading { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: var(--text-muted); }
        `}</style>
      </div>
    </div>
  )
}
