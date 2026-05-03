-- ============================================================
-- MIGRAÇÃO: CRM MULTI-PRODUTOS
-- Execute este script no editor SQL do seu dashboard Supabase
-- ============================================================

-- 1. Criar tabela de produtos
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_text TEXT,
  payment_link TEXT,
  form_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Inserir produtos iniciais
INSERT INTO products (id, name, description, price_text, payment_link, form_link)
VALUES 
('programa_completo', 'Seu Dinheiro na Mesa (Completo)', '5 módulos gravados + encontros ao vivo + 12 meses de acompanhamento', '12x de R$ 206,85', 'https://pay.hotmart.com/I104619180M', 'https://seudinneironamesa.com.br/comunidade'),
('sessao_individual', 'Sessão Individual + Protocolo', '1h de consultoria personalizada + Protocolo Financeiro completo', 'R$ 497,00', 'https://buy.stripe.com/test_example', 'https://.../Sessaoindividual/formulario-protocolo.html')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_text = EXCLUDED.price_text,
  payment_link = EXCLUDED.payment_link;

-- 3. Adicionar colunas nos leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES products(id) DEFAULT 'programa_completo';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS drive_folder_url TEXT;

-- 4. Adicionar coluna no agent_state
ALTER TABLE agent_state ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES products(id);

-- 5. Atualizar a View do CRM
DROP VIEW IF EXISTS crm_leads_view;
CREATE VIEW crm_leads_view AS
SELECT
  l.id,
  l.name,
  l.phone,
  l.email,
  l.source,
  l.score,
  l.notes,
  l.created_at,
  l.updated_at,
  l.drive_folder_url,
  p.name AS product_name,
  ps.name AS stage_name,
  ps.color AS stage_color,
  ps.order_index AS stage_order,
  ag.spin_phase,
  ag.last_message_at,
  ag.follow_up_count,
  (SELECT COUNT(*) FROM conversations c WHERE c.lead_id = l.id) AS message_count
FROM leads l
JOIN pipeline_stages ps ON ps.id = l.stage_id
LEFT JOIN products p ON p.id = l.product_id
LEFT JOIN agent_state ag ON ag.lead_id = l.id;
