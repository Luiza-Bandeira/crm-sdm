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
    const { nome_completo, telefone_whatsapp, canal_origem, product_id } = body;

    const productId = product_id || 'programa_completo';

    // Validação
    if (!telefone_whatsapp) {
      return new Response(
        JSON.stringify({ error: 'telefone_whatsapp obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limpa o telefone (só números)
    const phone = String(telefone_whatsapp).replace(/\D/g, '');

    // ── Verifica se lead já existe ──────────────────────────
    const { data: existing } = await supabase
      .from('leads')
      .select('id, name, phone, product_id')
      .or(`phone.eq.${phone},phone.eq.${phone}@s.whatsapp.net`)
      .maybeSingle();

    let leadId: string;

    if (existing) {
      leadId = existing.id;
      await supabase.from('leads').update({
        name:       nome_completo || existing.name,
        source:     canal_origem || 'landing_page',
        product_id: productId, // Atualiza para o interesse mais recente
      }).eq('id', leadId);

      console.log(`[webhook-lead] Lead existente atualizado: ${leadId}`);

      // Ativa o agente e reseta/atualiza o produto no estado
      await supabase.from('agent_state')
        .upsert({ 
          lead_id: leadId, 
          is_active: true, 
          product_id: productId,
          spin_phase: 'situacao' // Reinicia o fluxo se for um novo produto
        }, { onConflict: 'lead_id' });
    } else {
      // ── Cria novo lead ──────────────────────────────────
      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          name:       nome_completo,
          phone,
          source:     canal_origem || 'landing_page',
          stage_id:   STAGES.NOVO_LEAD,
          product_id: productId,
        })
        .select('id')
        .single();

      if (error) throw error;
      leadId = newLead.id;

      // Cria estado do agente
      await supabase.from('agent_state').insert({
        lead_id:    leadId,
        product_id: productId,
        spin_phase: 'situacao',
        spin_data:  {},
        is_active:  true,
      });

      // Loga criação
      await logActivity(leadId, 'stage_change', `Lead criado via "${canal_origem || 'landing_page'}" (Produto: ${productId})`, null, STAGES.NOVO_LEAD);

      console.log(`[webhook-lead] Novo lead criado: ${leadId} | ${phone}`);
    }

    // ── Dispara primeira mensagem (Sempre que houver interação com a LP) ───
    await triggerFirstMessage(leadId, phone, productId, nome_completo);

    return new Response(
      JSON.stringify({ success: true, lead_id: leadId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[webhook-lead] Erro:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ── Primeira mensagem personalizada ──────────────────────────────
async function triggerFirstMessage(leadId: string, phone: string, productId: string, name?: string) {
  const firstName = name?.split(' ')[0] || '';
  const saudacao  = firstName ? `Oi ${firstName}! 👋` : 'Olá! 👋';

  // Busca dados do produto para personalizar
  const { data: product } = await supabase.from('products').select('name').eq('id', productId).maybeSingle();
  const productName = product?.name || 'Seu Dinheiro na Mesa';

  let msg = '';
  if (productId === 'sessao_individual') {
    msg = `${saudacao} Vi que você se interessou pela *Sessão Individual do Protocolo Financeiro*. Fico muito feliz!\n\n` +
          `Para te ajudar da melhor forma nessa consultoria 1 a 1, preciso entender o que te trouxe até aqui hoje.\n\n` +
          `Como está a sua vida financeira no momento? Você sente que tem controle total ou está buscando organizar as contas primeiro?`;
  } else {
    msg = `${saudacao} Vi que você se interessou pelo *${productName}*. Fico feliz que chegou até aqui!\n\n` +
          `Antes de te contar tudo sobre o programa, quero entender melhor a sua situação.\n\n` +
          `Me conta: *como estão suas finanças hoje?* Você consegue guardar dinheiro no final do mês?`;
  }

  await saveMessage(leadId, 'assistant', msg);
  const officialJid = await sendWhatsApp(phone, msg);

  await supabase.from('agent_state')
    .update({ 
      last_message_at: new Date().toISOString(),
      follow_up_count: 1
    })
    .eq('lead_id', leadId);

  if (officialJid && officialJid !== phone) {
    await supabase.from('leads').update({ phone: officialJid }).eq('id', leadId);
  }
}
