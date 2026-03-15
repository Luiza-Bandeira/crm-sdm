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
import { getAudioBase64, transcribeAudio }    from '../_shared/audio.ts';



serve(async (req) => {
  console.log(`[webhook-whatsapp] Request: ${req.method} ${req.url}`);
  // Evolution sempre espera 200 — nunca retornamos erro para ela
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  try {
    const rawBody = await req.text();
    console.log('[webhook-whatsapp] Raw Body:', rawBody);
    
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (e) {
      console.error('[webhook-whatsapp] Falha ao parsear JSON:', e.message);
      return new Response('ok', { status: 200 });
    }

    // Filtra apenas mensagens enviadas (upsert)
    if (event.event !== 'messages.upsert' && event.event !== 'MESSAGES_UPSERT') {
      console.log('[webhook-whatsapp] Ignorando evento não suportado:', event.event);
      return new Response('ok', { status: 200 });
    }

    const dataObj = event.data;
    if (!dataObj || !dataObj.key || !dataObj.message) {
      return new Response('ok', { status: 200 });
    }

    // Ignora mensagens enviadas por nós mesmos
    if (dataObj.key.fromMe) return new Response('ok', { status: 200 });

    const phone = dataObj.key.remoteJid?.replace('@s.whatsapp.net', '');
    const msg   = dataObj.message;
    const messageId = dataObj.key.id;

    // Detecta se é áudio
    const audioMsg = msg?.audioMessage;
    
    if (audioMsg && messageId && phone) {
      console.log(`[whatsapp] Áudio detectado de ${phone}`);
      // Notifica no console, mas não podemos salvar mensagem se ainda não buscamos o lead
      
      // Processa áudio em background
      (async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const base64 = await getAudioBase64(messageId, phone);
          if (base64) {
            const text = await transcribeAudio(base64);
            if (text) {
              console.log(`[transcription] ${phone}: ${text}`);
              await processMessage(phone, `[Áudio]: ${text}`);
            } else {
              console.error(`[audio] ${phone}: Não consegui transcrever o áudio.`);
            }
          }
        } catch (e: any) {
          console.error('[audio] Erro no processamento:', e);
        }
      })().catch(err => console.error('[audio] Erro não capturado:', err));

      return new Response('ok', { status: 200 });
    }

    // Extrai texto padrão
    const text  =
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption;

    if (!phone || !text) return new Response('ok', { status: 200 });

    // Processa mensagem de texto padrão
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
  const { reply, newPhase, spinData, score, nextStage, notes } =
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

  // ── Move card no pipeline e Salva Anotações ─────────
  if (nextStage && nextStage !== oldStage) {
    await supabase.from('leads')
      .update({ score, stage_id: nextStage, notes: notes || lead.notes })
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
    // Só atualiza score e notes
    await supabase.from('leads').update({ score, notes: notes || lead.notes }).eq('id', leadId);
  }

  // ── Envia resposta pelo WhatsApp ────────────────────────
  await sendWhatsApp(phone, reply);
}
