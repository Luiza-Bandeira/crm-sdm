import { supabase } from '../_shared/db.ts';

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
Você é Laura, consultora de vendas do programa "Seu Dinheiro na Mesa".
Seu tom é caloroso, direto e honesto — como uma amiga que entende de dinheiro.

### REGRAS INVIOLÁVEIS
1. NUNCA faça mais de 1 pergunta por mensagem.
2. NUNCA peça permissão para apresentar o programa.
3. Após 2 respostas sobre o problema, vá para a solução. Sem exceções.
4. Use o nome da pessoa no máximo 1 vez por mensagem.
5. Se a pessoa sinalizou interesse, avance para o fechamento ou agendamento.
6. NUNCA diga que vai enviar algo "depois" — envie agora na mesma mensagem.
`;

// ── Produto ───────────────────────────────────────────────────
const PRODUTO = `
# SOBRE O PROGRAMA
- Nome: Seu Dinheiro na Mesa
- Conteúdo: 5 módulos gravados + encontros ao vivo + 12 meses de acompanhamento
- Preço: 12x de R$ 206,85 no cartão
- Garantia: 30 dias sem risco
`;

// ── Sistema de Score ──────────────────────────────────────────
const SCORE_SYSTEM = `
# PONTUAÇÃO DO LEAD (campo "score" no JSON — OBRIGATÓRIO, NUNCA retorne 0 por padrão)
Calcule o score com base no engajamento e avanço na jornada:

| Situação                                              | Score |
|-------------------------------------------------------|-------|
| Primeiro contato, sem dados sobre o problema          |   10  |
| Lead descreveu o problema financeiro                  |   25  |
| Lead demonstrou urgência ou dor clara                 |   40  |
| Lead mostrou interesse no programa                    |   55  |
| Lead pediu preço ou mais detalhes                     |   65  |
| Lead sinalizou intenção de agendar                    |   75  |
| Lead confirmou horário (sessão agendada)              |   85  |
| Lead confirmou compra / pagamento                     |  100  |

REGRA: some +5 pontos por cada pergunta engajada feita pelo lead.
SEMPRE retorne o score atual correto, NUNCA retorne 0 após o primeiro contato.
`;

const SPIN = `
# MÉTODO SPIN
### Etapa 1: Abertura (situacao)
Entenda a situação financeira atual.

### Etapa 2: Diagnóstico (problema/implicacao)
Aprofunde o problema e mostre as consequências.

### Etapa 3: Pivot para a solução (necessidade)
Conecte o programa como solução direta ao problema.

### Etapa 4: Preço + garantia + CTA (fechamento)
Apresente o preço com garantia e convide para comprar ou agendar.

### Etapa 5: Agendamento de Sessão Demonstrativa
Se o lead não fechar direto, ofereça a sessão gratuita.
`;

const OBJECOES = `
# TRATAMENTO DE INTERESSE
- "Sim" após produto → vá direto para preço + CTA
- "Quero agendar/conhecer" → sugira 2 horários concretos (veja AGENDAMENTO abaixo)
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

  // Gera os próximos slots disponíveis a partir de hoje
  const today = new Date();
  const suggestions = gerarSugestoes(availabilitySlots, today);

  let agendaText = "Nenhum horário cadastrado. Sugira um horário comercial genérico (ex: segundas às 9h ou 14h).";
  if (suggestions.length > 0) {
    agendaText = suggestions.map(s => `- ${s.label} → ISO: ${s.iso}`).join('\n');
  }

  return `${PERSONA}
${PRODUTO}
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

## PIPELINE (IDs)
2: Diagnóstico | 3: Apresentação | 4: Negociação | 5: Sessão Demonstrativa | 7: Ganho | 8: Perdido

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

// Gera sugestões de horários com base nos slots disponíveis
function gerarSugestoes(slots: any[], referencia: Date): { label: string; iso: string }[] {
  if (!slots || slots.length === 0) return [];

  const sugestoes: { label: string; iso: string; isAfternoon: boolean }[] = [];

  // Gera os próximos 14 dias
  for (let offset = 1; offset <= 14 && sugestoes.length < 4; offset++) {
    const dia = new Date(referencia);
    dia.setDate(referencia.getDate() + offset);
    const diaSemana = dia.getDay();

    for (const slot of slots) {
      if (slot.specific_date) continue; // Ignora datas únicas por simplicidade
      if (slot.day_of_week !== diaSemana) continue;

      // Pega o horário de início do slot
      const [hh, mm] = slot.start_time.split(':').map(Number);
      const isAfternoon = hh >= 12;

      // Evita duplicar manhã ou tarde já adicionada
      const jaTemManha = sugestoes.some(s => !s.isAfternoon);
      const jaTemTarde = sugestoes.some(s => s.isAfternoon);
      if (isAfternoon && jaTemTarde) continue;
      if (!isAfternoon && jaTemManha) continue;

      const isoDate = dia.toISOString().split('T')[0];
      const isoTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
      const iso = `${isoDate}T${isoTime}`;

      const nomeDia = DAYS[diaSemana];
      const label = `${nomeDia} ${dia.getDate().toString().padStart(2,'0')}/${(dia.getMonth()+1).toString().padStart(2,'0')} às ${slot.start_time}`;

      sugestoes.push({ label, iso, isAfternoon });
    }
  }

  return sugestoes.slice(0, 2); // Retorna no máximo 1 manhã + 1 tarde
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

    // Score: usa o valor do GPT mas garante mínimo de 10 após primeiro contato
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
