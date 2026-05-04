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

    // Garantir que o produto existe no banco
    await supabase.from('products').upsert({
      id: 'sessao_individual',
      name: 'Protocolo Dinheiro na Mesa',
      price_text: 'R$ 500,00',
      payment_link: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2631945277-b12d9ad4-02ec-486f-b02c-51da79714b61',
      form_link: 'https://www.protocolo.luizabandeira.com.br/Sessaoindividual/formulario-protocolo'
    });

    let leadId: string | null = null;
    let paymentId: string | null = null;
    let isApproved = false;

    // ── Lógica MERCADO PAGO ────────────────────────────────
    if (body.action && body.data?.id) {
      console.log('[webhook-payment] Processando Mercado Pago...');
      paymentId = body.data.id;
      
      const mpToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
      if (!mpToken) {
        console.error('[webhook-payment] MERCADO_PAGO_ACCESS_TOKEN não configurado');
        return Response.json({ error: 'Configuração pendente' }, { status: 500 });
      }

      // Consulta o status real do pagamento na API do MP
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${mpToken}` }
      });
      const mpData = await mpRes.json();
      
      isApproved = (mpData.status === 'approved');
      leadId = mpData.external_reference; 
      // Adiciona o e-mail do pagador ao corpo para o processamento unificado abaixo
      if (mpData.payer?.email) body.payer_email = mpData.payer.email;
    } 
    // ── Lógica STRIPE (Fallback) ───────────────────────────
    else {
      leadId = body.data?.object?.client_reference_id || body.lead_id;
      paymentId = body.id || body.data?.object?.id;
      isApproved = true; // No Stripe simplificado assumimos que o evento é de sucesso
    }

    if (!leadId) {
      console.error('[webhook-payment] Lead ID não encontrado no payload');
      return Response.json({ error: 'Identificador do lead não encontrado' }, { status: 400 });
    }

    if (!isApproved) {
      console.log('[webhook-payment] Pagamento ainda não aprovado:', paymentId);
      return Response.json({ success: true, message: 'Aguardando aprovação' });
    }

    // 1. Localiza o lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*, products(*)')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError || !lead) {
      console.error('[webhook-payment] Lead não encontrado:', leadId);
      return Response.json({ error: 'Lead não encontrado' }, { status: 404 });
    }

    // 2. Atualiza status de pagamento
    const payerEmail = body.payer_email || body.data?.object?.customer_details?.email || lead.email;
    
    await supabase.from('leads').update({
      stage_id: STAGES.GANHO,
      payment_id: paymentId,
      email: payerEmail,
      metadata: { ...lead.metadata, paid: true, paid_at: new Date().toISOString() }
    }).eq('id', lead.id);

    await logActivity(lead.id, 'stage_change', 'Pagamento confirmado! Iniciando onboarding.', lead.stage_id, STAGES.GANHO);

    // 3. Automação específica por produto
    if (lead.product_id === 'sessao_individual') {
      console.log('[webhook-payment] Iniciando onboarding Sessão Individual...');
      
      let folderUrl = lead.drive_folder_url;
      
      try {
        if (!folderUrl) {
          console.log('[webhook-payment] Criando pasta no Drive...');
          folderUrl = await createClientFolder(lead.name || 'Cliente');
          if (folderUrl) {
            await supabase.from('leads').update({ drive_folder_url: folderUrl }).eq('id', lead.id);
            console.log('[webhook-payment] Pasta criada:', folderUrl);
          }
        }
      } catch (driveError) {
        console.error('[webhook-payment] Erro ao criar pasta no Drive:', driveError);
        // Não interrompe o fluxo se o Drive falhar
      }
      
      try {
        console.log('[webhook-payment] Enviando WhatsApp...');
        const msg = 
          `🎉 *Pagamento Confirmado!* Parabéns pela sua decisão.\n\n` +
          `Agora vamos começar a preparar a sua *Sessão Individual*. Aqui estão os seus próximos passos:\n\n` +
          `1️⃣ *Preencha o Formulário de Protocolo:* ${lead.products?.form_link || 'Link pendente'}?id=${lead.id}\n\n` +
          `2️⃣ *Suba seus documentos na sua pasta exclusiva:* ${folderUrl || 'Erro ao criar pasta'}\n\n` +
          `Assim que você preencher o formulário e subir os documentos, eu vou analisar tudo para a nossa sessão. Até logo!`;

        await sendWhatsApp(lead.phone, msg);
        console.log('[webhook-payment] WhatsApp enviado para:', lead.phone);
      } catch (wsError) {
        console.error('[webhook-payment] Erro ao enviar WhatsApp:', wsError);
      }
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error('[webhook-payment] Erro fatal:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
