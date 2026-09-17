# Relatório de UX e bugs — Gabarita

Auditoria completa do site: todos os arquivos de `public/js`, `lib/`, `api/`,
`server.js` e as 5 páginas HTML. Dividido em **bugs corrigidos**, **avaliação
de UX por tela** e **pendências conhecidas**.

---

## Parte 1 — Bugs encontrados e corrigidos

### Críticos (quebravam funcionalidade ou dados)

**1. Perfil não salvava para contas antigas** — `storage.js`
`setPerfil()` usava `UPDATE ... WHERE id = userId`. Se a linha em `profiles`
não existisse (contas criadas antes do trigger `on_auth_user_created` ser
adicionado ao banco), o update afetava **zero linhas e não retornava erro** —
o usuário digitava nome/prova, via tudo "salvo", e ao recarregar perdia tudo.
→ Trocado por `upsert`, que cria a linha se faltar.

**2. Linhas de comando da IA vazando na tela** — `chat.js`
`extrairAcoes()` terminava com `return { texto: texto || reply }`. Quando a IA
respondia **só** com linhas `AÇÃO:` (sem texto), `texto` ficava vazio e o
fallback devolvia a resposta crua — expondo `AÇÃO: navegar | pagina=...` para
o usuário, exatamente o que o protocolo deveria esconder.
→ Agora retorna texto vazio e a mensagem é omitida; o feedback vem pelos toasts.

**3. Linha interna `Matérias identificadas:` aparecendo na conversa**
Essa linha é um canal interno para o site montar o banner, mas era renderizada
normalmente no chat, poluindo a resposta.
→ Nova função `limparLinhasInternas()`: a detecção usa o texto bruto, a
exibição usa a versão limpa.

**4. Histórico de chat corrompido derrubava a página** — `storage.js`
`JSON.parse(raw)` sem `try/catch`. Um valor inválido no `localStorage` (aba
fechada no meio de uma escrita, cota estourada) lançava exceção durante o
carregamento e **o chat inteiro não abria** — sem mensagem de erro, tela morta.
→ Agora tem `try/catch`, descarta o histórico inválido e segue.

**5. Crescimento infinito do histórico → custo e falha de cota**
A conversa inteira era reenviada à IA a cada mensagem e salva integralmente no
`localStorage`. Em uma sessão longa isso estoura a cota do navegador e infla o
consumo de tokens sem limite (e o custo junto).
→ Teto de 40 mensagens armazenadas e 30 enviadas por requisição.

### Sérios (falhas silenciosas)

**6. Escritas falhando sem avisar** — `materias.js`, `simulados.js`, `perfil.js`
`await Store.addMateria(...)`, `updateMateria`, `deleteMateria`, `addSimulado`
e `setPerfil` eram chamados sem `try/catch`. Qualquer erro (RLS, rede, sessão
expirada) virava uma promise rejeitada no console — **o usuário via o item
simplesmente não aparecer**, sem nenhuma explicação.
→ Todos os caminhos de escrita agora tratam erro e avisam na tela. No seletor
de nível, o valor volta visualmente ao anterior quando o banco recusa.

**7. Matérias duplicadas**
Nem a página nem as ações da IA verificavam nome existente — dava para ter
"Matemática" três vezes, cada uma com nível diferente, poluindo a árvore de
skills e distorcendo o gráfico de evolução.
→ `Store.addMateria()` agora deduplica (ignorando maiúsculas e acentos) e
retorna `{ criada: true/false }`; nova função `findMateriaPorNome()` é usada
também pelas ações `atualizar_materia` / `remover_materia`.

**8. Duplo clique duplicava registro de simulado** — `simulados.js`
O botão de confirmar não era desabilitado durante o insert.
→ Desabilitado enquanto a requisição roda.

**9. Dificuldade "fantasma" no modo livre** — `chat.js`
Ao escolher 🟥 prova real e voltar para o modo diagnóstico, `state.difficulty`
continuava preenchido e era enviado à IA, contaminando o contexto.
→ Limpo ao sair do modo simulado.

