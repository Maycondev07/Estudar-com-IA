const WELCOME = `Oi! Eu sou o Treineiro. Me diz qual prova, vestibular ou certificação você quer estudar (ex: "ITA", "Enem", "OAB primeira fase", "AWS Solutions Architect") que eu já te digo o nível de dificuldade dela e monto um diagnóstico inicial.`;

// Ajuste esse número pra bater com o limite diário (em tokens) do seu
// provedor de IA — é só uma estimativa local, calculada a partir do "usage"
// que a API retorna a cada resposta; não é o contador oficial do provedor.
const DAILY_TOKEN_BUDGET = 200000;

const PAGINAS_PERMITIDAS = ["index.html", "materias.html", "simulados.html", "perfil.html", "login.html"];
const NIVEIS_VALIDOS = ["fraco", "medio", "bom"];

let state = {
  messages: [{ role: "assistant", content: WELCOME }],
  mode: "livre",
  difficulty: null,
  loading: false,
};
let currentUser = null;
let examTimerInterval = null;
let examStartTime = null;

if (window.marked) {
  marked.setOptions({ breaks: true, gfm: true });
}

(async function main() {
  currentUser = await getOptionalUser();
  Store.init(currentUser ? currentUser.id : "visitante");
  renderNavbar("inicio", currentUser);

  state.messages = Store.getChatHistorico() || state.messages;
  renderMessages();
  renderTokenCounter();

  document.getElementById("mode-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.mode = btn.dataset.mode;
    document.querySelectorAll("#mode-seg button").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("difficulty-wrap").style.display = state.mode === "simulado" ? "flex" : "none";
    if (state.mode !== "simulado") {
      // sem isso a dificuldade antiga continuava sendo enviada no modo livre
      state.difficulty = null;
      document.querySelectorAll("#difficulty-seg button").forEach((b) => b.classList.remove("active"));
    }
    aplicarModoVisual();
  });

  document.getElementById("difficulty-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.difficulty = btn.dataset.diff;
    document.querySelectorAll("#difficulty-seg button").forEach((b) => b.classList.toggle("active", b === btn));
    atualizarExamBadge();
  });

  document.getElementById("clear-chat").addEventListener("click", async () => {
    const ok = await UI.confirmar({
      titulo: "Limpar conversa",
      mensagem: "Isso apaga todas as mensagens deste chat. Seus simulados e matérias salvos não são afetados.",
      confirmar: "Limpar",
      perigo: true,
    });
    if (!ok) return;
    state.messages = [{ role: "assistant", content: WELCOME }];
    Store.setChatHistorico(state.messages);
    hideBanner("save-banner");
    hideBanner("materias-banner");
    hideBanner("error-banner");
    renderMessages();
  });

  document.getElementById("send-btn").addEventListener("click", sendMessage);
  document.getElementById("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  await maybeIniciarCalibragem();
})();

// o rótulo do contador muda de tamanho conforme a largura da tela
window.addEventListener("resize", renderTokenCounter);

// Disparado quando o usuário clica em "Iniciar prova de calibragem" no Perfil
// (index.html?calibragem=1). Só dispara sozinho se ainda não houver conversa
// além da mensagem de boas-vindas, pra não interromper um chat em andamento.
async function maybeIniciarCalibragem() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("calibragem") !== "1") return;
  if (!currentUser) return;
  if (state.messages.length > 1) return;

  history.replaceState(null, "", window.location.pathname);

  let mensagemInicial = "Quero fazer minha prova de calibragem inicial. Pode me propor o diagnóstico?";
  try {
    const perfil = await Store.getPerfil();
    if (perfil.prova_alvo) {
      mensagemInicial = `Quero fazer minha prova de calibragem inicial para a prova: ${perfil.prova_alvo}.`;
    }
  } catch (err) {
    // segue com a mensagem genérica se não conseguir ler o perfil
  }

  document.getElementById("input").value = mensagemInicial;
  await sendMessage();
}

// ---------- Layout de prova (modo simulado) ----------
function aplicarModoVisual() {
  const emProva = state.mode === "simulado";
  document.getElementById("chat-wrap").classList.toggle("modo-prova", emProva);
  document.getElementById("exam-header").style.display = emProva ? "flex" : "none";
  if (emProva) iniciarExamTimer();
  else pararExamTimer();
  atualizarExamBadge();
}

