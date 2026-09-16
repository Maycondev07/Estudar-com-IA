# Treineiro — site em HTML puro (multi-página, com login opcional e Supabase)

Site estático (HTML/CSS/JS puro, sem framework) com 5 páginas. **Login não é
obrigatório para usar o chat** — qualquer visitante já cai direto no
Início e pode conversar com o Treineiro. No canto superior direito da
navbar aparecem os botões **Entrar** / **Criar conta** (ou o e-mail da
pessoa + **Sair**, se já estiver logada).

- **Início** (`index.html`) — chat com o Treineiro (diagnóstico, plano de
  estudos, simulados). Funciona sem login; para *salvar* um simulado ao
  final, a IA pede para entrar ou criar conta.
- **Entrar** (`login.html`) — cadastro/login por e-mail e senha.
- **Simulados** (`simulados.html`) — histórico de simulados. Exige login
  (é onde os dados ficam guardados). Pode ser salvo automaticamente a
  partir do chat (quando a IA fecha a correção com "Pontuação final: X/Y")
  ou registrado manualmente.
- **Matérias** (`materias.html`) — lista de matérias com nível (fraco /
  médio / bom). Exige login.
- **Perfil** (`perfil.html`) — nome, prova alvo, estatísticas, a **árvore de
  skills** (cada matéria vira um "nó" ligado a você, com anel de progresso
  colorido conforme o nível) e a seção de **evolução**: um gráfico mostrando
  sua média geral de domínio ao longo do tempo, mais um histórico de quando
  cada matéria mudou de nível. Exige login.

Simulados/Matérias/Perfil pedem login porque os dados ficam guardados no
Supabase, atrelados à conta — sem conta não tem onde guardar. Quem chega
sem estar logado vê um aviso com botões de Entrar/Criar conta no lugar do
conteúdo dessas três páginas.

## Login e banco de dados (Supabase)

Já criei um projeto Supabase de verdade para este site, chamado **Treineiro**
(região `sa-east-1`, plano gratuito). Nele:

- **Auth** cuida do login por e-mail/senha.
- 4 tabelas guardam os dados: `profiles`, `materias`, `simulados` e
  `skill_history` (essa última é preenchida sozinha, por um gatilho no
  banco, toda vez que uma matéria é criada ou muda de nível — é o que
  alimenta o gráfico de evolução).
- **Row Level Security (RLS)** está ativado em todas elas: cada usuário só
  consegue ler ou escrever nos próprios dados, mesmo que tente manipular as
  chamadas pelo navegador.

A URL e a chave pública (`anon key`) do projeto já estão configuradas em
`public/js/supabaseClient.js`. Essa chave é **pública por natureza** (feita para
rodar no navegador) — quem garante a segurança de verdade são as políticas
de RLS no banco, não o sigilo dessa chave.

Se um dia vocês quiserem usar outro projeto Supabase (por exemplo, ao
transferir para a conta de vocês), é só:
1. Criar as mesmas 4 tabelas — o SQL completo está no fim deste README.
2. Trocar `SUPABASE_URL` e `SUPABASE_ANON_KEY` em `public/js/supabaseClient.js`.

Por padrão, o Supabase pede confirmação por e-mail antes de liberar o login
depois do cadastro. Se quiser testar mais rápido sem configurar e-mail,
dá pra desligar essa exigência em **Authentication → Settings → Email Auth**
no painel do Supabase (`Confirm email`).

## 1. Rodando localmente

Pré-requisito: [Node.js](https://nodejs.org) 18 ou mais novo (só para rodar
o servidorzinho local — o site em si é HTML puro).

```bash
cp .env.example .env.local
```

Abra `.env.local` e cole sua chave de API (veja abaixo como conseguir uma).

```bash
node server.js
```

Acesse http://localhost:3000

## 2. Conseguindo uma chave de API de IA

Já vem configurado para o **Google Gemini** (modelo `gemini-3.6-flash`), que
tem plano gratuito sem cartão de crédito:

1. Acesse https://aistudio.google.com/apikey (entre com uma conta Google).
2. Clique em "Create API key".
3. Cole em `AI_API_KEY` no `.env.local`.

Os limites do plano gratuito do Gemini mudam com frequência por modelo —
confira o valor atual em aistudio.google.com antes de ir para produção. Se
estourar, a API responde com erro 429 e volta ao normal na próxima janela.

**Nota:** a Google descontinua modelos do Gemini periodicamente para novas
contas (foi o que aconteceu com o `gemini-2.5-flash`, por exemplo). Se um
dia a API começar a responder erro 404 dizendo que o modelo não existe
mais, é só trocar o valor de `AI_API_MODEL` (aqui e na Vercel) pelo modelo
mais novo que a mensagem de erro recomendar.

Quer usar **Groq**, **DeepSeek**, **Qwen** (Alibaba) ou **Kimi** (Moonshot)
em vez disso? Só trocar as 3 variáveis `AI_API_BASE_URL`, `AI_API_MODEL` e
`AI_API_KEY` — os valores já estão comentados no `.env.example`. Nenhuma
mudança de código é necessária, porque todas essas APIs seguem o mesmo
formato "compatível OpenAI".