**10. Erros técnicos crus na cara do usuário** — `chat.js`
O print que você mandou mostra o sintoma: um JSON bruto do Google
(`"status": "UNAVAILABLE"`) dentro do banner vermelho. Incompreensível para
qualquer usuário final.
→ Nova `traduzErroIa()` converte 503 / 429 / chave inválida / falha de rede em
português claro. E `chamarApiComRetry()` tenta **3 vezes com espera
progressiva** antes de desistir — a maioria dos 503 se resolve sozinha nesse
intervalo, então o erro nem chega a aparecer.

### Menores

**11. `Invalid Date` na lista de simulados** — data nula/inválida era exibida
crua. → Vira "sem data".

**12. Gráfico de evolução quebrado em telas estreitas** — `perfil.js`
`canvas.parentElement.clientWidth - 32` podia dar valor ≤ 0 (painel ainda sem
layout), gerando canvas inválido. Também não redesenhava ao redimensionar a
janela ou girar o celular — ficava esticado e borrado.
→ Largura mínima de 240px + redraw com debounce no `resize`.

**13. Open redirect no login** — `login.js`
`?next=` era usado sem validação: `login.html?next=https://site-falso.com`
levaria o usuário para fora do site logo após autenticar. Vetor clássico de
phishing.
→ Lista branca das 4 páginas internas; qualquer outro valor cai em `index.html`.

**14. E-mail sem escape no navbar** — `nav.js`
`${user.email}` ia direto para `innerHTML`. Risco baixo (é o próprio e-mail do
usuário), mas é injeção de HTML por definição.
→ Passa por `escapeHtml()`. De quebra, removi a cópia duplicada dessa função
que existia em `simulados.js`.

**15. Botão de enviar clicável durante o carregamento** — permitia enfileirar
requisições sobrepostas. → Desabilitado enquanto a IA responde.

---

## Parte 2 — Relatório de UX por tela

### Marca e identidade
**Antes:** sem favicon (aba mostrava o ícone genérico de documento), sem
`meta description`, nome "Treineiro" apenas em texto.
**Agora:** nome **Gabarita**, favicon SVG próprio (visto abaixo), logo no
navbar e na tela de login, `theme-color` e `description` em todas as páginas.

O favicon é um *check* na cor de destaque do site dentro de um quadrado
arredondado escuro — legível a 16px, que é o tamanho real na aba. Formato SVG
escala sozinho para qualquer densidade de tela.

### Início (chat) — `index.html`

| Aspecto | Avaliação |
|---|---|
| Hierarquia visual | **Boa.** Barra de controles no topo, conversa no meio, composer fixo embaixo — padrão reconhecível. |
| Feedback de estado | **Corrigido.** Antes o botão continuava ativo durante a resposta; agora desabilita e o status mostra as tentativas de retry. |
| Legibilidade | **Corrigido.** Markdown agora renderiza de verdade — negrito, listas e tabelas em vez de `**asteriscos**` crus. |
| Modo simulado | **Bom.** Troca visual clara (cards com borda, fonte serifada, cronômetro) sinaliza "agora é prova" sem precisar explicar. |
| Recuperação de erro | **Corrigido.** Retry automático + mensagens em português. |
| Controle do usuário | **Corrigido.** Faltava qualquer forma de recomeçar a conversa — adicionei "Limpar conversa". |

**Ponto fraco restante:** salvar um simulado ainda usa `prompt()` nativo do
navegador, que destoa do resto do visual. Melhorei pré-preenchendo com a prova
alvo do perfil, mas o ideal é um modal próprio (ver pendências).

### Simulados — `simulados.html`
Lista clara, chips coloridos por dificuldade, modal de registro bem montado.
Adicionei fechar com **Esc** (só tinha clique no backdrop e botão cancelar) e
proteção contra duplo clique. O estado vazio é bom: explica o que fazer e
aponta os dois caminhos (chat ou registro manual).

