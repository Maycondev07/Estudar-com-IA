const WELCOME = `Oi! Eu sou o Treineiro. Me diz qual prova, vestibular ou certificação você quer estudar (ex: "ITA", "Enem", "OAB primeira fase", "AWS Solutions Architect") que eu já te digo o nível de dificuldade dela e monto um diagnóstico inicial.`;

let state = {
  messages: [{ role: "assistant", content: WELCOME }],
  mode: "livre",
  difficulty: null,
  loading: false,
};
let currentUser = null;

(async function main() {
  currentUser = await getOptionalUser();
  Store.init(currentUser ? currentUser.id : "visitante");
  renderNavbar("inicio", currentUser);

  state.messages = Store.getChatHistorico() || state.messages;
  renderMessages();

  document.getElementById("mode-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.mode = btn.dataset.mode;
    document.querySelectorAll("#mode-seg button").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("difficulty-wrap").style.display = state.mode === "simulado" ? "flex" : "none";
  });

  document.getElementById("difficulty-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.difficulty = btn.dataset.diff;
    document.querySelectorAll("#difficulty-seg button").forEach((b) => b.classList.toggle("active", b === btn));
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

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: state.messages,
        mode: state.mode,
        difficulty: state.difficulty,
        ...contexto,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Erro desconhecido.");
    } else {
      state.messages.push({ role: "assistant", content: data.reply });
      Store.setChatHistorico(state.messages);
      checkForScore(data.reply);
      checkForMaterias(data.reply);
    }
  } catch (err) {
    showError(err.message);
  } finally {
    state.loading = false;
    renderMessages();
  }
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
    const prova = prompt("Qual prova/certificação foi esse simulado?", "");
    if (prova === null) return;
    try {
      await Store.addSimulado({
        prova: prova || "Simulado sem nome",
        dificuldade: state.difficulty || "intermediario",
        pontuacao: score,
        notas: "",
      });
      hideBanner("save-banner");
      alert('Simulado salvo! Veja na página "Simulados".');
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
      const existentes = await Store.getMaterias();
      const nomesExistentes = new Set(existentes.map((m) => m.nome.trim().toLowerCase()));
      const novas = itens.filter((i) => !nomesExistentes.has(i.nome.toLowerCase()));

      for (const item of novas) {
        await Store.addMateria({ nome: item.nome, nivel: item.nivel });
      }

      hideBanner("materias-banner");
      if (novas.length) {
        alert(`${novas.length} matéria(s) salva(s)! Veja na página "Matérias".`);
      } else {
        alert("Essas matérias já estavam cadastradas.");
      }
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
    row.querySelector(".msg-content").textContent = m.content;
    container.appendChild(row);
  });
  if (state.loading) {
    const row = document.createElement("div");
    row.style.cssText = "padding:16px 0; color:var(--ink-dim); font-family:var(--mono); font-size:13px;";
    row.textContent = "treineiro está escrevendo…";
    container.appendChild(row);
  }
  container.scrollTop = container.scrollHeight;
}
