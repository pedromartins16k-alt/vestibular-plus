/**
 * objetivo.js — Sistema de Objetivo do Aluno
 *
 * Gerencia a seleção e persistência do objetivo do aluno:
 * vestibular, curso, universidade e data-alvo.
 *
 * Estratégia de persistência:
 *  1. Tenta salvar/ler do Supabase (profiles.objetivo_json)
 *  2. Fallback: localStorage (funciona mesmo sem a coluna no banco)
 *
 * NOTA: A coluna `objetivo_json` em `profiles` precisa existir no Supabase.
 * Veja CLAUDE_DATABASE_PROMPT.md para executar a migration.
 */

import { supabase } from '../lib/supabaseClient.js';

const LS_KEY = 'vestibular_objetivo_v1';

// ----------------------------------------------------------------
// Dados de vestibulares (importados do JSON configurável)
// ----------------------------------------------------------------
let _vestibularesData = null;

async function carregarVestibulares() {
  if (_vestibularesData) return _vestibularesData;
  try {
    const resp = await fetch('../data/vestibulares.json');
    const json = await resp.json();
    _vestibularesData = json.vestibulares || [];
  } catch (err) {
    console.warn('[objetivo] Não foi possível carregar vestibulares.json:', err);
    _vestibularesData = [];
  }
  return _vestibularesData;
}

// ----------------------------------------------------------------
// Persistência
// ----------------------------------------------------------------

/**
 * Salva o objetivo no localStorage (sempre) e tenta salvar no Supabase.
 */
export async function salvarObjetivo(objetivo) {
  if (!objetivo) return;

  const payload = {
    ...objetivo,
    configurado_em: new Date().toISOString()
  };

  // Sempre salva localmente como fallback
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch (_) {}

  // Tenta salvar no Supabase (requer migration executada)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({ objetivo_json: payload })
        .eq('id', user.id);

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = coluna não existe ainda (migration pendente)
        console.warn('[objetivo] Erro ao salvar no Supabase (migration pendente?):', error.message);
      }
    }
  } catch (err) {
    console.warn('[objetivo] Supabase indisponível, usando localStorage:', err.message);
  }

  return payload;
}

/**
 * Lê o objetivo: tenta Supabase, fallback localStorage.
 */
export async function lerObjetivo() {
  // Tenta ler do Supabase
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('objetivo_json')
        .eq('id', user.id)
        .single();

      if (!error && data?.objetivo_json) {
        // Sincroniza com localStorage
        try { localStorage.setItem(LS_KEY, JSON.stringify(data.objetivo_json)); } catch (_) {}
        return data.objetivo_json;
      }
    }
  } catch (_) {}

  // Fallback: localStorage
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}

  return null;
}

/**
 * Remove o objetivo do usuário.
 */
export async function limparObjetivo() {
  try { localStorage.removeItem(LS_KEY); } catch (_) {}
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ objetivo_json: null })
        .eq('id', user.id);
    }
  } catch (_) {}
}

// ----------------------------------------------------------------
// Contagem regressiva
// ----------------------------------------------------------------

/**
 * Retorna dias restantes até a data da prova.
 * @param {string} dataProva — formato 'YYYY-MM-DD'
 */
