// ============================================================
// Edge Function: webhook-payment
// Recebe confirmações de pagamento (Stripe/Hotmart)
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { supabase, logActivity } from '../_shared/db.ts';
import { sendWhatsApp }           from '../_shared/evolution.ts';
import { createClientFolder }    from '../_shared/google_drive.ts';
import { STAGES }                 from '../_shared/stages.ts';

serve(async (req) => {
  try {
    const body = await req.json();
    console.log('[webhook-payment] Recebido:', JSON.stringify(body));

    // Lógica simplificada para identificar o lead pelo telefone ou email
    // No Stripe, geralmente passamos o lead_id no client_reference_id
    const leadId = body.data?.object?.client_reference_id || body.lead_id;
    const email  = body.data?.object?.customer_details?.email || body.email;

    if (!leadId && !email) {
      return Response.json({ error: 'Identificador do lead não encontrado' }, { status: 400 });
    }

    // 1. Localiza o lead
    let query = supabase.from('leads').select('*, products(*)');
    if (leadId) query = query.eq('id', leadId);
    else query = query.eq('email', email);

    const { data: lead, error: leadError } = await query.maybeSingle();

    if (leadError || !lead) {
      console.error('[webhook-payment] Lead não encontrado:', leadId || email);
      return Response.json({ error: 'Lead não encontrado' }, { status: 404 });
    }

    // 2. Atualiza status de pagamento
    await supabase.from('leads').update({
      stage_id: STAGES.GANHO,
      payment_id: body.id || body.data?.object?.id,
      metadata: { ...lead.metadata, paid: true, paid_at: new Date().toISOString() }
    }).eq('id', lead.id);

    await logActivity(lead.id, 'stage_change', 'Pagamento confirmado! Iniciando onboarding.', lead.stage_id, STAGES.GANHO);

    // 3. Automação específica por produto
    if (lead.product_id === 'sessao_individual') {
      console.log('[webhook-payment] Iniciando onboarding Sessão Individual...');
      
      // Criar pasta no Drive
      const folderUrl = await createClientFolder(lead.name || 'Cliente');
      
      if (folderUrl) {
        await supabase.from('leads').update({ drive_folder_url: folderUrl }).eq('id', lead.id);
      }

      // Enviar links via WhatsApp
      const msg = 
        `🎉 *Pagamento Confirmado!* Parabéns pela sua decisão.\n\n` +
        `Agora vamos começar a preparar a sua *Sessão Individual*. Aqui estão os seus próximos passos:\n\n` +
        `1️⃣ *Preencha o Formulário de Protocolo:* ${lead.products?.form_link || 'Link pendente'}?id=${lead.id}\n\n` +
        `2️⃣ *Suba seus documentos na sua pasta exclusiva:* ${folderUrl || 'Erro ao criar pasta'}\n\n` +
        `Assim que você preencher o formulário e subir os documentos, eu vou analisar tudo para a nossa sessão. Até logo!`;

      await sendWhatsApp(lead.phone, msg);
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error('[webhook-payment] Erro fatal:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
