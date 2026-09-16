const DIFF_LABELS = {
  aprendizado: { label: "aprendizado", dot: "dot-green" },
  intermediario: { label: "intermediário", dot: "dot-yellow" },
  prova_real: { label: "prova real", dot: "dot-red" },
};

(async function main() {
  const user = await getOptionalUser();
  renderNavbar("simulados", user);

  if (!user) {
    document.getElementById("open-modal").style.display = "none";
    document.getElementById("lista").innerHTML = loginGateHtml({
      mensagem: "Entre ou crie uma conta para ver e registrar seus simulados.",
      pagina: "simulados.html",
    });
    return;
  }

  Store.init(user.id);
  await renderLista();
  attachModalEvents();
})();

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function renderLista() {
  const lista = document.getElementById("lista");
  lista.innerHTML = `<div class="empty-state">Carregando…</div>`;
  const simulados = await Store.getSimulados();

  if (simulados.length === 0) {
    lista.innerHTML = `<div class="empty-state">Nenhum simulado registrado ainda. Faça um simulado no Início ou clique em "+ Novo registro".</div>`;
    return;
  }

  lista.innerHTML = "";
  simulados.forEach((s) => {
    const diff = DIFF_LABELS[s.dificuldade] || { label: s.dificuldade, dot: "dot-yellow" };
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <span class="chip"><span class="chip-dot ${diff.dot}"></span>${diff.label}</span>
      <div class="simulado-info" style="flex:1">
        <div class="simulado-title"></div>
        <div class="simulado-meta">${formatDate(s.data)}${s.notas ? " · " + escapeHtml(s.notas) : ""}</div>
      </div>
      <div class="simulado-score"></div>
      <button class="del-btn" title="Excluir">excluir</button>
    `;
    row.querySelector(".simulado-title").textContent = s.prova;
    row.querySelector(".simulado-score").textContent = s.pontuacao || "—";
    row.querySelector(".del-btn").addEventListener("click", async () => {
      if (confirm("Excluir este registro de simulado?")) {
        await Store.deleteSimulado(s.id);
        renderLista();
      }
    });
    lista.appendChild(row);
  });
}

function attachModalEvents() {
  const backdrop = document.getElementById("modal-backdrop");

  document.getElementById("open-modal").addEventListener("click", () => {
    document.getElementById("f-prova").value = "";
    document.getElementById("f-dificuldade").value = "intermediario";
    document.getElementById("f-pontuacao").value = "";
    document.getElementById("f-notas").value = "";
    backdrop.style.display = "flex";
  });

  document.getElementById("cancel-modal").addEventListener("click", () => {
    backdrop.style.display = "none";
  });

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.style.display = "none";
  });

  document.getElementById("confirm-modal").addEventListener("click", async () => {
    const prova = document.getElementById("f-prova").value.trim();
    if (!prova) {
      alert("Escreva o nome da prova/certificação.");
      return;
    }
    await Store.addSimulado({
      prova,
      dificuldade: document.getElementById("f-dificuldade").value,
      pontuacao: document.getElementById("f-pontuacao").value.trim(),
      notas: document.getElementById("f-notas").value.trim(),
    });
    backdrop.style.display = "none";
    renderLista();
  });
}
