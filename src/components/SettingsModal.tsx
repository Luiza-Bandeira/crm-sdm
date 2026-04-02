import { useState, useEffect } from 'react'
import { X, Save, Settings, Plus, Trash2, Calendar, Clock, User } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface AvailabilitySlot {
  id: string
  day_of_week: number | null
  specific_date: string | null
  start_time: string
  end_time: string
}

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form states for new slot
  const [type, setType] = useState<'recurring' | 'specific'>('recurring')
  const [newDay, setNewDay] = useState(1) // Monday
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

    if (type === 'specific' && !newDate) {
      alert('Selecione uma data específica')
      return
    }

    const { data, error } = await supabase.from('availability_slots').insert(payload).select().single()
    if (data) {
      setSlots(prev => [...prev, data as AvailabilitySlot])
      setNewDate('')
    } else if (error) {
      console.error(error)
    }
  }

  async function handleDeleteSlot(id: string) {
    await supabase.from('availability_slots').delete().eq('id', id)
    setSlots(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box glass animate-slide" style={{ maxWidth: '550px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div className="modal-title-area">
            <h2 className="modal-name" style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '20px' }}>
              <Settings size={22} className="text-accent" /> Configurações Gerais
            </h2>
          </div>
          <button className="btn btn-ghost icon-only" onClick={onClose}><X size={18} /></button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>Carregando...</div>
        ) : (
          <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Responsável Section */}
            <section className="settings-section">
              <h3 className="section-title"><User size={16} /> Consultor Responsável</h3>
              <div className="grid-2">
                <div className="field-group">
                  <label>Nome do Consultor</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Rodrigo" />
                </div>
                <div className="field-group">
                  <label>WhatsApp (Lembretes)</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ex: 5511999999999" />
                </div>
              </div>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={handleSaveSettings} 
                disabled={saving}
                style={{ marginTop: '12px', alignSelf: 'flex-start' }}
              >
                <Save size={14} /> {saving ? 'Salvando...' : 'Salvar Dados do Consultor'}
              </button>
            </section>

            <hr className="divider" />

            {/* Availability Section */}
            <section className="settings-section">
              <h3 className="section-title"><Calendar size={16} /> Gestão de Disponibilidade (Laura)</h3>
              <p className="section-desc">Defina as janelas onde a Laura pode oferecer reuniões.</p>
              
              <div className="add-slot-box">
                <div className="type-toggle">
                  <button 
                    className={`toggle-btn ${type === 'recurring' ? 'active' : ''}`}
                    onClick={() => setType('recurring')}
                  >Recorrente</button>
                  <button 
                    className={`toggle-btn ${type === 'specific' ? 'active' : ''}`}
                    onClick={() => setType('specific')}
                  >Data Única</button>
                </div>

                <div className="slot-inputs">
                  {type === 'recurring' ? (
                    <select value={newDay} onChange={e => setNewDay(parseInt(e.target.value))}>
                      {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  ) : (
                    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
                  )}
                  
                  <div className="time-inputs">
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                    <span>até</span>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                  </div>

                  <button className="btn btn-accent icon-only" onClick={handleAddSlot}>
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              <div className="slots-list">
                {slots.length === 0 ? (
                  <div className="empty-slots">Nenhum horário cadastrado.</div>
                ) : (
                  slots.map(slot => (
                    <div key={slot.id} className="slot-pill">
                      <div className="slot-info">
                        {slot.specific_date ? (
                          <span className="badge-specific"><Calendar size={10} /> {new Date(slot.specific_date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</span>
                        ) : (
                          <span className="badge-recurring"><Clock size={10} /> {DAYS[slot.day_of_week!]}s</span>
                        )}
                        <span className="slot-time">{slot.start_time} - {slot.end_time}</span>
                      </div>
                      <button className="delete-btn" onClick={() => handleDeleteSlot(slot.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        <style>{`
          .settings-section { display: flex; flexDirection: column; gap: 12px; }
          .section-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; color: var(--text-primary); margin: 0; }
          .section-desc { font-size: 12px; color: var(--text-muted); margin: 0; }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .divider { border: 0; border-top: 1px solid var(--border); margin: 4px 0; }
          
          .add-slot-box { 
            background: rgba(255,255,255,0.03); 
            border: 1px solid var(--border); 
            border-radius: 12px; 
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          .type-toggle { 
            display: flex; 
            background: var(--bg-card); 
            padding: 4px; 
            border-radius: 8px; 
            gap: 4px; 
            align-self: flex-start;
          }
          .toggle-btn {
            border: 0; background: transparent; color: var(--text-muted);
            font-size: 11px; font-weight: 500; padding: 6px 12px;
            border-radius: 6px; cursor: pointer; transition: all 0.2s;
          }
          .toggle-btn.active { background: var(--border); color: var(--text-primary); }
          
          .slot-inputs { display: flex; gap: 8px; align-items: center; }
          .slot-inputs select, .slot-inputs input { flex: 1; min-width: 0; }
          .time-inputs { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
          .time-inputs input { width: 85px; }

          .slots-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
          .slot-pill {
            display: flex; align-items: center; gap: 10px;
            background: var(--bg-card); border: 1px solid var(--border);
            padding: 6px 10px; border-radius: 8px; font-size: 13px;
          }
          .slot-info { display: flex; align-items: center; gap: 8px; }
          .badge-recurring { background: rgba(59,130,246,0.1); color: #60a5fa; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; display: flex; align-items: center; gap: 3px; }
          .badge-specific { background: rgba(168,85,247,0.1); color: #c084fc; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; display: flex; align-items: center; gap: 3px; }
          .slot-time { font-weight: 500; }
          .delete-btn { border: 0; background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: color 0.2s; }
          .delete-btn:hover { color: #ef4444; }
          .empty-slots { font-size: 12px; color: var(--text-muted); padding: 12px 0; width: 100%; text-align: center; border: 1px dashed var(--border); border-radius: 8px; }
        `}</style>
      </div>
    </div>
  )
}
