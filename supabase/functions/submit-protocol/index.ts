// ============================================================
// Edge Function: submit-protocol
// Recebe as respostas do formulário de diagnóstico
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { supabase, logActivity } from '../_shared/db.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { lead_id, answers } = await req.json();

    if (!lead_id) {
      return Response.json({ error: 'lead_id obrigatório' }, { status: 400, headers: corsHeaders });
    }

    // Salva as respostas no metadata ou coluna específica
    const { error } = await supabase
      .from('leads')
      .update({ 
        metadata: { 
          form_submitted: true, 
          form_at: new Date().toISOString(),
          answers: answers 
        } 
      })
      .eq('id', lead_id);

    if (error) throw error;

    await logActivity(lead_id, 'note', 'Formulário de Protocolo preenchido pelo cliente.', null, null);

    return Response.json({ success: true }, { headers: corsHeaders });

  } catch (err) {
    console.error('[submit-protocol] Erro:', err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
