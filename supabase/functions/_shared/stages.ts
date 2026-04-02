export const STAGES = {
  NOVO_LEAD:             1,
  DIAGNOSTICO:           2,
  APRESENTACAO:          3,
  PRECO_NEGOCIACAO:      4,
  SESSAO_DEMONSTRATIVA:  5,
  REATIVACAO:            6,
  GANHO:                 7,
  PERDIDO:               8,
} as const;

export const STAGE_NAMES: Record<number, string> = {
  1: 'Novo Lead',
  2: 'Diagnóstico',
  3: 'Apresentação',
  4: 'Preço e Negociação',
  5: 'Sessão Demonstrativa',
  6: 'Reativação',
  7: 'Ganho 🏆',
  8: 'Perdido ❌',
};
