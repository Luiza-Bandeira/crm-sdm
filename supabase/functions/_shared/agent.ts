import { supabase } from './db.ts';

// ============================================================
// AGENTE LAURA — Seu Dinheiro na Mesa v4
// ============================================================

export interface AgentState {
  spin_phase: string;
  spin_data: Record<string, unknown>;
  follow_up_count: number;
  is_active?: boolean;
}

export interface Lead {
  id: string;
  name?: string;
  phone: string;
  stage_id: number;
  score?: number;
  notes?: string;
}

export interface AgentResult {
  reply: string;
  newPhase: string;
  spinData: Record<string, unknown>;
  score: number;
  nextStage: number | null;
  notes: string;
  scheduledTime: string | null;
}

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// ============================================================
// PERSONAS POR PRODUTO
// ============================================================

const PERSONA_SESSAO_INDIVIDUAL = `
# IDENTIDADE
Você é Laura, assistente pessoal da Luiza, consultora financeira.
Você é quem faz o primeiro contato com cada lead que se interessou pelo **Dinheiro na Mesa**.
Seu tom é caloroso, direto e honesto — como uma amiga que entende de dinheiro.

## PRODUTO: Dinheiro na Mesa
- Sessão individual com a Luiza (aproximadamente 1 hora)
- Diagnóstico completo baseado nos documentos financeiros do cliente (últimos 3 meses)
- Entrega de dashboard financeiro com números organizados
- 3 a 5 ações práticas de ajuste imediato
- Mapa de projeção financeira para 2, 5 e 10 anos
- Acesso a uma pasta exclusiva para subir documentos e formulário detalhado
- Valor: R$500
- Pagamento antecipado para garantir a vaga

## REGRAS DE ATENDIMENTO
1. FOCO TOTAL: Fale APENAS sobre a Sessão Individual. Nunca mencione outros cursos ou treinamentos.
2. NUNCA peça permissão para explicar o produto — explique direto se o lead demonstrou interesse.
3. NUNCA peça dados cadastrais ou de pagamento. Envie o link oficial informado.
4. NUNCA faça mais de 1 pergunta por mensagem.
5. TOM: Fale como uma pessoa real, frases curtas, parágrafos pequenos. Sem jargões.

## FLUXO (Siga a fase SPIN atual)
- situacao: Explique como funciona (pasta de arquivos, diagnóstico, reunião de 1h, entregas).
- problema/implicacao: Entenda e aprofunde a dor (impacto concreto, dívidas, sensação de não sair do lugar).
- necessidade: Cheque se faz sentido avançar após ouvir a dor.
- fechamento: Direto ao pagamento. O pagamento é antecipado para liberar o formulário e a pasta.
- onboarding: O cliente JÁ PAGOU. Agradeça o prazo estipulado por ele para preencher o formulário. Diga que vai deixar anotado e que a Luiza fará o agendamento assim que ele enviar tudo.

## OBJEÇÕES FREQUENTES
- Tá caro: R$500 se paga em semanas ao descobrir onde o dinheiro vaza. Caro é continuar sem saber.
- Pagar depois: Pagamento antecipado é o modelo para garantir compromisso e liberar acesso prévio.
- Preciso pensar: Pergunte o que ficou em dúvida. Reforce que as vagas são limitadas.
`;

const PERSONA_PROGRAMA_COMPLETO = `
# IDENTIDADE
Você é Laura, consultora de vendas da Luiza Bandeira.
Você atende leads interessados no treinamento completo **Seu Dinheiro na Mesa**.
Seu tom é caloroso, motivador e focado em transformação de longo prazo.

## PRODUTO: Programa Seu Dinheiro na Mesa (Completo)
- 5 módulos gravados + encontros ao vivo + 12 meses de acompanhamento.
- Foco em eliminar dívidas, organizar finanças e começar a investir.
- Ideal para quem quer um método passo a passo e suporte contínuo.

## REGRAS DE ATENDIMENTO
1. FOCO TOTAL: Fale APENAS sobre o Programa Completo.
2. NUNCA faça mais de 1 pergunta por mensagem.
3. Use o método SPIN para qualificar antes de oferecer o link de inscrição.
4. PAGAMENTO: NUNCA peça dados de pagamento. Envie o link oficial.
`;

