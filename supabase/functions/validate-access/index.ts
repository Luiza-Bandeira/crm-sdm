import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { supabase } from '../_shared/db.ts';
import { STAGES } from '../_shared/stages.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email } = await req.json();

    if (!email) {
      return Response.json({ success: false, error: 'E-mail obrigatório' }, { headers: corsHeaders });
    }

    // Busca o lead pelo e-mail que já pagou (Status Ganho ou metadata paid)
    const { data: lead, error } = await supabase
      .from('leads')
      .select('id, drive_folder_url, stage_id, metadata')
      .eq('email', email.toLowerCase().trim())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!lead) {
      return Response.json({ success: false, error: 'Lead não encontrado' }, { headers: corsHeaders });
    }

    // Verifica se o pagamento está confirmado (Stage Ganho ou flag no metadata)
    const isPaid = (lead.stage_id === STAGES.GANHO || lead.metadata?.paid === true);

    if (!isPaid) {
      return Response.json({ success: false, error: 'Pagamento pendente' }, { headers: corsHeaders });
    }

    return Response.json({ 
      success: true, 
      lead_id: lead.id,
      drive_folder_url: lead.drive_folder_url
    }, { headers: corsHeaders });

  } catch (err) {
    console.error('[validate-access] Erro:', err);
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
  }
});
