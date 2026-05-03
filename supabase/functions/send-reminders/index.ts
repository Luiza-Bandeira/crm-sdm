// ============================================================
// Edge Function: send-reminders
// Verifica reuniões nos próximos 30 minutos e envia lembretes
// Chamada via pg_cron a cada minuto
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWhatsApp } from '../_shared/evolution.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  // Aceita GET (de cron externo) ou POST (pg_cron via net.http_post)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('ok', { status: 200 });
  }

  try {
    const now = new Date();
    // Janela: reuniões entre 29 e 31 minutos no futuro
    const windowStart = new Date(now.getTime() + 29 * 60 * 1000).toISOString();
    const windowEnd   = new Date(now.getTime() + 31 * 60 * 1000).toISOString();

    console.log(`[send-reminders] Verificando reuniões entre ${windowStart} e ${windowEnd}`);

    // Busca meetings confirmadas que ainda não receberam lembrete
    const { data: meetings, error } = await supabase
      .from('meetings')
      .select('id, lead_id, meet_link, scheduled_start')
      .eq('reminder_sent', false)
      .eq('status', 'confirmed')
      .gte('scheduled_start', windowStart)
      .lte('scheduled_start', windowEnd);

    if (error) {
      console.error('[send-reminders] Erro ao buscar meetings:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!meetings || meetings.length === 0) {
      console.log('[send-reminders] Nenhuma reunião para lembrar agora.');
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    console.log(`[send-reminders] ${meetings.length} reunião(ões) encontrada(s).`);

    // Busca configurações do consultor (uma vez só)
    const { data: settings } = await supabase
      .from('scheduling_settings')
      .select('consultant_phone, consultant_name')
      .maybeSingle();

    let sent = 0;

    for (const meeting of meetings) {
      try {
        // Formata horário no fuso de Brasília
        const dt = new Date(meeting.scheduled_start);
        const horaFormatada = dt.toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

        // Busca dados do lead
        const { data: lead } = await supabase
          .from('leads')
          .select('name, phone')
          .eq('id', meeting.lead_id)
          .maybeSingle();

        if (!lead) {
          console.warn(`[send-reminders] Lead não encontrado para meeting ${meeting.id}`);
          continue;
        }

        // ── Lembrete para o LEAD ─────────────────────────────
        const msgLead =
          `⏰ *Lembrete — Sua sessão começa em 30 minutos!*\n\n` +
          `📅 *${horaFormatada}*\n` +
          `🔗 Acesse aqui: ${meeting.meet_link}\n\n` +
          `Te esperamos! 😊`;

        await sendWhatsApp(lead.phone, msgLead);
        console.log(`[send-reminders] Lembrete enviado ao lead: ${lead.phone}`);

        // ── Lembrete para o CONSULTOR ────────────────────────
        if (settings?.consultant_phone) {
          const msgConsultor =
            `⏰ *Sua próxima sessão começa em 30 minutos!*\n\n` +
            `👤 Lead: *${lead.name || lead.phone}*\n` +
            `📅 *${horaFormatada}*\n` +
            `🔗 ${meeting.meet_link}`;

          await sendWhatsApp(settings.consultant_phone, msgConsultor);
          console.log(`[send-reminders] Lembrete enviado ao consultor: ${settings.consultant_phone}`);
        }

        // Marca lembrete como enviado
        await supabase
          .from('meetings')
          .update({ reminder_sent: true })
          .eq('id', meeting.id);

        sent++;
      } catch (e) {
        console.error(`[send-reminders] Erro ao processar meeting ${meeting.id}:`, e);
      }
    }

    return new Response(JSON.stringify({ sent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[send-reminders] Erro geral:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