function atualizarExamBadge() {
  const el = document.getElementById("exam-badge");
  if (!el) return;
  const labels = { aprendizado: "🟩 aprendizado", intermediario: "🟨 intermediário", prova_real: "🟥 prova real" };
  el.textContent = state.difficulty ? `Simulado — ${labels[state.difficulty]}` : "Simulado — escolha a dificuldade";
}

function iniciarExamTimer() {
  examStartTime = Date.now();
  atualizarExamTimer();
  clearInterval(examTimerInterval);
  examTimerInterval = setInterval(atualizarExamTimer, 1000);
}

function pararExamTimer() {
  clearInterval(examTimerInterval);
  examTimerInterval = null;
  examStartTime = null;
  const el = document.getElementById("exam-timer");
  if (el) el.textContent = "00:00";
}

function atualizarExamTimer() {
  const el = document.getElementById("exam-timer");
  if (!el || !examStartTime) return;
  const s = Math.floor((Date.now() - examStartTime) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  el.textContent = `${mm}:${ss}`;
}

async function sendMessage() {
  const input = document.getElementById("input");
  const text = input.value.trim();
  if (!text || state.loading) return;

  state.messages.push({ role: "user", content: text });
  input.value = "";
  state.loading = true;
  hideBanner("save-banner");
  hideBanner("materias-banner");
  hideBanner("error-banner");
  renderMessages();

  try {
    let contexto = { perfil: null, materias: [], simulados: [] };
    if (currentUser) {
      try {
        const [perfil, materias, simulados] = await Promise.all([
          Store.getPerfil(),
          Store.getMaterias(),
          Store.getSimulados(),
        ]);
        contexto = { perfil, materias, simulados };
      } catch (err) {
        // Se der erro ao buscar o contexto, segue a conversa sem ele em vez de travar o chat.
      }
    }

    // Mantém só as últimas mensagens na requisição: sem isso a conversa
    // inteira é reenviada a cada turno e o custo em tokens cresce sem limite.
    const MAX_ENVIO = 30;
    if (state.messages.length > MAX_ENVIO) {
      state.messages = state.messages.slice(-MAX_ENVIO);
    }

    const { ok, data } = await chamarApiComRetry({
      messages: state.messages,
      mode: state.mode,
      difficulty: state.difficulty,
      ...contexto,
    });

    if (!ok) {
      showError(traduzErroIa(data && data.error) || "Erro desconhecido ao falar com a IA.");
    } else {
      const { texto, acoes } = extrairAcoes(data.reply);
      // A detecção usa o texto bruto (com a linha interna); o que vai pra tela
      // é a versão limpa.
      checkForScore(texto);
      checkForMaterias(texto);

      const visivel = limparLinhasInternas(texto);
      if (visivel) {
        state.messages.push({ role: "assistant", content: visivel });
        Store.setChatHistorico(state.messages);
      }

      if (data.usage && data.usage.total_tokens) {
        registrarTokensUsados(data.usage.total_tokens);
      }
      if (acoes.length) {
        // não trava a resposta: executa em seguida, com feedback via toast
        executarAcoes(acoes);
      }
    }
  } catch (err) {
    showError(traduzErroIa(err.message));
  } finally {
    state.loading = false;
    renderMessages();
  }
}

// Erros 503 (sobrecarga) e 429 (limite de taxa) são temporários: vale tentar
// de novo sozinho antes de incomodar o usuário com uma mensagem de erro.
async function chamarApiComRetry(payload, tentativas = 3) {
  let ultimoErro = null;

  for (let i = 0; i < tentativas; i++) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (res.ok) return { ok: true, data };

    ultimoErro = data;
    const transitorio = res.status === 503 || res.status === 429 || /503|429|high demand|overload|UNAVAILABLE/i.test(data.error || "");
    if (!transitorio || i === tentativas - 1) break;

    atualizarStatusCarregando(`provedor de IA ocupado — tentando de novo (${i + 2}/${tentativas})…`);
    await new Promise((r) => setTimeout(r, 1200 * (i + 1))); // espera progressiva
  }

  return { ok: false, data: ultimoErro };
}

