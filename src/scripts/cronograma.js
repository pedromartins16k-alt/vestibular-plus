import { supabase } from '../lib/supabaseClient.js';
import { exigirAutenticacao } from '../lib/authGuard.js';

const listaEl = document.getElementById('cronograma-lista');
const filtroContainer = document.getElementById('filtro-materias');
const modalOverlay = document.getElementById('modal-overlay');
const selectMateria = document.getElementById('input-materia');

let dataSelecionada = null;
   let mesCalendario = new Date().getMonth();
   let anoCalendario = new Date().getFullYear();

   const inputDataDisplay = document.getElementById('input-data-display');
   const inputDataHidden = document.getElementById('input-data');
   const calendarioPopup = document.getElementById('calendario-popup');
   const calMesAno = document.getElementById('cal-mes-ano');
   const calGrid = document.getElementById('calendario-grid');

async function iniciar() {
  const session = await exigirAutenticacao();
  if (!session) return;
  userId = session.user.id;

  const { data: materias } = await supabase
    .from('materias')
    .select('id, nome, cor')
    .order('ordem');

  selectMateria.innerHTML = (materias || [])
    .map(m => `<option value="${m.id}">${m.nome}</option>`)
    .join('');

  renderFiltros(materias || []);
  await carregarCronograma();
}

async function carregarCronograma() {
  const { data } = await supabase
    .from('cronograma')
    .select('id, titulo, data, hora_inicio, hora_fim, concluido, materia_id, materias(nome, cor)')
    .eq('user_id', userId)
    .order('data')
    .order('hora_inicio');

  cronogramaCache = data || [];
  renderLista();
}

function renderFiltros(materias) {
  const chipsHtml = materias.map(m => `
    <div class="chip" data-materia="${m.id}">${m.nome}</div>
  `).join('');
  filtroContainer.innerHTML = `<div class="chip active" data-materia="todas">Todas</div>${chipsHtml}`;

  filtroContainer.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filtroContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      materiaAtiva = chip.dataset.materia;
      renderLista();
    });
  });
}

function renderLista() {
  const filtrados = materiaAtiva === 'todas'
    ? cronogramaCache
    : cronogramaCache.filter(c => c.materia_id === materiaAtiva);

  if (!filtrados.length) {
    listaEl.innerHTML = `<p class="empty-state">Nenhum compromisso agendado ainda. Clica em "+ Novo compromisso" pra começar! 🗓️</p>`;
    return;
  }

  const porDia = {};
  filtrados.forEach(item => {
    if (!porDia[item.data]) porDia[item.data] = [];
    porDia[item.data].push(item);
  });

  const hojeStr = new Date().toISOString().slice(0, 10);

  listaEl.innerHTML = Object.keys(porDia).sort().map(dataStr => {
    const itens = porDia[dataStr];
    const ehHoje = dataStr === hojeStr;
    const tituloDia = formatarDia(dataStr, ehHoje);

    const itensHtml = itens.map(item => {
      const cor = item.materias?.cor || '#7c3aed';
      const nomeMateria = item.materias?.nome || 'Geral';
      const horario = item.hora_inicio
        ? `${item.hora_inicio.slice(0,5)}${item.hora_fim ? ' – ' + item.hora_fim.slice(0,5) : ''}`
        : 'Sem horário definido';
      return `
        <div class="card item-card ${item.concluido ? 'concluido' : ''}" data-id="${item.id}">
          <div class="item-check ${item.concluido ? 'checked' : ''}" data-toggle="${item.id}">${item.concluido ? '✓' : ''}</div>
          <div class="item-info">
            <div class="item-titulo">${item.titulo}</div>
            <div class="item-meta">⏰ ${horario}</div>
          </div>
          <span class="item-tag" style="background:${cor}22; color:${cor};">${nomeMateria}</span>
          <span class="item-del" data-del="${item.id}">🗑️</span>
        </div>
      `;
    }).join('');

    return `
      <div class="dia-grupo">
        <div class="dia-titulo ${ehHoje ? 'hoje' : ''}">${tituloDia}</div>
        <div class="item-lista">${itensHtml}</div>
      </div>
    `;
  }).join('');

  listaEl.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => alternarConcluido(el.dataset.toggle));
  });
  listaEl.querySelectorAll('[data-del]').forEach(el => {
    el.addEventListener('click', () => excluirItem(el.dataset.del));
  });
}

function formatarDia(dataStr, ehHoje) {
  const data = new Date(dataStr + 'T00:00:00');
  const texto = data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return ehHoje ? `Hoje · ${texto}` : texto;
}