function buildSystemPrompt(state: AgentState, lead: Lead, availabilitySlots: any[], product: any): string {
  const skillFaseAtual = extrairSkillDaFase(state.spin_phase);
  const persona = product.id === 'sessao_individual' ? PERSONA_SESSAO_INDIVIDUAL : PERSONA_PROGRAMA_COMPLETO;
  
  const resumoSessao = lead.notes
    ? `\n## RESUMO DA CONVERSA\n${lead.notes}\n`
    : '';

  const productContext = `
## PRODUTO ATUAL NO CONTEXTO
- Nome: ${product.name}
- Preço/Condições: ${product.price_text}
- Link de Inscrição: 
${product.payment_link}
(IMPORTANTE: Sempre envie este link EXATAMENTE como fornecido acima, em uma linha isolada e sem modificações. Ele já contém todos os parâmetros necessários para identificação do lead).
`;

  // Gera os próximos slots disponíveis a partir de hoje
  const today = new Date();
  const suggestions = gerarSugestoes(availabilitySlots, today);

  let agendaText = "Nenhum horário cadastrado. Sugira um horário comercial genérico.";
  if (suggestions.length > 0) {
    agendaText = suggestions.map(s => `- ${s.label} → ISO: ${s.iso}`).join('\n');
  }

  return `${persona}
${productContext}
${REGRAS_FORMATACAO}
${resumoSessao}
## CONTEXTO DO LEAD
Lead: ${lead.name || 'Desconhecido'}
Fase SPIN atual: ${state.spin_phase}
Msg Count: ${state.follow_up_count}

${SCORE_SYSTEM}

## AGENDAMENTO (Se aplicável ao produto)
Se o lead quiser agendar (ex: para a sessão demonstrativa do programa completo), siga os horários:
${agendaText}

## FOCO DO MOMENTO:
${skillFaseAtual}

${OBJECOES}
${FOLLOWUP};

## FORMATO DE RESPOSTA (JSON — TODOS OS CAMPOS SÃO OBRIGATÓRIOS):
{
  "reply": "Sua resposta aqui...",
  "phase": "situacao|problema|implicacao|necessidade|fechamento|onboarding",
  "next_stage": <número do ID do estágio>,
  "spin_data": { "dor": "...", "nome": "..." },
  "score": <número entre 10 e 100>,
  "scheduled_time": "<ISO datetime se confirmado, null caso contrário>",
  "notes": "resumo estratégico curto"
}`;
}

const REGRAS_FORMATACAO = `
## REGRAS DE FORMATAÇÃO (WHATSAPP)
1. Máximo 3 parágrafos curtos por mensagem.
2. NUNCA faça mais de 1 pergunta por mensagem.
3. Use *negrito* para destacar pontos importantes.
4. Emojis com moderação (1-2 por mensagem).
5. ESPAÇAMENTO: Sempre deixe um espaço antes e depois de links para não quebrar a URL.
`;

const SCORE_SYSTEM = `
## SISTEMA DE PONTUAÇÃO
- 10: Primeiro contato realizado.
- 40: Diagnóstico em andamento (lead respondendo).
- 70: Lead qualificado (dor identificada e interesse na solução).
- 100: Lead pronto para fechamento ou agendado.
`;

const OBJECOES = `
## QUEBRA DE OBJEÇÕES
- "Tá caro": Foque no valor da transformação e no parcelamento (12x).
- "Vou pensar": Crie urgência (vagas limitadas, bônus).
- "Não funciona": Cite que o método é prático e tem acompanhamento.
`;

const FOLLOWUP = `
## REGRAS DE FOLLOW-UP
- Se o lead sumir, use um gancho de curiosidade ou escassez na próxima mensagem.
`;

function extrairSkillDaFase(phase: string): string {
  const skills: Record<string, string> = {
    situacao: "Foque em entender o cenário atual. Não venda ainda.",
    problema: "Foque em fazer o lead sentir a dor do problema financeiro.",
    implicacao: "Foque nas consequências negativas de não resolver o problema agora.",
    necessidade: "Foque em como a solução resolve as dores específicas dele.",
    fechamento: "Foque em enviar o link e garantir a vaga agora.",
    onboarding: "O cliente já pagou. Seu foco é agradecer o envio do prazo para subir os arquivos e se colocar à disposição."
  };
  return skills[phase] || skills.situacao;
}

function gerarSugestoes(slots: any[], today: Date) {
  if (!slots || slots.length === 0) return [];
  
  // Mapeamento de dias para números
  const dayMap: Record<string, number> = {
    'Domingo': 0, 'Segunda': 1, 'Terça': 2, 'Quarta': 3, 'Quinta': 4, 'Sexta': 5, 'Sábado': 6
  };

  const sugestoes = [];
  const startDay = today.getDay();

  // Gera sugestões para os próximos 7 dias
  for (let i = 1; i <= 7; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + i);
    const dayName = DAYS[targetDate.getDay()];
    
    const daySlots = slots.filter(s => s.day_of_week === dayName);
    for (const slot of daySlots) {
      const isoDate = targetDate.toISOString().split('T')[0];
      sugestoes.push({
        label: `${dayName} ${targetDate.getDate()}/${targetDate.getMonth() + 1} às ${slot.start_time}`,
        iso: `${isoDate}T${slot.start_time}:00`
      });
    }
    if (sugestoes.length >= 4) break;
  }
  
  return sugestoes;
}