// Traduz os erros técnicos do provedor pra algo que o usuário entenda.
function traduzErroIa(msg) {
  const m = msg || "";
  if (/503|high demand|overload|UNAVAILABLE/i.test(m)) {
    return "O provedor de IA está sobrecarregado no momento. Já tentei algumas vezes — espere alguns segundos e envie de novo.";
  }
  if (/429|rate limit|RESOURCE_EXHAUSTED|quota/i.test(m)) {
    return "Você atingiu o limite de uso da IA por agora. Espere um minuto (ou até amanhã, se for o limite diário) e tente de novo.";
  }
  if (/AI_API_KEY/i.test(m)) {
    return "A chave da API de IA não está configurada no servidor. Confira as variáveis de ambiente na Vercel.";
  }
  if (/401|403|API key|invalid/i.test(m)) {
    return "A chave da API de IA parece inválida ou sem permissão. Confira a configuração no servidor.";
  }
  if (/failed to fetch|networkerror/i.test(m)) {
    return "Não consegui falar com o servidor. Verifique sua conexão e tente de novo.";
  }
  return m;
}

function atualizarStatusCarregando(texto) {
  const el = document.getElementById("loading-status");
  if (el) el.textContent = texto;
}
function extrairAcoes(reply) {
  const linhas = reply.split("\n");
  const acoes = [];
  const restante = [];

  linhas.forEach((linha) => {
    const m = linha.match(/^\s*A[ÇC][AÃ]O:\s*(\w+)\s*\|\s*(.+)$/i);
    if (m) {
      acoes.push({ tipo: m[1].toLowerCase(), args: parseArgsAcao(m[2]) });
    } else {
      restante.push(linha);
    }
  });

  const texto = restante.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Se a IA respondeu SÓ com linhas de ação, não dá pra cair de volta no
  // reply original (isso mostraria as linhas cruas pro usuário). Nesse caso
  // fica sem texto e o feedback vem pelos toasts.
  return { texto, acoes };
}

