import { iniciarNotificacoes } from './notificacoes-global.js';
import { iniciarBusca } from './busca-global.js';
import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';
import { PONTOS_XP, xpParaProximoNivel } from '../utils/xp.js';
import { verificarConquistas } from './conquistas.js';

const conteudo = document.getElementById('conteudo');
const filtrosTabs = document.getElementById('filtros-tabs');
let sessionUserId = null;

// Estado da listagem
let todosSimulados = [];
let filtroAtual = 'todos';

// Estado de um simulado em andamento
let questoesDoSimulado = [];
let indiceAtual = 0;
let respostasDadas = {}; // { questao_id: 'letra' }
let simuladoAtual = null;
let tempoRestante = 0;
let timerInterval = null;

const ORDEM_DIFICULDADE = { facil: 0, medio: 1, dificil: 2, genio: 3 };
const LABEL_DIFICULDADE = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil', genio: 'Gênio' };
const FILTROS = [
  { chave: 'todos', label: 'Tudo' },
  { chave: 'facil', label: 'Fácil' },
  { chave: 'medio', label: 'Médio' },
  { chave: 'dificil', label: 'Difícil' },
  { chave: 'genio', label: 'Gênio' },
];

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  sessionUserId = session.user.id;

  const { data: simulados } = await supabase
    .from('simulados')
    .select('id, titulo, descricao, tempo_limite_minutos, dificuldade, vestibulares(nome)')
    .order('criado_em', { ascending: false });

  todosSimulados = (simulados ||
