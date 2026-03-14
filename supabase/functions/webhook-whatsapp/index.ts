// ============================================================
// Edge Function: webhook-whatsapp
// Recebe mensagens da Evolution API (WhatsApp)
//
// URL configurada na Evolution:
// POST /functions/v1/webhook-whatsapp
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { supabase, saveMessage, logActivity } from '../_shared/db.ts';
import { sendWhatsApp }                       from '../_shared/evolution.ts';
import { generateAgentReply }                 from '../_shared/agent.ts';
import { STAGES, STAGE_NAMES }               from '../_shared/stages.ts';

serve(async (req) => {
  // Evolution sempre espera 200 — nunca retornamos erro para ela
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  try {
    const event = await req.json();

    // ── Filtra apenas mensagens de texto recebidas ──────────
    if (event.event !== 'messages.upsert') return new Response('ok', { status: 200 });

    const msg = event.data?.message;

    // Ignora mensagens enviadas por nós mesmos
    if (!msg || msg.key?.fromMe) return new Response('ok', { status: 200 });

    // Extrai telefone e texto
    const phone = msg.key?.remoteJid?.replace('@s.whatsapp.net', '');
    const text  =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption;

    if (!phone || !text) return new Response('ok', { status: 200 });

    // Processa em background para responder 200 imediatamente
    // (Evolution tem timeout curto)
    processMessage(phone, text).catch(err =>
      console.error('[webhook-whatsapp] Erro no processamento:', err)
    );

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('[webhook-whatsapp] Erro ao parsear evento:', err);
    return new Response('ok', { status: 200 });
  }
});

// ============================================================
// CORE — Processa mensagem recebida
// ============================================================
async function processMessage(phone: string, userText: string) {
  // ── Busca ou cria lead ──────────────────────────────────
  let { data: lead } = await supabase
    .from('leads')
    .select('*, agent_state(*)')
    .eq('phone', phone)
    .maybeSingle();

  if (!lead) {
    // Lead novo — veio direto pelo WhatsApp (sem passar pela landing page)
    const { data: newLead } = await supabase
      .from('leads')
      .insert({
        phone,
        source:   'whatsapp_inbound',
        stage_id: STAGES.NOVO_LEAD,
      })
      .select('id')
      .single();

    await supabase.from('agent_state').insert({
      lead_id:    newLead!.id,
      spin_phase: 'situacao',
      spin_data:  {},
    });

    await logActivity(newLead!.id, 'stage_change', 'Lead criado via WhatsApp direto', null, STAGES.NOVO_LEAD);

    lead = {
      ...newLead,
      stage_id:    STAGES.NOVO_LEAD,
      agent_state: [{ spin_phase: 'situacao', spin_data: {}, follow_up_count: 0 }],
    };

    console.log(`[whatsapp] Novo lead criado via WhatsApp direto: ${phone}`);
  }

  const leadId     = lead.id;
  const oldStage   = lead.stage_id ?? STAGES.NOVO_LEAD;
  const agentState = lead.agent_state?.[0] ?? {
    spin_phase: 'situacao',
    spin_data: {},
    follow_up_count: 0,
  };

  // ── Salva mensagem do usuário ───────────────────────────
  await saveMessage(leadId, 'user', userText);

  // ── Busca histórico completo ────────────────────────────
  const { data: history } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .limit(40);

  // ── Gera resposta via agente SPIN ───────────────────────
  const { reply, newPhase, spinData, score, nextStage } =
    await generateAgentReply(history ?? [], agentState, lead);

  // ── Salva resposta do agente ────────────────────────────
  await saveMessage(leadId, 'assistant', reply);

  // ── Atualiza estado do agente ───────────────────────────
  await supabase.from('agent_state').update({
    spin_phase:     newPhase,
    spin_data:      { ...agentState.spin_data, ...spinData },
    last_message_at: new Date().toISOString(),
    follow_up_count: (agentState.follow_up_count ?? 0) + 1,
  }).eq('lead_id', leadId);

  // ── Atualiza nome do lead se o agente coletou ──────────
  if (spinData?.nome && !lead.name) {
    await supabase.from('leads')
      .update({ name: spinData.nome })
      .eq('id', leadId);
  }

  // ── Move card no pipeline ───────────────────────────────
  if (nextStage && nextStage !== oldStage) {
    await supabase.from('leads')
      .update({ score, stage_id: nextStage })
      .eq('id', leadId);

    await logActivity(
      leadId,
      'stage_change',
      `Movido de "${STAGE_NAMES[oldStage]}" → "${STAGE_NAMES[nextStage]}" pelo agente`,
      oldStage,
      nextStage
    );

    console.log(`[pipeline] ${phone}: ${STAGE_NAMES[oldStage]} → ${STAGE_NAMES[nextStage]}`);
  } else {
    // Só atualiza score
    await supabase.from('leads').update({ score }).eq('id', leadId);
  }

  // ── Envia resposta pelo WhatsApp ────────────────────────
  await sendWhatsApp(phone, reply);
}
