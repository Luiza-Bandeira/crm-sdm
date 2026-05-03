import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const BASE     = Deno.env.get('EVOLUTION_API_URL')!;
const API_KEY  = Deno.env.get('EVOLUTION_API_KEY')!;
const INSTANCE = Deno.env.get('EVOLUTION_INSTANCE')!;

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const jid = url.searchParams.get('jid') || '189386700394574@lid';
    
    console.log(`[debug-jid] Resolvendo JID: ${jid}`);
    
    // Check if JID has @lid, if not append it if it's just numbers
    const target = jid.includes('@') ? jid : `${jid}@lid`;

    const response = await fetch(`${BASE}/contact/profile/${INSTANCE}`, {
      method: 'POST',
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number: target }),
    });

    const data = await response.json();
    console.log(`[debug-jid] Resultado para ${target}:`, JSON.stringify(data));

    return new Response(JSON.stringify({ 
      success: true, 
      target, 
      profile: data 
    }), { 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (err) {
    console.error('[debug-jid] Erro:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