function phaseToStage(phase: string, score: number): number | null {
  if (phase === 'fechamento')  return 4; // Negociação
  if (phase === 'necessidade') return 3; // Apresentação
  if (phase === 'implicacao' || phase === 'problema') return 2; // Diagnóstico
  return null;
}

export async function generateAgentReply(
  history: { role: string; content: string }[],
  state: AgentState,
  lead: Lead & { notes?: string; product_id?: string }
): Promise<AgentResult> {
  // 1. Busca detalhes do produto
  const productId = lead.product_id || 'sessao_individual'; // Default alterado para sessao_individual para segurança
  console.log(`[generateAgentReply] Lead ID: ${lead.id}, ProductID: ${productId}`);

  const { data: productRaw } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .maybeSingle();

  const product = productRaw ? { ...productRaw } : null;

  // OVERRIDE DE SEGURANÇA: Garante que o link e nome estejam corretos mesmo que o banco esteja desatualizado
  if (product) {
    if (product.id === 'sessao_individual') {
      product.name = 'Protocolo Dinheiro na Mesa';
      product.price_text = 'R$ 500,00';
      if (!product.payment_link || product.payment_link.includes('stripe.com/test_example')) {
        product.payment_link = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2631945277-b12d9ad4-02ec-486f-b02c-51da79714b61';
      }
    }
  }

  // Prepara o link final com external_reference para evitar erros de separador (? ou &)
  let finalPaymentLink = product?.payment_link || 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2631945277-b12d9ad4-02ec-486f-b02c-51da79714b61';
  
  try {
    const url = new URL(finalPaymentLink);
    url.searchParams.set('external_reference', lead.id);
    finalPaymentLink = url.toString();
  } catch (err) {
    console.error('[agent] Erro ao formatar URL:', err);
    // Fallback simples se URL falhar
    const separator = finalPaymentLink.includes('?') ? '&' : '?';
    finalPaymentLink = `${finalPaymentLink}${separator}external_reference=${lead.id}`;
  }

  if (!product) {
    console.error(`[generateAgentReply] CRITICAL: Product not found for ID: ${productId}`);
  }

  // 2. Busca horários disponíveis
  const { data: slots } = await supabase.from('availability_slots').select('*');
  
  const systemPrompt = buildSystemPrompt(state, lead, slots || [], {
    ...(product || {}),
    id: productId,
    name: product?.name || 'Protocolo Dinheiro na Mesa',
    price_text: product?.price_text || 'R$ 500,00',
    payment_link: finalPaymentLink
  } as any);
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role, content: h.content })),
  ];

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await res.json();
    if (!data.choices || data.choices.length === 0) throw new Error('OpenAI Failure');

    let parsed: any;
    const rawText = data.choices[0].message.content ?? '';
    try { parsed = JSON.parse(rawText.replace(/(```json|```)/g, '')); } catch { parsed = { reply: rawText }; }

    const rawScore   = Number(parsed.score ?? 0);
    const score      = rawScore > 0 ? rawScore : (state.follow_up_count > 0 ? 10 : 0);
    const phase      = String(parsed.phase ?? state.spin_phase);
    const nextStage  = (parsed.next_stage as number | null) ?? phaseToStage(phase, score);
    const notes      = String(parsed.notes ?? (lead.name ? `Lead ativo: ${lead.name}` : ''));
    const scheduledTime = parsed.scheduled_time ? String(parsed.scheduled_time) : null;

    return {
      reply:         String(parsed.reply ?? ''),
      newPhase:      phase,
      spinData:      (parsed.spin_data as Record<string, unknown>) ?? {},
      score,
      nextStage,
      notes,
      scheduledTime,
    };
  } catch (error: any) {
    console.error('[generateAgentReply] Erro fatal:', error);
    return {
      reply:         `[Erro de IA: ${error.message.substring(0, 100)}...]`,
      newPhase:      state.spin_phase,
      spinData:      {},
      score:         lead.score ?? 0,
      nextStage:     lead.stage_id,
      notes:         lead.notes || '',
      scheduledTime: null,
    };
  }
}
