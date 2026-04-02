import { useState, useEffect } from 'react'
import { X, Save, Settings, User, Bell, Globe } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Tab = 'geral' | 'consultor'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('geral')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    const { data } = await supabase.from('scheduling_settings').select('*').maybeSingle()
    if (data) {
      setPhone(data.consultant_phone || '')
      setName(data.consultant_name || '')
    }
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

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-modal animate-fade" onClick={e => e.stopPropagation()}>
        
        {/* Sidebar Nav */}
        <aside className="settings-sidebar">
          <div className="sidebar-header">
            <Settings className="text-accent" size={24} />
            <div>
              <h3>Configurações</h3>
              <span>Laura CRM v3.5</span>
            </div>
          </div>
          
          <nav className="sidebar-nav">
            <button className={`nav-btn ${activeTab === 'geral' ? 'active' : ''}`} onClick={() => setActiveTab('geral')}>
              <Globe size={18} /> Geral
            </button>
            <button className={`nav-btn ${activeTab === 'consultor' ? 'active' : ''}`} onClick={() => setActiveTab('consultor')}>
              <User size={18} /> Consultor Responsável
            </button>
          </nav>

          <div className="sidebar-footer">
             <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Para gerenciar horários, utilize a aba **Agenda** no menu principal.</p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="settings-main">
          <header className="main-header">
            <div className="header-info">
              <h2>{activeTab === 'geral' ? 'Configurações Gerais' : 'Perfil do Consultor'}</h2>
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
                            <label>WhatsApp (Lembretes)</label>
                            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ex: 5511999999999" />
                          </div>
                        </div>
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
            background: #080810; width: 100%; max-width: 900px; height: 600px;
            display: flex; border-radius: 24px; border: 1px solid var(--border);
            box-shadow: var(--shadow); position: relative; overflow: hidden;
          }
          .settings-sidebar {
            width: 260px; background: rgba(255,255,255,0.02); border-right: 1px solid var(--border);
            padding: 32px 16px; display: flex; flex-direction: column; gap: 40px;
          }
          .sidebar-header { display: flex; align-items: center; gap: 12px; }
          .sidebar-header h3 { font-size: 15px; font-weight: 700; color: #fff; margin: 0; }
          .sidebar-header span { font-size: 10px; color: var(--text-muted); }
          .sidebar-nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }
          .nav-btn {
            border: 0; background: transparent; display: flex; align-items: center; gap: 12px;
            padding: 12px 16px; border-radius: 12px; color: var(--text-secondary);
            font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s;
          }
          .nav-btn:hover { background: var(--bg-hover); color: #fff; }
          .nav-btn.active { background: var(--accent-dim); color: var(--accent-light); }
          .sidebar-footer { padding: 0 8px; }

          .settings-main { flex: 1; display: flex; flex-direction: column; }
          .main-header { padding: 24px 32px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: flex-start; }
          .header-info h2 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
          .header-info p { font-size: 13px; color: var(--text-muted); }
          .close-x { border: 0; background: var(--bg-hover); color: var(--text-muted); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; }
          
          .main-scrollable { flex: 1; padding: 32px; overflow-y: auto; }
          .settings-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; padding: 24px; }
          .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; color: var(--accent-light); }
          .card-header h4 { font-size: 15px; font-weight: 600; color: #fff; }
          .setting-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); }
          .setting-row:last-child { border: 0; }
          .row-info h5 { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
          .row-info p { font-size: 11px; color: var(--text-muted); }

          .inputs-row { display: flex; gap: 16px; }
          .field { flex: 1; display: flex; flex-direction: column; gap: 8px; }
          
          .main-footer { padding: 24px 32px; border-top: 1px solid var(--border); display: flex; gap: 12px; justify-content: flex-end; }
          .toggle { width: 44px; height: 22px; background: rgba(255,255,255,0.1); border-radius: 99px; position: relative; cursor: pointer; }
          .toggle.active { background: var(--accent); }
          .toggle::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; background: #fff; border-radius: 50%; transition: all 0.2s; }
          .toggle.active::after { transform: translateX(22px); }

          .settings-loading { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: var(--text-muted); }
        `}</style>
      </div>
    </div>
  )
}