### Matérias — `materias.html`
Barra de progresso + seletor de nível na mesma linha é uma solução compacta e
direta. Agora com feedback de erro e aviso quando a matéria já existe.
**Ponto fraco:** não dá para renomear uma matéria — só excluir e recriar,
perdendo o histórico de evolução dela.

### Perfil — `perfil.html`
A tela mais rica: estatísticas, árvore de skills e gráfico de evolução.
- **Árvore de skills** — visualmente o melhor elemento do site. Mas com muitas
  matérias (15+) as linhas ficam embaralhadas e os nós se aproximam demais.
- **Gráfico de evolução** — corrigido para telas estreitas e resize.
- **Calibragem** — o card de primeira visita cumpre bem o papel de tirar o
  usuário do estado vazio, que é o momento de maior abandono em qualquer app.
- **Salvamento** — os campos salvam no `change` (ao sair do campo), sem
  confirmação visual. Funciona, mas o usuário não tem certeza de que salvou.

### Login — `login.html`
Abas entrar/criar conta, validação de senha mínima, erros do Supabase
traduzidos para português. Sólido. Corrigido o open redirect.

### Navegação geral
`nav.js` é consistente nas 5 páginas, marca a página ativa e adapta a área de
autenticação conforme o estado. Agora o logo é clicável e leva ao início —
comportamento que todo usuário espera e que faltava.

---

## Parte 3 — Rodada 2: responsividade mobile e robustez

Segunda passagem, focada na pendência nº1. Verificada com renderização real em
390px (celular) e 1280px (desktop), medindo overflow horizontal e erros de JS
em todas as páginas.

**16. Zero media queries no projeto** — larguras e paddings fixos em todo lugar.
→ Breakpoints em 860px e 560px na folha global + regras específicas por página.
Resultado: **overflow horizontal = 0px em todas as páginas, nos dois tamanhos.**

**17. Árvore de skills saía da tela no celular** — os nós eram posicionados em
pixels absolutos (`rootX = 80`, `nodeX = 420`) dentro de um viewBox fixo de 640.
Em um celular de 390px, os nós ficavam literalmente fora da área visível.
→ Posições agora derivam da largura real do container, com anéis e espaçamento
menores abaixo de 560px. De quebra, no desktop a distribuição ficou proporcional
em vez de deixar um vão morto à direita.

**18. Altura do chat quebrada no mobile** — `height: calc(100vh - 65px)` assumia
uma navbar de altura fixa, mas no celular ela quebra em duas linhas; e `100vh`
inclui a barra de URL. O composer saía da tela.
→ Layout flex (`flex: 1` + `min-height: 0`) com `100dvh`, que acompanha a barra
do navegador.

**19. Contador de tokens em cima do botão "Enviar"** — ficava fixo no canto
inferior esquerdo, sobrepondo o botão no celular.
→ Movido para dentro da barra de controles; fixo no canto só no desktop.
*(Detalhe: a primeira tentativa não funcionou porque a media query estava antes
da regra base na folha de estilo — mesma especificidade, a última vence.)*

**20. Selects com visual branco padrão do navegador** — os seletores de nível
na página Matérias estão fora de `.field`, então nunca receberam o tema escuro.
Bug visual em **todos** os tamanhos de tela, não só mobile.
→ Tema global para `select`/`input`/`textarea`, com seta customizada.

**21. Linha do simulado espremida no celular** — a media query não pegava porque
o JS aplicava `style="flex:1"` inline, e estilo inline sempre vence folha de
estilo.
→ Movido para o CSS.

**22. CDN fora do ar = página em branco sem explicação** — se
`cdn.jsdelivr.net` falhar (rede instável, bloqueador, CDN fora), `window.supabase`
fica indefinido e o site inteiro morria numa cascata de erros de console, sem
nada na tela.
→ Detecção + aviso visível com botão de recarregar, e guardas em `auth.js` e
`login.js` para interromper a cascata.

**23. Campos disparavam zoom automático no iOS** — o Safari dá zoom em qualquer
input com fonte menor que 16px.
→ 16px nos campos abaixo de 560px.

