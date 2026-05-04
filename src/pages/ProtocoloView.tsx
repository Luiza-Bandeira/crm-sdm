
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Printer, Download, ArrowLeft, FileText, CheckCircle2 } from 'lucide-react'

export default function ProtocoloView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lead, setLead] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadLead() {
      if (!id) return
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .single()
      
      if (data) setLead(data)
      setLoading(false)
    }
    loadLead()
  }, [id])

  if (loading) return (
    <div className="protocolo-loading">
      <div className="spinner"></div>
      <p>Carregando protocolo...</p>
    </div>
  )

  if (!lead || !lead.metadata?.answers) return (
    <div className="protocolo-empty">
      <FileText size={48} opacity={0.2} />
      <h2>Protocolo não encontrado</h2>
      <p>Este lead ainda não preencheu o formulário de diagnóstico.</p>
      <button className="btn btn-primary" onClick={() => navigate('/crm')}>Voltar ao CRM</button>
    </div>
  )

  const answers = lead.metadata.answers
  const date = lead.metadata.form_at ? new Date(lead.metadata.form_at).toLocaleString('pt-BR') : '—'

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="protocolo-page animate-fade">
      <header className="protocolo-header no-print">
        <button className="btn btn-ghost" onClick={() => navigate('/crm')}>
          <ArrowLeft size={16} />
          Voltar
        </button>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={handlePrint}>
            <Printer size={16} />
            Imprimir
          </button>
          <button className="btn btn-primary" onClick={handlePrint}>
            <Download size={16} />
            Baixar PDF
          </button>
        </div>
      </header>

      <main className="protocolo-container">
        <div className="protocolo-card glass">
          <div className="protocolo-card-header">
            <div className="protocolo-logo">
              <CheckCircle2 size={32} color="var(--accent)" />
              <div>
                <h1>Protocolo Dinheiro na Mesa</h1>
                <p>Consultoria Individual • 2026</p>
              </div>
            </div>
            <div className="protocolo-meta">
              <div className="meta-box">
                <span>CLIENTE</span>
                <strong>{lead.name}</strong>
              </div>
              <div className="meta-box">
                <span>DATA DE PREENCHIMENTO</span>
                <strong>{date}</strong>
              </div>
            </div>
          </div>

          <div className="protocolo-content">
            <section className="protocolo-section">
              <h3 className="section-title">Resumo do Diagnóstico</h3>
              <div className="answers-grid">
                {Object.entries(answers).map(([key, value]: [string, any]) => (
                  <div key={key} className="answer-item">
                    <label>{key.replace(/_/g, ' ').toUpperCase()}</label>
                    <p>{Array.isArray(value) ? value.join(', ') : (value || '—')}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <footer className="protocolo-footer">
            <p>© 2026 Luiza Bandeira - Todos os direitos reservados</p>
          </footer>
        </div>
      </main>

      <style>{`
        .protocolo-page {
          min-height: 100vh;
          background: var(--bg-base);
          display: flex;
          flex-direction: column;
        }
        .protocolo-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 40px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-card);
        }
        .header-actions { display: flex; gap: 12px; }
        .protocolo-container {
          flex: 1;
          padding: 40px;
          display: flex;
          justify-content: center;
          background: #f8fafc;
        }
        .protocolo-card {
          width: 100%;
          max-width: 800px;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
          overflow: hidden;
          color: #1e293b;
        }
        .protocolo-card-header {
          padding: 40px;
          background: #1e293b;
          color: #fff;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .protocolo-logo { display: flex; align-items: center; gap: 16px; }
        .protocolo-logo h1 { font-size: 24px; font-weight: 800; margin: 0; }
        .protocolo-logo p { opacity: 0.7; margin: 4px 0 0; font-size: 14px; }
        .protocolo-meta { display: flex; flex-direction: column; gap: 12px; text-align: right; }
        .meta-box span { display: block; font-size: 10px; font-weight: 700; opacity: 0.6; letter-spacing: 0.05em; }
        .meta-box strong { font-size: 14px; }
        
        .protocolo-content { padding: 40px; }
        .section-title { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #f1f5f9; }
        .answers-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .answer-item label { display: block; font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 6px; }
        .answer-item p { font-size: 15px; color: #334155; margin: 0; line-height: 1.5; font-weight: 500; }
        
        .protocolo-footer { padding: 24px 40px; border-top: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; }

        .protocolo-loading, .protocolo-empty {
          height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; text-align: center; padding: 40px;
        }

        @media print {
          .no-print { display: none !important; }
          .protocolo-container { padding: 0; background: #fff; }
          .protocolo-card { box-shadow: none; border: none; max-width: 100%; border-radius: 0; }
          .protocolo-card-header { background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #1e293b; }
        }
      `}</style>
    </div>
  )
}