// A linha "Matérias identificadas: ..." é um canal interno pro site montar o
// banner de confirmação — não deve aparecer crua na conversa.
function limparLinhasInternas(texto) {
  return texto
    .split("\n")
    .filter((l) => !/^\s*mat[eé]rias identificadas:/i.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseArgsAcao(str) {
  const args = {};
  str.split("|").forEach((par) => {
    const idx = par.indexOf("=");
    if (idx === -1) return;
    const chave = par.slice(0, idx).trim().toLowerCase();
    const valor = par.slice(idx + 1).trim();
    if (chave) args[chave] = valor;
  });
  return args;
}

function normalizarNivel(v) {
  const n = (v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return NIVEIS_VALIDOS.includes(n) ? n : "medio";
}

async function executarAcoes(acoes) {
  if (!currentUser) {
    showToast("O Treineiro tentou fazer uma alteração, mas é preciso entrar ou criar conta pra isso funcionar.", "erro");
    return;
  }

  for (const acao of acoes) {
    try {
      if (acao.tipo === "definir_perfil") {
        const changes = {};
        if (acao.args.nome !== undefined) changes.nome = acao.args.nome;
        if (acao.args.prova_alvo !== undefined) changes.prova_alvo = acao.args.prova_alvo;
        if (Object.keys(changes).length) {
          await Store.setPerfil(changes);
          showToast("✓ Perfil atualizado.");
        }
      } else if (acao.tipo === "adicionar_materia") {
        if (!acao.args.nome) continue;
        const r = await Store.addMateria({ nome: acao.args.nome, nivel: normalizarNivel(acao.args.nivel) });
        showToast(
          r.criada
            ? `✓ Matéria "${acao.args.nome}" adicionada.`
            : `"${acao.args.nome}" já estava cadastrada.`
        );
      } else if (acao.tipo === "atualizar_materia") {
        if (!acao.args.nome) continue;
        const alvo = await Store.findMateriaPorNome(acao.args.nome);
        if (alvo) {
          await Store.updateMateria(alvo.id, { nivel: normalizarNivel(acao.args.nivel) });
          showToast(`✓ Nível de "${acao.args.nome}" atualizado.`);
        } else {
          showToast(`Não achei a matéria "${acao.args.nome}" pra atualizar.`, "erro");
        }
      } else if (acao.tipo === "renomear_materia") {
        if (!acao.args.nome || !acao.args.novo_nome) continue;
        const alvo = await Store.findMateriaPorNome(acao.args.nome);
        if (!alvo) {
          showToast(`Não achei a matéria "${acao.args.nome}" pra renomear.`, "erro");
          continue;
        }
        const conflito = await Store.findMateriaPorNome(acao.args.novo_nome);
        if (conflito && conflito.id !== alvo.id) {
          showToast(`Já existe uma matéria chamada "${acao.args.novo_nome}".`, "erro");
          continue;
        }
        await Store.updateMateria(alvo.id, { nome: acao.args.novo_nome });
        showToast(`✓ "${acao.args.nome}" renomeada para "${acao.args.novo_nome}".`);
      } else if (acao.tipo === "remover_materia") {
        if (!acao.args.nome) continue;
        const alvo = await Store.findMateriaPorNome(acao.args.nome);
        if (alvo) {
          await Store.deleteMateria(alvo.id);
          showToast(`✓ Matéria "${acao.args.nome}" removida.`);
        } else {
          showToast(`Não achei a matéria "${acao.args.nome}" pra remover.`, "erro");
        }
      } else if (acao.tipo === "navegar") {
        const pagina = (acao.args.pagina || "").trim();
        if (PAGINAS_PERMITIDAS.includes(pagina)) {
          showToast(`↳ Indo para ${pagina}…`);
          setTimeout(() => {
            window.location.href = pagina;
          }, 650);
        }
      }
    } catch (err) {
      showToast("Não consegui executar uma ação: " + err.message, "erro");
    }
  }
}

// ---------- Contador de tokens restantes hoje (estimativa local) ----------
function getTokenUsageKey() {
  const dia = new Date().toISOString().slice(0, 10);
  return `treineiro_tokens_${currentUser ? currentUser.id : "visitante"}_${dia}`;
}

function getTokensUsadosHoje() {
  const raw = localStorage.getItem(getTokenUsageKey());
  return raw ? parseInt(raw, 10) || 0 : 0;
}

function registrarTokensUsados(qtd) {
  const usados = getTokensUsadosHoje() + qtd;
  localStorage.setItem(getTokenUsageKey(), String(usados));
  renderTokenCounter();
}

function renderTokenCounter() {
  const el = document.getElementById("token-counter");
  if (!el) return;
  const usados = getTokensUsadosHoje();
  const restantes = Math.max(0, DAILY_TOKEN_BUDGET - usados);
  const fmt = restantes.toLocaleString("pt-BR");
  // No celular o texto completo ocupava metade da largura da tela.
  el.textContent =
    window.innerWidth < 560 ? `🪙 ${fmt}` : `🪙 ${fmt} tokens restantes hoje (estimativa)`;
}

// ---------- Toasts (feedback rápido de ações) ----------
function showToast(mensagem, tipo) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast" + (tipo === "erro" ? " erro" : "");
  el.textContent = mensagem;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function checkForScore(reply) {
  if (state.mode !== "simulado") return;
  const match = reply.match(/pontua[cç][aã]o final:\s*([^\n]+)/i);
  if (match) {
    showSaveBanner(match[1].trim());
  }
}

function showSaveBanner(score) {
  const banner = document.getElementById("save-banner");
  banner.style.display = "flex";

  if (!currentUser) {
    banner.querySelector("span").textContent =
      "Percebi uma pontuação nessa correção. Crie uma conta ou entre para salvar esse simulado.";
    document.getElementById("save-yes").textContent = "Entrar / Criar conta";
    document.getElementById("save-yes").onclick = () => {
      window.location.href = "login.html?next=index.html";
    };
    document.getElementById("save-no").onclick = () => hideBanner("save-banner");
    return;
  }

  banner.querySelector("span").textContent =
    'Percebi uma pontuação nessa correção. Quer salvar esse simulado na página "Simulados"?';
  document.getElementById("save-yes").textContent = "Salvar";
  document.getElementById("save-yes").onclick = async () => {
    let sugestao = "";
    try {
      const perfil = await Store.getPerfil();
      sugestao = perfil.prova_alvo || "";
    } catch (err) {
      /* sem sugestão é aceitável */
    }
    const prova = await UI.perguntar({
      titulo: "Salvar simulado",
      mensagem: "Qual prova ou certificação foi esse simulado?",
      valorInicial: sugestao,
      campo: { placeholder: "ex: Enem, OAB 1ª fase…" },
    });
    if (prova === null) return; // cancelado
    try {
      await Store.addSimulado({
        prova: prova || "Simulado sem nome",
        dificuldade: state.difficulty || "intermediario",
        pontuacao: score,
        notas: "",
      });
      hideBanner("save-banner");
      showToast('✓ Simulado salvo. Veja na página "Simulados".');
    } catch (err) {
      showError("Não consegui salvar o simulado: " + err.message);
    }
  };
  document.getElementById("save-no").onclick = () => hideBanner("save-banner");
}

function checkForMaterias(reply) {
  const match = reply.match(/mat[eé]rias identificadas:\s*([^\n]+)/i);
  if (!match) return;
  const itens = parseMateriasList(match[1]);
  if (itens.length) showMateriasBanner(itens);
}

function parseMateriasList(texto) {
  return texto
    .split(",")
    .map((pedaco) => {
      const m = pedaco.trim().match(/^(.+?)\s*\((fraco|m[eé]dio|bom)\)$/i);
      if (!m) return null;
      const nivel = m[2]
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // "médio" -> "medio"
      return { nome: m[1].trim(), nivel };
    })
    .filter(Boolean);
}

function showMateriasBanner(itens) {
  const banner = document.getElementById("materias-banner");
  const nomes = itens.map((i) => i.nome).join(", ");
  banner.style.display = "flex";

  if (!currentUser) {
    banner.querySelector("span").textContent =
      `Percebi um raio-x com estas matérias: ${nomes}. Crie uma conta ou entre para salvá-las.`;
    document.getElementById("materias-yes").textContent = "Entrar / Criar conta";
    document.getElementById("materias-yes").onclick = () => {
      window.location.href = "login.html?next=index.html";
    };
    document.getElementById("materias-no").onclick = () => hideBanner("materias-banner");
    return;
  }

  banner.querySelector("span").textContent =
    `Percebi um raio-x com estas matérias: ${nomes}. Quer salvá-las na página "Matérias"?`;
  document.getElementById("materias-yes").textContent = "Salvar";
  document.getElementById("materias-yes").onclick = async () => {
    try {
      let salvas = 0;
      for (const item of itens) {
        const r = await Store.addMateria({ nome: item.nome, nivel: item.nivel });
        if (r.criada) salvas++;
      }

      hideBanner("materias-banner");
      showToast(
        salvas
          ? `✓ ${salvas} matéria(s) salva(s). Veja na página "Matérias".`
          : "Essas matérias já estavam cadastradas."
      );
    } catch (err) {
      showError("Não consegui salvar as matérias: " + err.message);
    }
  };
  document.getElementById("materias-no").onclick = () => hideBanner("materias-banner");
}

function showError(message) {
  const el = document.getElementById("error-banner");
  el.textContent = message;
  el.style.display = "block";
}

function hideBanner(id) {
  document.getElementById(id).style.display = "none";
}

function renderMessages() {
  const container = document.getElementById("messages");
  container.innerHTML = "";
  state.messages.forEach((m) => {
    const row = document.createElement("div");
    row.className = "msg-row";
    row.innerHTML = `
      <div class="msg-role ${m.role === "user" ? "user" : ""}">${m.role === "user" ? "você" : "treineiro"}</div>
      <div class="msg-content"></div>
    `;
    const contentEl = row.querySelector(".msg-content");
    if (window.marked && window.DOMPurify) {
      contentEl.innerHTML = DOMPurify.sanitize(marked.parse(m.content || ""));
    } else {
      contentEl.textContent = m.content;
    }
    container.appendChild(row);
  });
  if (state.loading) {
    const row = document.createElement("div");
    row.id = "loading-status";
    row.style.cssText = "padding:16px 0; color:var(--ink-dim); font-family:var(--mono); font-size:13px;";
    row.textContent = "treineiro está escrevendo…";
    container.appendChild(row);
  }
  const sendBtn = document.getElementById("send-btn");
  if (sendBtn) sendBtn.disabled = state.loading;
  container.scrollTop = container.scrollHeight;
}
