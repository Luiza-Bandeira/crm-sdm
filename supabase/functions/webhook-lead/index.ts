// ============================================================
// Edge Function: webhook-lead
// Recebe lead da Landing Page
//
// Formato esperado:
// POST /functions/v1/webhook-lead
// {
//   "nome_completo": "João Silva",
//   "telefone_whatsapp": "5511999999999",
//   "canal_origem": "Lp seudinheironamesa"
// }
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { supabase, saveMessage, logActivity } from '../_shared/db.ts';
import { sendWhatsApp }                       from '../_shared/evolution.ts';
import { STAGES }                             from '../_shared/stages.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Aceita apenas POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { nome_completo, telefone_whatsapp, canal_origem } = body;

    // Validação
    if (!telefone_whatsapp) {
      return Response.json({ error: 'telefone_whatsapp obrigatório' }, { status: 400 });
    }

    // Limpa o telefone (só números)
    const phone = String(telefone_whatsapp).replace(/\D/g, '');

    // ── Verifica se lead já existe ──────────────────────────
    const { data: existing } = await supabase
      .from('leads')
      .select('id, name')
      .eq('phone', phone)
      .maybeSingle();

    let leadId: string;

    if (existing) {
      // Lead já existe — atualiza nome e origem se necessário
      leadId = existing.id;
      await supabase.from('leads').update({
        name:   nome_completo || existing.name,
        source: canal_origem || 'landing_page',
      }).eq('id', leadId);

      console.log(`[webhook-lead] Lead existente atualizado: ${leadId}`);

      // Ativa o agente para o lead existente
      await supabase.from('agent_state')
        .upsert({ lead_id: leadId, is_active: true }, { onConflict: 'lead_id' });
    } else {
      // ── Cria novo lead ──────────────────────────────────
      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          name:     nome_completo,
          phone,
          source:   canal_origem || 'landing_page',
          stage_id: STAGES.NOVO_LEAD,
        })
        .select('id')
        .single();

      if (error) throw error;
      leadId = newLead.id;

      // Cria estado do agente para este lead
      await supabase.from('agent_state').insert({
        lead_id:    leadId,
        spin_phase: 'situacao',
        spin_data:  {},
        is_active:  true,
      });

      // Loga criação no histórico de atividades
      await logActivity(leadId, 'stage_change', `Lead criado via "${canal_origem || 'landing_page'}"`, null, STAGES.NOVO_LEAD);

      console.log(`[webhook-lead] Novo lead criado: ${leadId} | ${phone}`);

      // ── Dispara primeira mensagem no WhatsApp ───────────
      await triggerFirstMessage(leadId, phone, nome_completo);
    }

    return Response.json({ success: true, lead_id: leadId });

  } catch (err) {
    console.error('[webhook-lead] Erro:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});

// ── Primeira mensagem do agente ──────────────────────────────
async function triggerFirstMessage(leadId: string, phone: string, name?: string) {
  const firstName = name?.split(' ')[0] || '';
  const saudacao  = firstName ? `Oi ${firstName}! 👋` : 'Olá! 👋';

  const msg =
    `${saudacao} Vi que você se interessou pelo *Seu Dinheiro na Mesa*. Fico feliz que chegou até aqui!\n\n` +
    `Antes de te contar tudo, quero entender melhor a sua situação.\n\n` +
    `Me conta: *como estão suas finanças hoje?* Você consegue guardar dinheiro no final do mês?`;

  await saveMessage(leadId, 'assistant', msg);
  
  // Envia e pega o JID real (pode ser um @lid ou @s.whatsapp.net)
  const officialJid = await sendWhatsApp(phone, msg);

  // Atualiza estado do agente: já conta como 1 mensagem enviada
  // E atualiza o "phone" para o JID real se for diferente, para garantir o match no webhook
  const updates: any = { 
    last_message_at: new Date().toISOString(),
    follow_up_count: 1
  };
  
  await supabase.from('agent_state')
    .update(updates)
    .eq('lead_id', leadId);

  if (officialJid && officialJid !== phone) {
    console.log(`[webhook-lead] Atualizando telefone para JID oficial: ${phone} -> ${officialJid}`);
    await supabase.from('leads')
      .update({ phone: officialJid })
      .eq('id', leadId);
  }
}
