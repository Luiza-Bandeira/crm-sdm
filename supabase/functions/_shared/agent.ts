import { supabase } from '../_shared/db.ts';

// ============================================================
// AGENTE LAURA — Seu Dinheiro na Mesa v3
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
}

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// ── Persona ──────────────────────────────────────────────────
const PERSONA = `
# IDENTIDADE
Você é Laura, consultora de vendas do programa "Seu Dinheiro na Mesa".
Seu tom é caloroso, direto e honesto.

### PERSONALIDADE
- Direta, calorosa e sem rodeios — como uma amiga que entende de dinheiro
- Fala como gente, não como robô ou vendedor

# REGRAS INVIOLÁVEIS
1. NUNCA faça mais de 1 pergunta por mensagem.
2. NUNCA peça permissão para apresentar o programa.
3. Após 2 respostas sobre o problema, vá para a solução. Sem exceções.
4. Use o nome da pessoa no máximo 1 vez por mensagem.
5. Se a pessoa sinalizou interesse, avance para o fechamento ou agendamento.
`;

// ── Produto ───────────────────────────────────────────────────
const PRODUTO = `
# SOBRE O PROGRAMA
- Nome: Seu Dinheiro na Mesa
- Conteúdo: 5 módulos gravados + encontros ao vivo + 12 meses de acompanhamento
- Preço: 12x de R$ 206,85 no cartão
- Garantia: 30 dias sem risco
`;

const SPIN = `
# MÉTODO SPIN
### Etapa 1: Abertura (situacao)
### Etapa 2: Diagnóstico (problema/implicacao)
### Etapa 3: Pivot para a solução (necessidade)
### Etapa 4: Preço + garantia + CTA (fechamento)
### Etapa 5: Agendamento de Sessão Demonstrativa (CASO NÃO FECHE DIRETO)
Ofereça a sessão gratuita: "Quer entender melhor na prática? Tenho uma sessão gratuita disponível. Quer ver os horários?"
Se o lead aceitar, envie: "(gerado pelo sistema)"
`;

const OBJECOES = `
# TRATAMENTO DE INTERESSE
- "Sim" após produto → vá direto para preço + CTA
- "Quero agendar/conhecer" → Envie o link: "(gerado pelo sistema)"
`;

const FOLLOWUP = `
# REATIVAÇÃO (FOLLOW-UP)
1. 3-6h depois: Leve, sem pressão.
2. 24h depois: Fecha o ciclo.
`;

function buildSystemPrompt(state: AgentState, lead: Lead, availabilitySlots: any[]): string {
  const skillFaseAtual = extrairSkillDaFase(state.spin_phase);
  
  const resumoSessao = lead.notes
    ? `\n## RESUMO DA CONVERSA\n${lead.notes}\n`
    : '';

  // Formatação dos Horários Disponíveis
  let agendaText = "Nenhum horário específico cadastrado agora. Sugira que o lead escolha um horário comercial.";
  if (availabilitySlots && availabilitySlots.length > 0) {
    agendaText = availabilitySlots.map(s => {
      if (s.specific_date) {
        const d = new Date(s.specific_date).toLocaleDateString('pt-BR', {timeZone: 'UTC'});
        return `- Data única: ${d} das ${s.start_time} às ${s.end_time}`;
      } else {
        return `- Toda ${DAYS[s.day_of_week]} das ${s.start_time} às ${s.end_time}`;
      }
    }).join('\n');
  }

  return `${PERSONA}
${PRODUTO}
${resumoSessao}
## CONTEXTO
Lead: ${lead.name || 'Desconhecido'}
Fase: ${state.spin_phase}
Msg Count: ${state.follow_up_count}

## AGENDAMENTO — HORÁRIOS DISPONÍVEIS (SÓ OFEREÇA SE CHEGAR NA ETAPA DE AGENDAMENTO)
${agendaText}

${skillFaseAtual}
${OBJECOES}
${FOLLOWUP};

## PIPELINE (IDs)
2: Diagnóstico | 3: Apresentação | 4: Negociação | 5: Sessão Demonstrativa | 7: Ganho | 8: Perdido

## FORMATO DE RESPOSTA (JSON):
{
  "reply": "...",
  "phase": "situacao|problema|implicacao|necessidade|fechamento",
  "next_stage": ID,
  "spin_data": { "dor": "...", "nome": "..." },
  "score": 0,
  "notes": "resumo estrategico"
}`;
}

function extrairSkillDaFase(fase: string): string {
  const fasesDoSpin: Record<string, string> = {
    situacao:    extrairFase(SPIN, 'Etapa 1', 'Etapa 2'),
    problema:    extrairFase(SPIN, 'Etapa 2', 'Etapa 3'),
    implicacao:  extrairFase(SPIN, 'Etapa 2', 'Etapa 3'),
    necessidade: extrairFase(SPIN, 'Etapa 3', 'Etapa 4'),
    fechamento:  extrairFase(SPIN, 'Etapa 4', 'Etapa 5'),
  };
  return fasesDoSpin[fase] ?? SPIN;
}

function extrairFase(texto: string, inicio: string, fim: string | null): string {
  const idxInicio = texto.indexOf(`### ${inicio}`);
  const idxFim    = fim ? texto.indexOf(`### ${fim}`) : texto.length;
  if (idxInicio === -1) return texto;
  return `## FASE SPIN ATUAL\n` + texto.slice(idxInicio, idxFim).trim();
}

function phaseToStage(phase: string, score: number): number | null {
  if (phase === 'fechamento')  return score >= 90 ? 7 : 4;
  if (phase === 'necessidade') return 4;
  if (phase === 'implicacao')  return 3;
  if (phase === 'problema')    return 2;
  return null;
}

export async function generateAgentReply(
  history: { role: string; content: string }[],
  state: AgentState,
  lead: Lead & { notes?: string }
): Promise<AgentResult> {
  // Busca horários disponíveis
  const { data: slots } = await supabase.from('availability_slots').select('*');
  
  const systemPrompt = buildSystemPrompt(state, lead, slots || []);
  
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

    const score     = Number(parsed.score ?? 0);
    const phase     = String(parsed.phase ?? state.spin_phase);
    const nextStage = (parsed.next_stage as number | null) ?? phaseToStage(phase, score);
    const notes     = String(parsed.notes ?? (lead.name ? `Lead ativo: ${lead.name}` : ''));

    return {
      reply:    String(parsed.reply ?? ''),
      newPhase: phase,
      spinData: (parsed.spin_data as Record<string, unknown>) ?? {},
      score,
      nextStage,
      notes,
    };
  } catch (error: any) {
    console.error('[generateAgentReply] Erro fatal:', error);
    return {
      reply:    `[Erro de IA: ${error.message.substring(0, 100)}...]`,
      newPhase: state.spin_phase,
      spinData: {},
      score:    0,
      nextStage: lead.stage_id,
      notes:    lead.notes || '',
    };
  }
}