**API do Manus:** ela funciona por tarefas assíncronas, não por chat direto
como as opções acima. Se quiser usá-la, me avise que eu adapto
`lib/chatHandler.js` para esse formato.

## 3. Publicando (deploy)

Mais simples pela [Vercel](https://vercel.com) (plano grátis):

1. Suba esta pasta para um repositório no GitHub.
2. Em vercel.com → "Add New Project" → importe o repositório. A Vercel
   detecta sozinha a pasta `public/` como o site estático e `api/chat.js`
   como função serverless — não precisa configurar build command nem
   output directory.
3. Em "Environment Variables", adicione `AI_API_BASE_URL`, `AI_API_MODEL` e
   `AI_API_KEY`.
4. Clique em "Deploy".

Qualquer outro provedor de hospedagem de site estático (Netlify, GitHub
Pages, Cloudflare Pages) também serve o conteúdo de `public/`, mas como eles
não rodam a função `api/chat.js` do mesmo jeito, o chat com a IA só
funcionaria de fato na Vercel (ou em um servidor Node que rode `server.js`,
como uma VPS) — as páginas Simulados/Matérias/Perfil funcionam em qualquer
hospedagem, já que dependem só do navegador.

## 4. Estrutura do projeto

Tudo que é **site** (o que o navegador carrega) mora em `public/`. Tudo que
é **servidor** (fala com a IA, protege a chave de API) mora em `api/` e
`lib/`. Configuração do projeto fica solta na raiz.

```
public/                         ← site estático (isso é o que vai pro ar)
  login.html                     → página de login/cadastro
  index.html                     → página Início (chat) — protegida por login
  simulados.html                  → página Simulados — protegida por login
  materias.html                   → página Matérias — protegida por login
  perfil.html                     → página Perfil (árvore de skills + evolução) — protegida por login
  css/
    style.css                     → estilos compartilhados por todas as páginas
  js/
    supabaseClient.js             → conexão com o projeto Supabase
    auth.js                        → sessão do usuário (getOptionalUser, requireAuth) e logout
    authGate.js                     → aviso de "entre ou crie conta" usado por Simulados/Matérias/Perfil
    login.js                       → lógica da página de login/cadastro
    storage.js                     → camada de dados (fala com o Supabase)
    nav.js                          → barra de navegação + botão sair
    chat.js                         → lógica do chat (Início)
    simulados.js                     → lógica da página Simulados
    materias.js                      → lógica da página Matérias
    perfil.js                         → lógica do Perfil, árvore de skills e gráfico de evolução

api/
  chat.js                        → função serverless da Vercel (chama lib/chatHandler.js)

lib/                            ← lógica de servidor, compartilhada por api/chat.js e server.js
  systemPrompt.js                → TODO o comportamento do Treineiro, em português simples
  chatHandler.js                  → chamada à API de IA (Google Gemini por padrão)

server.js                      ← servidor local simples (sem dependências), serve public/ e /api/chat
package.json                   ← metadados do projeto (sem dependências de verdade)
.env.example                   ← modelo de variáveis de ambiente
.gitignore
README.md
```

## 5. Próximos passos sugeridos

- Fazer o chat detectar e sugerir matérias automaticamente após o
  diagnóstico, em vez de o usuário cadastrar na mão.
- Exportar o plano de estudos em PDF.
- Cronômetro real durante o simulado no nível "prova real".
- Login social (Google) — o Supabase suporta, só precisa habilitar o
  provedor no painel e ajustar `login.js`.

## 6. SQL do banco (para recriar em outro projeto Supabase, se precisar)

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text default '',
  prova_alvo text default '',
  created_at timestamptz default now()
);

create table public.materias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  nivel text not null check (nivel in ('fraco','medio','bom')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.simulados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prova text not null,
  dificuldade text not null check (dificuldade in ('aprendizado','intermediario','prova_real')),
  pontuacao text default '',
  notas text default '',
  data timestamptz default now()
);

create table public.skill_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  materia_id uuid references public.materias(id) on delete cascade,
  materia_nome text not null,
  nivel text not null check (nivel in ('fraco','medio','bom')),
  criado_em timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.materias enable row level security;
alter table public.simulados enable row level security;
alter table public.skill_history enable row level security;

create policy "profiles: select own" on public.profiles for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "materias: all own" on public.materias for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "simulados: all own" on public.simulados for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "skill_history: all own" on public.skill_history for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome) values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create function public.handle_materia_insert()
returns trigger as $$
begin
  insert into public.skill_history (user_id, materia_id, materia_nome, nivel)
  values (new.user_id, new.id, new.nome, new.nivel);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create function public.handle_materia_update()
returns trigger as $$
begin
  if new.nivel is distinct from old.nivel then
    insert into public.skill_history (user_id, materia_id, materia_nome, nivel)
    values (new.user_id, new.id, new.nome, new.nivel);
  end if;
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_materia_insert
  after insert on public.materias
  for each row execute procedure public.handle_materia_insert();

create trigger on_materia_update
  before update on public.materias
  for each row execute procedure public.handle_materia_update();

revoke execute on function public.handle_materia_insert() from anon, authenticated;
revoke execute on function public.handle_materia_update() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
```
