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
    let folderUrl = lead?.drive_folder_url;

    // Se o lead não tem pasta ou é a pasta antiga (sem quota), cria uma nova
    if (!folderUrl || folderUrl.includes('undefined')) {
      const { createClientFolder } = await import('../_shared/google_drive.ts');
      folderUrl = await createClientFolder(lead.name || 'Cliente');
      if (folderUrl) {
        await supabase.from('leads').update({ drive_folder_url: folderUrl }).eq('id', lead_id);
      }
    }

    if (folderUrl) {
      const folderId = folderUrl.match(/folders\/([^/?]+)/)?.[1];
      if (folderId) {
        const timestamp = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        const fileName = `RESPOSTAS_PROTOCOLO_${lead.name}_${timestamp}.txt`;
        
        let textContent = `PROTOCOLO DINHEIRO NA MESA\n`;
        textContent += `Diagnóstico de: ${lead.name}\n`;
        textContent += `Data: ${new Date().toLocaleString('pt-BR')}\n`;
        textContent += `------------------------------------------\n\n`;
        
        for (const [key, value] of Object.entries(answers)) {
          textContent += `${key.toUpperCase()}: ${Array.isArray(value) ? value.join(', ') : value}\n`;
        }

        const { uploadFile } = await import('../_shared/google_drive.ts');
        driveLink = await uploadFile(folderId, fileName, textContent, 'text/plain');
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
      },
      notes: (lead?.notes ? lead.notes + '\n\n' : '') + `📄 Respostas do Protocolo: ${driveLink || 'Falha ao salvar no Drive (verifique cota/permissão)'}`
    };

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