---

## Parte 4 — Rodada 3: diálogos próprios e renomear matéria

**24. `alert()`, `confirm()` e `prompt()` nativos** — usados no salvamento de
simulado, nas exclusões e nos avisos de erro. Ignoram o tema escuro, travam a
aba e destoam completamente do resto da interface.
→ Novo módulo `public/js/ui.js` com `UI.confirmar()`, `UI.perguntar()`,
`UI.avisar()` e `UI.toast()`, todos no visual do site e retornando Promise.
Inclui foco automático, fechar com **Esc**, foco preso dentro do diálogo
(acessibilidade de teclado) e botões empilhados no celular, com a ação
principal no alcance do polegar. Exclusões usam variante vermelha de perigo.
**Zero diálogos nativos restantes no projeto.**

**25. Renomear matéria era impossível** — só dava para excluir e recriar, o que
zerava o histórico de evolução daquela matéria.
→ Botão "renomear" em cada linha, com verificação de nome duplicado. O
histórico é preservado. A IA também ganhou a ação `renomear_materia`, e o
prompt a instrui a preferir renomear em vez de remover e recriar.

**26. Perfil salvava em silêncio** — os campos gravavam no `change` sem nenhuma
confirmação visual; o usuário não tinha como saber se funcionou.
→ Toast de confirmação.

---

## Parte 5 — Pendências conhecidas (não corrigidas)

Em ordem de impacto:

1. **Sem streaming da resposta** — a IA responde tudo de uma vez; em respostas
   longas o usuário espera olhando "escrevendo…". Streaming melhoraria muito a
   percepção de velocidade.
2. **Contador de tokens é estimativa local** — conta só o que passou por este
   navegador, e o teto (`DAILY_TOKEN_BUDGET` em `chat.js`) é um número que você
   define na mão. Não é o contador oficial do provedor, e o tooltip diz isso.
3. **Sem fallback entre provedores** — se o Gemini cair, o retry ajuda, mas não
   há troca automática para a Groq.
4. **Ações da IA não têm desfazer** — `remover_materia` executa direto. O prompt
   pede confirmação antes, mas isso depende do modelo obedecer; uma confirmação
   no próprio site seria mais garantida.

---

### Verificação da rodada 2

| Página | 390px | 1280px |
|---|---|---|
| Início (chat) | overflow 0 · composer fixo · contador na barra | overflow 0 |
| Matérias | overflow 0 · form empilhado · selects no tema | overflow 0 |
| Simulados | overflow 0 · título em linha própria | overflow 0 |
| Perfil | overflow 0 · árvore cabe na tela | overflow 0 · árvore proporcional |
| Login | overflow 0 | overflow 0 |

Nenhum erro de JavaScript em nenhuma combinação.

---

## Sobre o nome

**Gabarita** foi a escolha aplicada. "Gabaritar" é gíria brasileira consolidada
para acertar tudo numa prova — exatamente a promessa do produto. É curto,
memorável, tem verbo embutido (soa como ação, não como substantivo passivo) e
o domínio tem chance razoável de estar livre em variações.

Alternativas que considerei, caso queira trocar — a mudança é simples, o nome
aparece só nos `<title>`, no `nav.js` e no `login.html`:

| Nome | Prós | Contras |
|---|---|---|
| **Gabarita** *(aplicado)* | Gíria conhecida, verbo, curto | Bem brasileiro — ruim se quiser expandir fora do país |
| **Calibra** | Conecta direto com a "prova de calibragem" | Menos evocativo de aprovação |
| **Aprova.ai** | Direto ao objetivo | Sufixo `.ai` já saturado |
| **Trilha** | Casa com a árvore de skills | Genérico, muitos concorrentes |

A IA continua se chamando **Treineiro** dentro do chat. Achei que funciona bem:
o site é a plataforma, o Treineiro é o personagem que te acompanha. Se preferir
unificar, é trocar em `lib/systemPrompt.js` e na constante `WELCOME`.
