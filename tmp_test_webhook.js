
const url = 'https://ekyisfmxmxcwtgdwvfen.supabase.co/functions/v1/webhook-whatsapp';
const payload = {
  event: 'messages.upsert',
  data: {
    key: {
      remoteJid: '553899273737@s.whatsapp.net',
      fromMe: false,
      id: 'LOCAL_TEST_' + Date.now()
    },
    message: {
      conversation: 'Oi Laura, você está funcionando?'
    }
  }
};

console.log('Enviando request para:', url);
fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(res => {
  console.log('Status:', res.status);
  return res.text();
})
.then(text => console.log('Resposta:', text))
.catch(err => console.error('Erro:', err));