export function calcularDiasRestantes(dataProva) {
  if (!dataProva) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prova = new Date(dataProva + 'T00:00:00');
  const diff = prova - hoje;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Formata a contagem regressiva para exibição.
 */
export function formatarContagem(dias) {
  if (dias === null) return '—';
  if (dias < 0) return 'Prova realizada';
  if (dias === 0) return 'Hoje!';
  if (dias === 1) return '1 dia';
  return `${dias} dias`;
}

// ----------------------------------------------------------------
// Modal de configuração de objetivo
// ----------------------------------------------------------------

/**
 * Abre o modal de seleção de objetivo do aluno.
 * Cria o modal dinamicamente se não existir.
 */
export async function abrirModalObjetivo(onSalvar) {
  let modal = document.getElementById('modal-objetivo');
  if (!modal) {
    modal = criarModalObjetivo();
    document.body.appendChild(modal);
  }

  const vestibulares = await carregarVestibulares();
  const objetivo = await lerObjetivo();

  preencherSelectVestibulares(modal, vestibulares, objetivo);
  if (objetivo) preencherFormulario(modal, objetivo);

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Handler de salvar
  const form = modal.querySelector('#form-objetivo');
  const btnSalvar = modal.querySelector('#btn-salvar-objetivo');
  const btnFechar = modal.querySelector('#btn-fechar-objetivo');

  const fechar = () => {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  };

  btnFechar?.addEventListener('click', fechar, { once: true });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) fechar();
  }, { once: true });

  btnSalvar?.addEventListener('click', async () => {
    const dados = coletarDadosFormulario(modal, vestibulares);
    if (!dados) return;
    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando...';
    const resultado = await salvarObjetivo(dados);
    btnSalvar.disabled = false;
    btnSalvar.textContent = '✅ Salvo!';
    setTimeout(() => {
      fechar();
      if (typeof onSalvar === 'function') onSalvar(resultado);
    }, 600);
  }, { once: true });
}

function criarModalObjetivo() {
  const div = document.createElement('div');
  div.id = 'modal-objetivo';
  div.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.75);
    display: none; align-items: center; justify-content: center;
    z-index: 3000; padding: 20px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  `;
  div.innerHTML = `
    <div style="
      max-width: 520px; width: 100%;
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: 0 24px 60px rgba(0,0,0,0.5);
      padding: 32px;
      position: relative;
      max-height: 90vh;
      overflow-y: auto;
    ">
      <button id="btn-fechar-objetivo" style="
        position: absolute; top: 16px; right: 16px;
        width: 36px; height: 36px; border-radius: 50%;
        border: 1px solid var(--border-color);
        background: var(--bg-elevated);
        cursor: pointer; font-size: 1.1rem;
        display: flex; align-items: center; justify-content: center;
        color: var(--text-secondary);
      " aria-label="Fechar">✕</button>

      <div style="margin-bottom: 24px;">
        <div style="
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 0.75rem; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.07em; color: var(--color-primary-500);
          background: rgba(124,58,237,0.1); padding: 4px 12px;
          border-radius: var(--radius-full); border: 1px solid rgba(124,58,237,0.2);
          margin-bottom: 12px;
        ">🎯 Meu Objetivo</div>
        <h2 style="font-size: 1.4rem; font-weight: 800; margin: 0 0 8px; line-height: 1.25;">
          Qual é o seu vestibular?
        </h2>
        <p style="font-size: 0.9rem; color: var(--text-secondary); margin: 0; line-height: 1.5;">
          Configure seu objetivo para receber um plano personalizado e contagem regressiva da sua prova.
        </p>
      </div>

      <form id="form-objetivo" style="display: flex; flex-direction: column; gap: 18px;">
        <div>
          <label style="display: block; font-size: 0.84rem; font-weight: 700; margin-bottom: 8px; color: var(--text-secondary);">
            🎓 Vestibular
          </label>
          <select id="sel-vestibular" class="input-field" style="width: 100%;" required>
            <option value="">— Selecione o vestibular —</option>
          </select>
        </div>

        <div>
          <label style="display: block; font-size: 0.84rem; font-weight: 700; margin-bottom: 8px; color: var(--text-secondary);">
            🏛️ Universidade
          </label>
          <input id="inp-universidade" class="input-field" type="text"
            placeholder="Ex: USP, UNICAMP, UNESP..." style="width: 100%;" />
        </div>

        <div>
          <label style="display: block; font-size: 0.84rem; font-weight: 700; margin-bottom: 8px; color: var(--text-secondary);">
            📖 Curso Desejado
          </label>
          <input id="inp-curso" class="input-field" type="text"
            placeholder="Ex: Engenharia de Computação, Medicina..." style="width: 100%;" />
        </div>

        <div id="grupo-data-prova" style="display:none;">
          <label style="display: block; font-size: 0.84rem; font-weight: 700; margin-bottom: 8px; color: var(--text-secondary);">
            📅 Data da 1ª Fase
          </label>
          <input id="inp-data-prova" class="input-field" type="date" style="width: 100%;" />
          <p id="msg-data-oficial" style="font-size: 0.78rem; color: var(--color-primary-500); margin: 6px 0 0; display: none;"></p>
        </div>

        <button type="button" id="btn-salvar-objetivo" class="btn btn-primary" style="
          width: 100%; height: 48px; font-size: 0.95rem; font-weight: 700;
          border-radius: var(--radius-md); margin-top: 4px;
        ">
          🚀 Definir Objetivo
        </button>
      </form>
    </div>
  `;

  div.style.display = 'none';
  div.classList.contains = div.classList.contains.bind(div.classList);
  div.classList.add = div.classList.add.bind(div.classList);
  div.classList.remove = div.classList.remove.bind(div.classList);

  // Observar classe 'open' para exibir/ocultar
  const observer = new MutationObserver(() => {
    div.style.display = div.classList.contains('open') ? 'flex' : 'none';
  });
  observer.observe(div, { attributes: true, attributeFilter: ['class'] });

  // Listener do select de vestibular para preencher data oficial
  div.querySelector('#sel-vestibular')?.addEventListener('change', async (e) => {
    const id = e.target.value;
    const vestibulares = await carregarVestibulares();
    const vest = vestibulares.find(v => v.id === id);
    const grupoData = div.querySelector('#grupo-data-prova');
    const msgData = div.querySelector('#msg-data-oficial');
    const inpData = div.querySelector('#inp-data-prova');
    const inpUniv = div.querySelector('#inp-universidade');

    if (vest) {
      grupoData.style.display = 'block';
      if (vest.primeira_fase?.data) {
        inpData.value = vest.primeira_fase.data;
        msgData.style.display = 'block';
        msgData.textContent = `📌 Data oficial: ${vest.primeira_fase.data_formatada}`;
      } else {
        inpData.value = '';
        msgData.style.display = 'none';
      }
      if (vest.instituicao && !inpUniv.value) {
        inpUniv.value = vest.instituicao.split('—')[0].trim();
      }
    } else {
      grupoData.style.display = 'none';
    }
  });

  return div;
}

function preencherSelectVestibulares(modal, vestibulares, objetivo) {
  const sel = modal.querySelector('#sel-vestibular');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Selecione o vestibular —</option>';
  vestibulares.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.icone || '🎓'} ${v.nome} ${v.edicao}`;
    if (objetivo?.vestibular_id === v.id) opt.selected = true;
    sel.appendChild(opt);
  });
}

