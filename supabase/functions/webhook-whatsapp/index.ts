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
  const timestamp = new Date().toISOString();
  console.log(`[webhook-whatsapp] [${timestamp}] Request: ${req.method} ${req.url}`);
  
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  let rawBody = '';
  try {
    rawBody = await req.text();
    console.log('[webhook-whatsapp] Raw Body Length:', rawBody.length);
    
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (e) {
      console.error('[webhook-whatsapp] Falha ao parsear JSON:', e.message);
      // Log failure to database for visibility
      await supabase.from('webhook_logs').insert({
        function_name: 'webhook-whatsapp',
        payload: { error: 'JSON_PARSE_ERROR', raw: rawBody.substring(0, 1000) },
        status: 'parse_error'
      });
      return new Response('ok', { status: 200 });
    }

    // Log the event to the database immediately
    await supabase.from('webhook_logs').insert({
      function_name: 'webhook-whatsapp',
      payload: event,
      status: 'received'
    });

    if (event.event !== 'messages.upsert' && event.event !== 'MESSAGES_UPSERT') {
      console.log('[webhook-whatsapp] Ignorando evento não suportado:', event.event);
      return new Response('ok', { status: 200 });
    }

    const dataObj = event.data;
    if (!dataObj || !dataObj.key || !dataObj.message) {
      console.log('[webhook-whatsapp] Evento malformado ou vazio.');
      return new Response('ok', { status: 200 });
    }

    if (dataObj.key.fromMe) return new Response('ok', { status: 200 });

    const rawJid   = dataObj.key.remoteJid;
    const msg      = dataObj.message;
    const messageId = dataObj.key.id;

    // ── Normaliza @lid → @s.whatsapp.net ─────────────────────────────────────
    // A Evolution API pode enviar @lid em vez do número real quando o WhatsApp
    // usa o novo sistema de privacidade LID. Tentamos recuperar o número real
    // de outros campos do payload antes de processar.
    const jid = normalizeJid(rawJid, event, dataObj);
    if (rawJid !== jid) {
      console.log(`[whatsapp] JID normalizado: ${rawJid} → ${jid}`);
    }

    // ── Filtra Grupos, Comunidades e o próprio Agente ───────────────────────
    if (
      jid.includes('@g.us') || 
      jid.includes('@broadcast') || 
      jid.includes('newsletter') ||
      jid.includes('553186460883') // Ignora o próprio número do agente
    ) {
      console.log(`[whatsapp] Ignorando mensagem de grupo/comunidade/próprio agente: ${jid}`);
      return new Response('ok', { status: 200 });
    }

    const audioMsg = msg?.audioMessage;
    
    if (audioMsg && messageId && jid) {
      console.log(`[whatsapp] Áudio detectado de ${jid}`);
      (async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const base64 = await getAudioBase64(messageId, jid);
          if (base64) {
            const text = await transcribeAudio(base64);
            if (text) {
              console.log(`[transcription] ${jid}: ${text}`);
              await processMessage(jid, `[Áudio]: ${text}`, messageId);
            } else {
              console.error(`[audio] ${jid}: Não consegui transcrever o áudio.`);
            }
          }
        } catch (e: any) {
          console.error('[audio] Erro no processamento:', e);
        }
      })().catch(err => console.error('[audio] Erro não capturado:', err));
      return new Response('ok', { status: 200 });
    }

    const text =
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption;

    if (!jid || !text) return new Response('ok', { status: 200 });

    processMessage(jid, text, messageId).catch(err =>
      console.error('[webhook-whatsapp] Erro no processamento:', err)
    );

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('[webhook-whatsapp] Erro ao parsear evento:', err);
    return new Response('ok', { status: 200 });
  }
});