function renderCalendario() {
  const hoje = new Date();
  const primeiroDiaSemana = new Date(anoCalendario, mesCalendario, 1).getDay();
  const totalDias = new Date(anoCalendario, mesCalendario + 1, 0).getDate();
  const totalDiasMesAnterior = new Date(anoCalendario, mesCalendario, 0).getDate();

  const nomeMes = new Date(anoCalendario, mesCalendario, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  calMesAno.textContent = nomeMes;

  let celulas = '';

  for (let i = primeiroDiaSemana - 1; i >= 0; i--) {
    celulas += `<div class="cal-dia outro-mes">${totalDiasMesAnterior - i}</div>`;
  }

  for (let dia = 1; dia <= totalDias; dia++) {
    const dataStr = `${anoCalendario}-${String(mesCalendario + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const ehHoje = dataStr === hoje.toISOString().slice(0, 10);
    const ehSelecionado = dataStr === dataSelecionada;
    celulas += `<div class="cal-dia ${ehHoje ? 'hoje' : ''} ${ehSelecionado ? 'selecionado' : ''}" data-data="${dataStr}">${dia}</div>`;
  }

  const totalCelulas = primeiroDiaSemana + totalDias;
  const restante = (7 - (totalCelulas % 7)) % 7;
  for (let i = 1; i <= restante; i++) {
    celulas += `<div class="cal-dia outro-mes">${i}</div>`;
  }

  calGrid.innerHTML = celulas;

  calGrid.querySelectorAll('.cal-dia[data-data]').forEach(el => {
    el.addEventListener('click', () => selecionarDia(el.dataset.data));
  });
}

function selecionarDia(dataStr) {
  dataSelecionada = dataStr;
  inputDataHidden.value = dataStr;
  const data = new Date(dataStr + 'T00:00:00');
  inputDataDisplay.value = data.toLocaleDateString('pt-BR');
  calendarioPopup.classList.remove('open');
}

async function alternarConcluido(id) {
  const item = cronogramaCache.find(c => c.id === id);
  if (!item) return;
  const novoStatus = !item.concluido;
  await supabase.from('cronograma').update({ concluido: novoStatus }).eq('id', id);
  item.concluido = novoStatus;
  renderLista();
}

async function excluirItem(id) {
  if (!confirm('Excluir esse compromisso?')) return;
  await supabase.from('cronograma').delete().eq('id', id);
  cronogramaCache = cronogramaCache.filter(c => c.id !== id);
  renderLista();
}

async function salvarNovoItem() {
  const titulo = document.getElementById('input-titulo').value.trim();
  const materiaId = selectMateria.value;
  const data = document.getElementById('input-data').value;
  const horaInicio = document.getElementById('input-hora-inicio').value || null;
  const horaFim = document.getElementById('input-hora-fim').value || null;

  if (!titulo || !data) {
    alert('Preenche pelo menos o título e a data.');
    return;
  }

  const { error } = await supabase.from('cronograma').insert({
    user_id: userId,
    materia_id: materiaId || null,
    titulo,
    data,
    hora_inicio: horaInicio,
    hora_fim: horaFim,
    concluido: false,
  });

  if (error) {
    alert('Não deu pra salvar. Tenta de novo.');
    return;
  }

fecharModal();
  document.getElementById('input-titulo').value = '';
  document.getElementById('input-hora-inicio').value = '';
  document.getElementById('input-hora-fim').value = '';
  inputDataDisplay.value = '';
  inputDataHidden.value = '';
  dataSelecionada = null;
  await carregarCronograma();
}

function abrirModal() {
  modalOverlay.classList.add('open');
}
function fecharModal() {
  modalOverlay.classList.remove('open');
}
inputDataDisplay.addEventListener('click', (e) => {
  e.stopPropagation();
  calendarioPopup.classList.toggle('open');
  renderCalendario();
});
document.getElementById('cal-prev').addEventListener('click', (e) => {
  e.stopPropagation();
  mesCalendario--;
  if (mesCalendario < 0) { mesCalendario = 11; anoCalendario--; }
  renderCalendario();
});
document.getElementById('cal-next').addEventListener('click', (e) => {
  e.stopPropagation();
  mesCalendario++;
  if (mesCalendario > 11) { mesCalendario = 0; anoCalendario++; }
  renderCalendario();
});
document.addEventListener('click', (e) => {
  if (!calendarioPopup.contains(e.target) && e.target !== inputDataDisplay) {
    calendarioPopup.classList.remove('open');
  }
});
document.getElementById('btn-add').addEventListener('click', abrirModal);
document.getElementById('modal-close').addEventListener('click', fecharModal);
document.getElementById('btn-salvar').addEventListener('click', salvarNovoItem);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) fecharModal();
});

iniciar();
