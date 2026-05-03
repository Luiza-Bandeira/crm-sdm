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

// ── Persona ──────────────────────────────────────────────────
const PERSONA = `
# IDENTIDADE
Você é Laura, consultora de vendas especialista em educação financeira.
Seu tom é caloroso, direto e honesto — como uma amiga que entende de dinheiro.

### REGRAS INVIOLÁVEIS
1. NUNCA faça mais de 1 pergunta por mensagem.
2. NUNCA peça permissão para apresentar o programa.
3. Após 2 respostas sobre o problema, vá para a solução. Sem exceções.
4. Use o nome da pessoa no máximo 1 vez por mensagem.
5. Se a pessoa sinalizou interesse, avance para o fechamento ou agendamento.
6. NUNCA diga que vai enviar algo "depois" — envie agora na mesma mensagem.
7. PAGAMENTO: NUNCA peça dados cadastrais ou de pagamento. Envie o link oficial informado no contexto.
8. GRAMÁTICA: Escreva sempre em português perfeito.
`;

function buildSystemPrompt(state: AgentState, lead: Lead, availabilitySlots: any[], product: any): string {
  const skillFaseAtual = extrairSkillDaFase(state.spin_phase);
  
  const resumoSessao = lead.notes
    ? `\n## RESUMO DA CONVERSA\n${lead.notes}\n`
    : '';

  const productContext = `
## PRODUTO ATUAL
- Nome: ${product.name}
- Descrição: ${product.description}
- Preço/Condições: ${product.price_text}
- Link de Inscrição: ${product.payment_link}
`;

  // Gera os próximos slots disponíveis a partir de hoje
  const today = new Date();
  const suggestions = gerarSugestoes(availabilitySlots, today);

  let agendaText = "Nenhum horário cadastrado. Sugira um horário comercial genérico (ex: segundas às 9h ou 14h).";
  if (suggestions.length > 0) {
    agendaText = suggestions.map(s => `- ${s.label} → ISO: ${s.iso}`).join('\n');
  }

  return `${PERSONA}
${productContext}
${REGRAS_FORMATACAO}
${resumoSessao}
## CONTEXTO
Lead: ${lead.name || 'Desconhecido'}
Fase: ${state.spin_phase}
Msg Count: ${state.follow_up_count}

${SCORE_SYSTEM}

## AGENDAMENTO — SOMENTE NA ETAPA 5
Quando o lead quiser agendar, siga RIGOROSAMENTE:
1. Ofereça EXATAMENTE 2 opções dos horários abaixo (1 manhã + 1 tarde de dias diferentes).
2. Exemplo: "Tenho *Segunda 07/04 às 09h* ou *Terça 08/04 às 14h*. Qual fica melhor?"
3. Quando o lead CONFIRMAR um horário, na sua resposta:
   - Confirme o dia e hora com clareza
   - Escreva exatamente esta frase no final: "O link da reunião está logo abaixo:"
   - NÃO bloqueie nem prometa enviar depois — o sistema adiciona o link automaticamente.
4. No JSON, preencha "scheduled_time" com o ISO do horário confirmado: "YYYY-MM-DDTHH:MM:00"

### PRÓXIMOS HORÁRIOS DISPONÍVEIS:
${agendaText}

${skillFaseAtual}
${OBJECOES}
${FOLLOWUP};

## PIPELINE (IDs - REGRAS DE USO)
- 2: Diagnóstico (Lead respondendo perguntas do SPIN)
- 3: Apresentação (Lead conhecendo detalhes do programa)
- 4: Negociação (Lead com link de checkout ou negociando preço)
- 5: Sessão Demonstrativa (Lead agendado para conversa 1 a 1)
- 7: Ganho (SOMENTE se houver confirmação real de pagamento)
- 8: Perdido (ESTRITAMENTE para leads desqualificados, que desistiram ou pediram para parar)

## FORMATO DE RESPOSTA (JSON — TODOS OS CAMPOS SÃO OBRIGATÓRIOS):
{
  "reply": "...",
  "phase": "situacao|problema|implicacao|necessidade|fechamento",
  "next_stage": <número do ID do estágio>,
  "spin_data": { "dor": "...", "nome": "..." },
  "score": <número entre 10 e 100 conforme tabela acima — NUNCA 0>,
  "scheduled_time": "<ISO datetime se lead confirmou horário, null caso contrário>",
  "notes": "resumo estratégico curto"
}`;
}

// ... (manter funções auxiliares gerarSugestoes, extrairSkillDaFase, extrairFase, phaseToStage)

export async function generateAgentReply(
  history: { role: string; content: string }[],
  state: AgentState,
  lead: Lead & { notes?: string; product_id?: string }
): Promise<AgentResult> {
  // 1. Busca detalhes do produto
  const productId = lead.product_id || 'programa_completo';
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  // 2. Busca horários disponíveis
  const { data: slots } = await supabase.from('availability_slots').select('*');
  
  const systemPrompt = buildSystemPrompt(state, lead, slots || [], product || {
    name: 'Programa Seu Dinheiro na Mesa',
    description: 'Consultoria e educação financeira',
    price_text: 'Consulte condições',
    payment_link: 'https://pay.hotmart.com/I104619180M'
  });
  
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