// ============================================================
// NORMALIZA JID — converte @lid para @s.whatsapp.net quando possível
// A Evolution inclui o número real em campos como: sender, participant,
// phoneNumber, contact.id, ou remoteJid de outros eventos.
// ============================================================
function normalizeJid(rawJid: string, event: any, dataObj: any): string {
  if (!rawJid) return rawJid;
  
  // Se o JID já é um número real (@s.whatsapp.net), retorna ele
  if (rawJid.includes('@s.whatsapp.net')) return rawJid;

  // Candidatos de campos que podem conter o número real em diversos formatos
  const candidates: any[] = [
    dataObj?.key?.remoteJidAlt,             // Evolução v2: remoteJidAlt na key
    event?.remoteJidAlt,                    // Caso venha no nível do evento
    dataObj?.remoteJidAlt,                  // No data
    event?.senderPn,                        // Evolution API: real phone number
    dataObj?.senderPn,                      // Evolution API
    event?.sender,                          // campo sender no nível do evento
    dataObj?.sender,                        // campo sender no data
    dataObj?.phoneNumber,                   // algumas versões da Evolution
    dataObj?.contact?.id,                   // campo de contato
    dataObj?.key?.participant,              // participant dentro da key (em grupos)
    dataObj?.participant,                   // em grupos, o participant tem o número real
  ];

  for (let candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue;

    // Se o candidato já estiver no formato correto
    if (candidate.includes('@s.whatsapp.net')) {
      if (!candidate.includes('553186460883')) { // Ignora o bot
        return candidate;
      }
    }

    // Se o candidato for apenas números
    const numeric = candidate.replace(/\D/g, '');
    if (numeric.length >= 10 && numeric.length <= 15) {
      if (numeric !== '553186460883') {
        const formatted = `${numeric}@s.whatsapp.net`;
        console.log(`[whatsapp] Número real extraído de "${candidate}": ${formatted}`);
        return formatted;
      }
    }
  }

  // Se nada foi encontrado e é um @lid, logamos para diagnóstico mas mantemos o @lid
  if (rawJid.includes('@lid')) {
    console.log(`[whatsapp] Não foi possível extrair número real para o LID: ${rawJid}`);
  }
  
  return rawJid;
}

