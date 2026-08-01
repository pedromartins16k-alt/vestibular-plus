-- ============================================================
-- SCHEMA — Plataforma de Estudos para Vestibulares e ENEM
-- Execute este arquivo no SQL Editor do seu projeto Supabase
-- ============================================================

-- Extensão para UUID
create extension if not exists "uuid-ossp";

-- ---------- PERFIS (ligado ao auth.users do Supabase) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  avatar_url text,
  nivel int default 1,
  xp int default 0,
  meta_diaria_minutos int default 60,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- ---------- MATÉRIAS ----------
create table public.materias (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  cor text default '#7c3aed',
  icone text,
  ordem int default 0
);

-- ---------- RESUMOS ----------
create table public.resumos (
  id uuid primary key default uuid_generate_v4(),
  materia_id uuid references public.materias(id) on delete cascade,
  titulo text not null,
  conteudo text not null,       -- markdown
  fonte text,                    -- fonte oficial/confiável usada
  nivel_dificuldade text check (nivel_dificuldade in ('facil','medio','dificil')),
  criado_em timestamptz default now()
);

-- ---------- QUESTÕES ----------
create table public.questoes (
  id uuid primary key default uuid_generate_v4(),
  materia_id uuid references public.materias(id) on delete cascade,
  enunciado text not null,
  alternativas jsonb not null,        -- [{"letra":"A","texto":"..."}]
  resposta_correta text not null,
  comentario text,                     -- explicação/correção comentada
  fonte text,                          -- ex: "ENEM 2022"
  ano int,
  dificuldade text check (dificuldade in ('facil','medio','dificil'))
);

-- ---------- SIMULADOS ----------
create table public.simulados (
  id uuid primary key default uuid_generate_v4(),
  titulo text not null,
  descricao text,
  tempo_limite_minutos int,
  criado_em timestamptz default now()
);

create table public.simulado_questoes (
  simulado_id uuid references public.simulados(id) on delete cascade,
  questao_id uuid references public.questoes(id) on delete cascade,
  ordem int default 0,
  primary key (simulado_id, questao_id)
);

create table public.simulado_respostas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  simulado_id uuid references public.simulados(id) on delete cascade,
  respostas jsonb not null,      -- {"questao_id":"letra_escolhida"}
  nota numeric,
  finalizado_em timestamptz default now()
);

-- ---------- FLASHCARDS ----------
create table public.flashcards (
  id uuid primary key default uuid_generate_v4(),
  materia_id uuid references public.materias(id) on delete cascade,
  frente text not null,
  verso text not null
);

create table public.flashcards_progresso (
  user_id uuid references public.profiles(id) on delete cascade,
  flashcard_id uuid references public.flashcards(id) on delete cascade,
  nivel_memorizacao int default 0,   -- espaçamento tipo Anki (0-5)
  proxima_revisao timestamptz default now(),
  primary key (user_id, flashcard_id)
);

-- ---------- CRONOGRAMA / METAS ----------
create table public.cronograma (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  materia_id uuid references public.materias(id),
  titulo text not null,
  data date not null,
  hora_inicio time,
  hora_fim time,
  concluido boolean default false
);

create table public.metas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  descricao text not null,
  tipo text check (tipo in ('horas_estudo','questoes_resolvidas','flashcards_revisados','simulados_feitos')),
  valor_alvo numeric not null,
  valor_atual numeric default 0,
  prazo date
);

-- ---------- HISTÓRICO / TEMPO ESTUDADO ----------
create table public.sessoes_estudo (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  materia_id uuid references public.materias(id),
  duracao_minutos int not null,
  tipo text, -- 'resumo','questoes','flashcards','simulado'
  criado_em timestamptz default now()
);

-- ---------- FAVORITOS ----------
create table public.favoritos (
  user_id uuid references public.profiles(id) on delete cascade,
  tipo text not null,        -- 'resumo','questao','flashcard'
  referencia_id uuid not null,
  criado_em timestamptz default now(),
  primary key (user_id, tipo, referencia_id)
);

-- ---------- CONQUISTAS / XP ----------
create table public.conquistas (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  descricao text,
  icone text,
  xp_recompensa int default 0
);

create table public.usuario_conquistas (
  user_id uuid references public.profiles(id) on delete cascade,
  conquista_id uuid references public.conquistas(id) on delete cascade,
  conquistado_em timestamptz default now(),
  primary key (user_id, conquista_id)
);

-- ---------- NOTIFICAÇÕES ----------
create table public.notificacoes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  titulo text not null,
  mensagem text,
  lida boolean default false,
  criado_em timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — boas práticas de segurança
-- ============================================================
alter table public.profiles enable row level security;
alter table public.simulado_respostas enable row level security;
alter table public.flashcards_progresso enable row level security;
alter table public.cronograma enable row level security;
alter table public.metas enable row level security;
alter table public.sessoes_estudo enable row level security;
alter table public.favoritos enable row level security;
alter table public.usuario_conquistas enable row level security;
alter table public.notificacoes enable row level security;

-- Cada usuário só acessa os próprios dados
create policy "usuario ve o proprio perfil" on public.profiles for select using (auth.uid() = id);
create policy "usuario edita o proprio perfil" on public.profiles for update using (auth.uid() = id);
create policy "usuario cria o proprio perfil" on public.profiles for insert with check (auth.uid() = id);

create policy "dono ve suas respostas" on public.simulado_respostas for all using (auth.uid() = user_id);
create policy "dono ve seu progresso flashcards" on public.flashcards_progresso for all using (auth.uid() = user_id);
create policy "dono ve seu cronograma" on public.cronograma for all using (auth.uid() = user_id);
create policy "dono ve suas metas" on public.metas for all using (auth.uid() = user_id);
create policy "dono ve suas sessoes" on public.sessoes_estudo for all using (auth.uid() = user_id);
create policy "dono ve seus favoritos" on public.favoritos for all using (auth.uid() = user_id);
create policy "dono ve suas conquistas" on public.usuario_conquistas for all using (auth.uid() = user_id);
create policy "dono ve suas notificacoes" on public.notificacoes for all using (auth.uid() = user_id);

-- Conteúdo (matérias, resumos, questões, simulados, flashcards, conquistas) é público para leitura
alter table public.materias enable row level security;
alter table public.resumos enable row level security;
alter table public.questoes enable row level security;
alter table public.simulados enable row level security;
alter table public.simulado_questoes enable row level security;
alter table public.flashcards enable row level security;
alter table public.conquistas enable row level security;

create policy "conteudo publico leitura" on public.materias for select using (true);
create policy "conteudo publico leitura" on public.resumos for select using (true);
create policy "conteudo publico leitura" on public.questoes for select using (true);
create policy "conteudo publico leitura" on public.simulados for select using (true);
create policy "conteudo publico leitura" on public.simulado_questoes for select using (true);
create policy "conteudo publico leitura" on public.flashcards for select using (true);
create policy "conteudo publico leitura" on public.conquistas for select using (true);

-- ============================================================
-- TRIGGER: cria automaticamente um "profile" quando alguém se cadastra
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', 'Aluno(a)'));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