function preencherFormulario(modal, objetivo) {
  if (!objetivo) return;
  const sel = modal.querySelector('#sel-vestibular');
  const inpUniv = modal.querySelector('#inp-universidade');
  const inpCurso = modal.querySelector('#inp-curso');
  const inpData = modal.querySelector('#inp-data-prova');
  const grupoData = modal.querySelector('#grupo-data-prova');

  if (sel && objetivo.vestibular_id) {
    sel.value = objetivo.vestibular_id;
    grupoData.style.display = 'block';
  }
  if (inpUniv && objetivo.universidade) inpUniv.value = objetivo.universidade;
  if (inpCurso && objetivo.curso) inpCurso.value = objetivo.curso;
  if (inpData && objetivo.data_prova) inpData.value = objetivo.data_prova;
}

function coletarDadosFormulario(modal, vestibulares) {
  const sel = modal.querySelector('#sel-vestibular');
  const inpUniv = modal.querySelector('#inp-universidade');
  const inpCurso = modal.querySelector('#inp-curso');
  const inpData = modal.querySelector('#inp-data-prova');

  if (!sel?.value) {
    sel?.focus();
    return null;
  }

  const vest = vestibulares.find(v => v.id === sel.value);

  return {
    vestibular_id: sel.value,
    vestibular_nome: vest ? `${vest.nome} ${vest.edicao}` : sel.options[sel.selectedIndex]?.text,
    universidade: inpUniv?.value?.trim() || (vest?.instituicao || ''),
    curso: inpCurso?.value?.trim() || '',
    data_prova: inpData?.value || vest?.primeira_fase?.data || null,
    edital_questoes: vest?.primeira_fase?.total_questoes || null
  };
}
