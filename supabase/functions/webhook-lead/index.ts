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

    const productId = product_id || 'sessao_individual';
    console.log(`[webhook-lead] Recebido product_id: "${product_id}" | Usando: "${productId}" | Nome: ${nome_completo}`);

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

  // 1. Busca dados do produto
  const { data: product } = await supabase.from('products').select('*').eq('id', productId).maybeSingle();
  const productName = product?.name || 'Protocolo Dinheiro na Mesa';
  
  // 2. USA O LINK DE PAGAMENTO CADASTRADO NO PRODUTO
  let paymentLink = product?.payment_link || 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2631945277-b12d9ad4-02ec-486f-b02c-51da79714b61';
  
  // Se o link do banco for o de teste, força o real
  if (paymentLink.includes('stripe.com/test_example')) {
    paymentLink = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2631945277-b12d9ad4-02ec-486f-b02c-51da79714b61';
  }

  let msg = '';
  if (productId === 'sessao_individual') {
    msg = `Oi ${firstName || ''}! Eu sou a Laura, assistente pessoal da Luiza.\n\n` +
          `Vou te explicar como funciona o *Protocolo Dinheiro na Mesa*.\n\n` +
          `Assim que você entra no nosso sistema, o formulário detalhado é liberado pra você, junto com uma pasta exclusiva na nossa plataforma. Nessa pasta você vai colocar seus arquivos financeiros dos últimos 3 meses — faturas, extratos, contas e o que mais tiver.\n\n` +
          `Com os documentos disponíveis, a Luiza faz o seu diagnóstico completo e define o que precisa ser ajustado na sua realidade financeira. Depois, ela te apresenta tudo isso numa reunião de aproximadamente 1 hora, onde você tira suas dúvidas e já sai com condições de aplicar o que é preciso.\n\n` +
          `No final, você recebe:\n` +
          `- Seu dashboard financeiro com seus números organizados\n` +
          `- De 3 a 5 ações práticas\n` +
          `- Um mapa de projeção financeira para os próximos 2, 5 e 10 anos\n\n` +
          `Me conta: você tem alguma dúvida ou podemos seguir com o cadastro?`;
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
