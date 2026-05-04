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

    // 1. Busca dados do lead (precisamos do drive_folder_url e nome)
    const { data: lead } = await supabase
      .from('leads')
      .select('name, drive_folder_url, metadata, notes')
      .eq('id', lead_id)
      .single();

    let driveLink = null;
    if (lead?.drive_folder_url) {
      // Extrai ID da pasta da URL: https://drive.google.com/drive/folders/ID
      const folderId = lead.drive_folder_url.split('/').pop();
      
      console.log('[submit-protocol] Folder ID extraído:', folderId);
      if (folderId && folderId !== 'undefined') {
        const timestamp = new Date().toLocaleDateString('pt-BR');
        const fileName = `Respostas Protocolo - ${lead.name} - ${timestamp}.html`;
        
        // Gera um HTML simples com as respostas
        let htmlContent = `<html><body style="font-family: sans-serif; padding: 40px; line-height: 1.6;">`;
        htmlContent += `<h1 style="color: #e8557a;">Protocolo Dinheiro na Mesa</h1>`;
        htmlContent += `<h2>Diagnóstico de ${lead.name}</h2>`;
        htmlContent += `<p>Data: ${new Date().toLocaleString('pt-BR')}</p><hr/>`;
        
        for (const [key, value] of Object.entries(answers)) {
          htmlContent += `<p><strong>${key}:</strong> ${Array.isArray(value) ? value.join(', ') : value}</p>`;
        }
        htmlContent += `</body></html>`;

        const { uploadFile } = await import('../_shared/google_drive.ts');
        driveLink = await uploadFile(folderId, fileName, htmlContent);
      }
    }

    // 2. Salva as respostas no metadata e atualiza a nota com o link do Drive
    const updateData: any = { 
      metadata: { 
        ...(lead?.metadata || {}),
        form_submitted: true, 
        form_at: new Date().toISOString(),
        answers: answers,
        responses_drive_link: driveLink
      } 
    };

    if (driveLink) {
      updateData.notes = (lead?.notes ? lead.notes + '\n\n' : '') + `📄 Respostas do Protocolo: ${driveLink}`;
    }

    const { error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', lead_id);

    if (error) throw error;

    await logActivity(lead_id, 'note', 'Formulário de Protocolo preenchido. Cópia salva no Drive.', null, null);

    return Response.json({ success: true, drive_link: driveLink }, { headers: corsHeaders });

  } catch (err) {
    console.error('[submit-protocol] Erro:', err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
