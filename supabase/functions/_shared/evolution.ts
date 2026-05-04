const BASE     = Deno.env.get('EVOLUTION_API_URL')!;
const API_KEY  = Deno.env.get('EVOLUTION_API_KEY')!;
const INSTANCE = Deno.env.get('EVOLUTION_INSTANCE')!;

export async function sendWhatsApp(phone: string, text: string) {
  // Limpa o número: remove tudo que não é dígito
  let cleanNumber = phone.replace(/\D/g, '');
  
  // Se o número não começar com 55 (Brasil) e tiver 10 ou 11 dígitos, adiciona o 55
  if (cleanNumber.length <= 11 && !cleanNumber.startsWith('55')) {
    cleanNumber = '55' + cleanNumber;
  }

  const url = `${BASE}/message/sendText/${INSTANCE}`;
  console.log(`[evolution] Enviando para: ${cleanNumber}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      number: cleanNumber, 
      text, 
      linkPreview: false
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[evolution] falha ao enviar:', JSON.stringify(data));
    return null;
  }
  
  return data?.key?.remoteJid || null;
}
