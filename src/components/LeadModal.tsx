import { useState, useEffect, useCallback } from 'react'
import { X, Phone, MessageCircle, User, Clock, Edit3, Save, Trash2, ChevronDown, CheckSquare, Power, Plus, Check, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lead, Conversation, PipelineStage, Task } from '../lib/supabase'

interface Props {
  lead: Lead
  stages: PipelineStage[]
  onClose: () => void
  onUpdate: (updated: Lead) => void
  onDelete: (id: string) => void
}

export default function LeadModal({ lead, stages, onClose, onUpdate, onDelete }: Props) {
  const isNew = !lead.id
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [editing, setEditing] = useState(isNew)
  const [form, setForm] = useState({ 
    name: lead.name || '', 
    phone: lead.phone || '',
    notes: lead.notes || '', 
    stage_id: lead.stage_id 
  })
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'info' | 'chat' | 'tasks'>('info')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [agentActive, setAgentActive] = useState(lead.agent_state?.[0]?.is_active ?? true)

  const loadData = useCallback(async () => {
    if (isNew) return
    const [convRes, tasksRes] = await Promise.all([
      supabase.from('conversations').select('*').eq('lead_id', lead.id).order('created_at', { ascending: true }),
      supabase.from('tasks').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false })
    ])
    if (convRes.data) setConversations(convRes.data as Conversation[])
    if (tasksRes.data) setTasks(tasksRes.data as Task[])
  }, [lead.id, isNew])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleSave() {
    if (!form.phone) return alert('O telefone é obrigatório.')
    
    setSaving(true)
    let res
    if (isNew) {
      res = await supabase.from('leads')
        .insert({ name: form.name, phone: form.phone, notes: form.notes, stage_id: form.stage_id })
        .select('*, agent_state(*)').single()
    } else {
      res = await supabase.from('leads')
        .update({ name: form.name, phone: form.phone, notes: form.notes, stage_id: form.stage_id })
        .eq('id', lead.id)
        .select('*, agent_state(*)').single()
    }
    
    setSaving(false)
    if (res.error) {
      alert('Erro ao salvar lead: ' + res.error.message)
    } else if (res.data) {
      onUpdate({ ...lead, ...res.data })
      setEditing(false)
      if (isNew) onClose()
    }
  }

  async function handleDelete() {
    if (isNew) return onClose()
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    setSaving(true)
    const { error } = await supabase.from('leads').delete().eq('id', lead.id)
    setSaving(false)
    
    if (error) {
      alert('Erro ao excluir: ' + error.message)
      setConfirmingDelete(false)
    } else {
      onDelete(lead.id)
      onClose()
    }
  }

  async function handleAgentToggle() {
    const newState = !agentActive
    setAgentActive(newState)
    const { data } = await supabase.from('agent_state').select('id').eq('lead_id', lead.id).single()
    if (data) {
      await supabase.from('agent_state').update({ is_active: newState }).eq('lead_id', lead.id)
    } else {
      await supabase.from('agent_state').insert({ lead_id: lead.id, is_active: newState })
    }
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    const { data } = await supabase.from('tasks').insert({ lead_id: lead.id, title: newTaskTitle.trim() }).select().single()
    if (data) {
      setTasks([data as Task, ...tasks])
      setNewTaskTitle('')
    }
  }

  async function handleToggleTask(id: string, currentCompleted: boolean) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !currentCompleted } : t))
    await supabase.from('tasks').update({ completed: !currentCompleted }).eq('id', id)
  }

  async function handleDeleteTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    await supabase.from('tasks').delete().eq('id', id)
  }

  function timeFormat(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box glass animate-slide">
        <div className="modal-header">
          <div className="modal-avatar" style={{ background: `${lead.stage_color || '#6366f1'}20` }}>
            {(lead.name || lead.phone)?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="modal-title-area">
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Nome do lead" />
                <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="Telefone" />
              </div>
            ) : (
              <>
                <h2 className="modal-name">{lead.name || 'Sem nome'}</h2>
                <div className="modal-phone"><Phone size={12} />{lead.phone}</div>
              </>
            )}
          </div>
          <div className="modal-actions-top">
            {!isNew && (
              <div style={{ display: 'flex', gap: '6px' }}>
                {lead.metadata?.form_submitted && (
                  <button 
                    className="btn btn-primary"
                    style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                    onClick={() => window.open(`/protocolo/${lead.id}`, '_blank')}
                  >
                    <FileText size={13} /> Ver Protocolo
                  </button>
                )}
                <button 
                  onClick={handleAgentToggle} 
                  className={`btn ${agentActive ? 'btn-ghost' : 'btn-danger'}`} 
                  style={{ padding: '8px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title={agentActive ? 'Desativar Agente IA para este lead' : 'Ativar Agente IA para este lead'}
                >
                  <Power size={13} color={agentActive ? 'var(--green)' : 'currentColor'} /> 
                  {agentActive ? 'IA Ativa' : 'IA Pausada'}
                </button>
              </div>
            )}
            {!editing ? (
              <button className="btn btn-ghost" onClick={() => setEditing(true)}><Edit3 size={13} />Editar</button>
            ) : (
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}><Save size={13} />Salvar</button>
            )}
            {confirmingDelete ? (
              <div style={{ display: 'flex', gap: '4px' }}>
                <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving} style={{ padding: '8px 12px', fontSize: '11px' }}>Confirmar?</button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmingDelete(false)} style={{ padding: '8px 12px', fontSize: '11px' }}>Cancelar</button>
              </div>
            ) : (
              <button type="button" className="btn btn-danger icon-only" onClick={handleDelete} title="Excluir Lead"><Trash2 size={14} /></button>
            )}
            <button className="btn btn-ghost icon-only" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="modal-tabs">
          <button className={`tab-btn ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}><User size={13} />Info</button>
          <button className={`tab-btn ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}><MessageCircle size={13} />Chat</button>
          <button className={`tab-btn ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}><CheckSquare size={13} />Tarefas</button>
        </div>

        <div className="modal-content">
          {tab === 'info' && (
            <div className="info-tab">
              <div className="field-group">
                <label>Fase no Pipeline</label>
                <div className="select-wrap">
                  <select value={editing ? form.stage_id : lead.stage_id} disabled={!editing} onChange={e => setForm(f => ({...f, stage_id: Number(e.target.value)}))}>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="select-icon" />
                </div>
              </div>
              <div className="field-group">
                <label>Score SPIN</label>
                <div className="score-display">
                  <div className="big-score-bar"><div className="big-score-fill" style={{ width: `${lead.score || 0}%` }} /></div>
                  <span className="big-score-num">{lead.score || 0}/100</span>
                </div>
              </div>
              <div className="field-group">
                <label>Anotações</label>
                {editing ? (
                  <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} style={{ minHeight: '100px' }} />
                ) : (
                  <div style={{ background: 'var(--bg-hover)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '13px', whiteSpace: 'pre-wrap', border: '1px solid var(--border)' }}>
                    {form.notes || <span style={{ opacity: 0.5 }}>Sem anotações.</span>}
                  </div>
                )}
              </div>
              <div className="meta-grid">
                <div className="meta-item"><span className="meta-label">Origem</span><span className="meta-value">{lead.source || '—'}</span></div>
                <div className="meta-item"><span className="meta-label">Fase SPIN</span><span className="meta-value">{lead.spin_phase || '—'}</span></div>
                <div className="meta-item"><span className="meta-label">Mensagens</span><span className="meta-value">{lead.follow_up_count || 0}</span></div>
                <div className="meta-item"><span className="meta-label">Criado em</span><span className="meta-value">{timeFormat(lead.created_at)}</span></div>
              </div>
            </div>
          )}

          {tab === 'chat' && (
            <div className="chat-tab">
              {conversations.length === 0 ? (
                <div className="chat-empty"><MessageCircle size={32} opacity={0.2} /><p>Nenhum histórico</p></div>
              ) : (
                conversations.map(msg => (
                  <div key={msg.id} className={`chat-bubble ${msg.role}`}>
                    <div className="bubble-meta">
                      <span className="bubble-role">{msg.role === 'assistant' ? '🤖 Laura' : '👤 Lead'}</span>
                      <span className="bubble-time"><Clock size={10} />{timeFormat(msg.created_at)}</span>
                    </div>
                    <div className="bubble-text">{msg.content}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'tasks' && (
            <div className="tasks-tab">
              <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <input 
                  autoFocus 
                  type="text" 
                  value={newTaskTitle} 
                  onChange={e => setNewTaskTitle(e.target.value)} 
                  placeholder="Nova tarefa..." 
                  style={{ flex: 1 }} 
                />
                <button type="submit" className="btn btn-primary icon-only" disabled={!newTaskTitle.trim()}><Plus size={16} /></button>
              </form>
              <div className="tasks-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {tasks.length === 0 && <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Nenhuma tarefa para este lead.</div>}
                {tasks.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                    <button 
                      onClick={() => handleToggleTask(t.id, t.completed)}
                      style={{ background: t.completed ? 'var(--green)' : 'transparent', border: `1px solid ${t.completed ? 'var(--green)' : 'var(--text-muted)'}`, width: '20px', height: '20px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', flexShrink: 0 }}
                    >
                      {t.completed && <Check size={14} color="#fff" />}
                    </button>
                    <span style={{ fontSize: '13px', color: t.completed ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: t.completed ? 'line-through' : 'none', flex: 1 }}>
                      {t.title}
                    </span>
                    <button type="button" className="btn btn-ghost icon-only" onClick={() => handleDeleteTask(t.id)}>
                      <Trash2 size={13} color="var(--text-muted)" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        /* Include the same styles from before */
        .modal-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); padding: 20px; }
        .modal-box { width: 100%; max-width: 560px; max-height: 85vh; border-radius: var(--radius-xl); display: flex; flex-direction: column; overflow: hidden; }
        .modal-header { display: flex; align-items: center; gap: 12px; padding: 20px 20px 0; }
        .modal-avatar { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; flex-shrink: 0; color: var(--text-primary); }
        .modal-title-area { flex: 1; min-width: 0; }
        .modal-name { font-size: 18px; font-weight: 700; color: var(--text-primary); }
        .modal-phone { font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; margin-top: 2px; }
        .modal-actions-top { display: flex; gap: 6px; flex-shrink: 0; }
        .icon-only { padding: 8px !important; }
        .modal-tabs { display: flex; gap: 4px; padding: 12px 20px 0; border-bottom: 1px solid var(--border); padding-bottom: 0; }
        .tab-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; background: none; border: none; font-size: 13px; font-weight: 500; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm) var(--radius-sm) 0 0; border-bottom: 2px solid transparent; transition: var(--transition); }
        .tab-btn:hover { color: var(--text-primary); }
        .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
        .modal-content { flex: 1; overflow-y: auto; padding: 20px; }
        .info-tab, .tasks-tab { display: flex; flex-direction: column; gap: 16px; }
        .field-group { display: flex; flex-direction: column; gap: 6px; }
        .select-wrap { position: relative; }
        .select-icon { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--text-muted); }
        .score-display { display: flex; align-items: center; gap: 12px; }
        .big-score-bar { flex: 1; height: 6px; background: var(--bg-hover); border-radius: 99px; overflow: hidden; }
        .big-score-fill { height: 100%; background: linear-gradient(90deg, var(--blue), var(--purple), var(--green)); border-radius: 99px; transition: width 0.5s ease; }
        .big-score-num { font-size: 13px; font-weight: 700; color: var(--text-secondary); flex-shrink: 0; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .meta-item { background: var(--bg-base); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; }
        .meta-label { display: block; font-size: 10px; color: var(--text-muted); font-weight: 500; margin-bottom: 4px; }
        .meta-value { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .chat-tab { display: flex; flex-direction: column; gap: 12px; }
        .chat-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 0; color: var(--text-muted); font-size: 13px; }
        .chat-bubble { padding: 10px 14px; border-radius: var(--radius-md); max-width: 90%; }
        .chat-bubble.assistant { background: var(--purple-dim); border: 1px solid rgba(139,92,246,0.2); align-self: flex-start; }
        .chat-bubble.user { background: var(--blue-dim); border: 1px solid rgba(59,130,246,0.2); align-self: flex-end; }
        .bubble-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .bubble-role { font-size: 11px; font-weight: 600; color: var(--text-secondary); }
        .bubble-time { font-size: 10px; color: var(--text-muted); display: flex; align-items: center; gap: 3px; }
        .bubble-text { font-size: 13px; color: var(--text-primary); line-height: 1.5; white-space: pre-wrap; }
      `}</style>
    </div>
  )
}