// ============================================================
// CORE — Processa mensagem recebida
// ============================================================
async function processMessage(jid: string, userText: string, messageId?: string) {
  console.log('[processMessage] Início (ID:', messageId, '):', jid);

  // 0. Idempotência: Checa se já processamos este ID de mensagem
  if (messageId) {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('external_id', messageId)
      .maybeSingle();

    if (existing) {
      console.log(`[processMessage] Mensagem duplicada ignorada (ID: ${messageId})`);
      return;
    }
  }

  const isLid = jid.includes('@lid');

  // 1. Match exato por JID
  let { data: lead } = await supabase
    .from('leads')
    .select('*, agent_state(*)')
    .eq('phone', jid)
    .maybeSingle();
  console.log('[processMessage] Lead via JID:', lead?.id || 'não encontrado');

  // 2. Match numérico — APENAS para @s.whatsapp.net (ou extraído de @lid via normalizeJid)
  if (!lead) {
    const numeric = jid.replace(/\D/g, '');
    if (numeric.length >= 10) {
      const { data: leadByNumbers } = await supabase
        .from('leads')
        .select('*, agent_state(*)')
        .eq('phone', numeric)
        .maybeSingle();
      
      if (leadByNumbers) {
        lead = leadByNumbers;
        console.log(`[whatsapp] Vinculando JID ${jid} ao lead numérico ${numeric}`);
        // Se o lead existia apenas com número, atualizamos para o JID completo (@s.whatsapp.net ou @lid)
        await supabase.from('leads').update({ phone: jid }).eq('id', lead.id);
      }
    }
  }

  // 3. Match por LID salvo em metadata.known_lids
  if (!lead && isLid) {
    const { data: leadByLid } = await supabase
      .from('leads')
      .select('*, agent_state(*)')
      .contains('metadata', { known_lids: [jid] })
      .maybeSingle();
    if (leadByLid) {
      lead = leadByLid;
      console.log(`[whatsapp] Lead encontrado via metadata known_lids: ${jid}`);
    }
  }

  // 4. Se não é @lid, busca em metadata.known_numbers
  if (!lead && !isLid) {
    const numeric = jid.replace(/\D/g, '');
    if (numeric.length >= 10) {
      const { data: leadByMeta } = await supabase
        .from('leads')
        .select('*, agent_state(*)')
        .contains('metadata', { known_numbers: [numeric] })
        .maybeSingle();
      if (leadByMeta) {
        lead = leadByMeta;
        console.log(`[whatsapp] Lead encontrado via metadata known_numbers: ${numeric}`);
        await supabase.from('leads').update({ phone: jid }).eq('id', lead.id);
      }
    }
  }

  // A Heurística de suposição de @lid foi removida para evitar atribuições incorretas.
  // Se o lead não foi identificado via JID, Número ou Metadata, não processamos.

  if (!lead) {
    console.log(`[processMessage] Ignorando mensagem de número desconhecido: ${jid}`);
    return;
  }

  const leadId     = lead.id;
  const oldStage   = lead.stage_id ?? STAGES.NOVO_LEAD;
  const agentState = lead.agent_state?.[0] ?? {
    spin_phase: 'situacao',
    spin_data: {},
    follow_up_count: 0,
  };

  console.log(`[whatsapp] Lead ID: ${leadId}, Phase: ${agentState.spin_phase}, Count: ${agentState.follow_up_count}, Active: ${agentState.is_active ?? true}`);
  
  if (agentState.is_active === false) {
    console.log(`[whatsapp] IA desativada para este lead (${leadId}). Abortando processamento.`);
    return;
  }

  // ── Se identificador é @lid, salva nos metadados para futuros matches ──
  if (jid.includes('@lid')) {
    const currentMeta  = lead.metadata || {};
    const knownLids    = currentMeta.known_lids || [];
    if (!knownLids.includes(jid)) {
      await supabase.from('leads')
        .update({ metadata: { ...currentMeta, known_lids: [...knownLids, jid] } })
        .eq('id', leadId);
      console.log(`[whatsapp] LID ${jid} registrado nos metadados do lead ${leadId}`);
    }
  }

  // ── Salva mensagem do usuário ───────────────────────────
  await saveMessage(leadId, 'user', userText, messageId);

  // ── Busca histórico completo (últimas 40 mensagens) ────────
  const { data: historyRaw } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })  // mais recentes primeiro
    .limit(40);

  // Inverte para que a ordem no prompt seja cronológica (mais antigas → mais novas)
  const history = (historyRaw ?? []).reverse();

  console.log('[processMessage] Chamando generateAgentReply...');
  const { reply, newPhase, spinData, score, nextStage, notes } =
    await generateAgentReply(history ?? [], agentState, lead);
  console.log('[processMessage] Resposta gerada:', reply.substring(0, 30) + '...');

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

    console.log(`[pipeline] ${jid}: ${STAGE_NAMES[oldStage]} → ${STAGE_NAMES[nextStage]}`);
  } else {
    // Só atualiza score e notes
    await supabase.from('leads').update({ score, notes: notes || lead.notes }).eq('id', leadId);
  }

  // ── Envia resposta pelo WhatsApp ────────────────────────
  // Quando a mensagem chega por @lid, usamos o telefone real do lead para responder.
  // A Evolution API não aceita @lid como destinatário, somente @s.whatsapp.net ou número.
  // ── Processa Link de Meet Simples ───────────────────────
  let finalReply = reply;
  if (finalReply.includes('(gerado pelo sistema)')) {
    // Modo mais simples possível de gerar um link único para a sala de reunião
    const simpleMeetLink = `https://meet.jit.si/Sessao-SDM-${leadId.substring(0, 8)}`;
    finalReply = finalReply.replace('(gerado pelo sistema)', simpleMeetLink);
    
    // Registra na tabela de meetings para controle no CRM
    try {
      await supabase.from('meetings').insert({
        lead_id: leadId,
        meet_link: simpleMeetLink,
        status: 'proposed'
      });
      
      // Move o lead automaticamente para o estágio "Sessão Demonstrativa" (ID 5)
      await supabase.from('leads').update({ stage_id: STAGES.SESSAO_DEMONSTRATIVA }).eq('id', leadId);
      console.log(`[whatsapp] Lead ${leadId} movido para Sessão Demonstrativa.`);

      // Notifica o Humano (Consultor) se houver telefone configurado
      const { data: settings } = await supabase.from('scheduling_settings').select('consultant_phone, consultant_name').maybeSingle();
      if (settings?.consultant_phone) {
        const notifyMsg = `🔔 *Laura Alerta [${settings.consultant_name || 'Consultor'}]:* O lead *${lead.name || lead.phone}* acaba de receber o link para Sessão Demonstrativa!\n\nEle(a) entrará em contato em breve ou aguarde no horário agendado.\n\nLink: ${simpleMeetLink}`;
        console.log(`[whatsapp] Notificando consultor: ${settings.consultant_phone}`);
        await sendWhatsApp(settings.consultant_phone, notifyMsg);
      }
    } catch (e) {
      console.error('[whatsapp] Erro ao salvar o meet_link ou notificar:', e);
    }
  }

  // ── Envia resposta pelo WhatsApp ────────────────────────
  const sendTo = (isLid && lead.phone && !lead.phone.includes('@lid'))
    ? lead.phone
    : jid;
  
  console.log('[processMessage] Enviando via WhatsApp para:', sendTo);
  await sendWhatsApp(sendTo, finalReply);
  console.log('[processMessage] Fim do processamento.');
}
