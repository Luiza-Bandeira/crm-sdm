import { useState, useEffect } from 'react'
import { X, Save, Settings } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('scheduling_settings').select('consultant_phone').single().then(({ data }) => {
      if (data) setPhone(data.consultant_phone || '')
    })
  }, [])

  async function handleSave() {
    setSaving(true)
    const { data } = await supabase.from('scheduling_settings').select('id').single()
    if (data) {
      await supabase.from('scheduling_settings').update({ consultant_phone: phone }).eq('id', data.id)
    } else {
      await supabase.from('scheduling_settings').insert({ consultant_phone: phone })
    }
    setSaving(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box glass animate-slide" style={{ maxWidth: '400px' }}>
        <div className="modal-header" style={{ paddingBottom: '16px' }}>
          <div className="modal-title-area">
            <h2 className="modal-name" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Settings size={20} /> Configurações
            </h2>
          </div>
          <button className="btn btn-ghost icon-only" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-content" style={{ paddingTop: '8px' }}>
          <div className="field-group">
            <label>WhatsApp do Humano (Lembretes)</label>
            <input 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              placeholder="Ex: 5511999999999" 
            />
            <small style={{ color: 'var(--text-muted)' }}>Você receberá os alertas do sistema neste número.</small>
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%', marginTop: '24px', justifyContent: 'center' }}>
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </div>
    </div>
  )
}
