const NIVEL_INFO = {
  fraco: { pct: 33, color: "var(--red)" },
  medio: { pct: 66, color: "var(--yellow)" },
  bom: { pct: 100, color: "var(--green)" },
};

(async function main() {
  const user = await getOptionalUser();
  renderNavbar("materias", user);

  if (!user) {
    document.getElementById("add-row").style.display = "none";
    document.getElementById("lista").innerHTML = loginGateHtml({
      mensagem: "Entre ou crie uma conta para cadastrar e acompanhar suas matérias.",
      pagina: "materias.html",
    });
    return;
  }

  Store.init(user.id);
  await renderLista();

  document.getElementById("add-btn").addEventListener("click", addMateria);
  document.getElementById("nova-materia").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addMateria();
  });
})();

async function renderLista() {
  const lista = document.getElementById("lista");
  lista.innerHTML = `<div class="empty-state">Carregando…</div>`;
  const materias = await Store.getMaterias();

  if (materias.length === 0) {
    lista.innerHTML = `<div class="empty-state">Nenhuma matéria cadastrada ainda. Adicione as matérias da sua prova acima, ou peça pro Treineiro sugerir com base no diagnóstico.</div>`;
    return;
  }

  lista.innerHTML = "";
  materias.forEach((m) => {
    const info = NIVEL_INFO[m.nivel] || NIVEL_INFO.medio;
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div class="materia-nome"></div>
      <div class="bar-track"><div class="bar-fill" style="width:${info.pct}%; background:${info.color}"></div></div>
      <select class="nivel-select">
        <option value="fraco">fraco</option>
        <option value="medio">médio</option>
        <option value="bom">bom</option>
      </select>
      <button class="del-btn" style="background:none;border:none;color:var(--ink-dim);cursor:pointer;font-size:12px;padding:4px 8px">excluir</button>
    `;
    row.querySelector(".materia-nome").textContent = m.nome;
    const select = row.querySelector(".nivel-select");
    select.value = m.nivel;
    select.addEventListener("change", async () => {
      await Store.updateMateria(m.id, { nivel: select.value });
      renderLista();
    });
    row.querySelector(".del-btn").addEventListener("click", async () => {
      if (confirm(`Excluir "${m.nome}"?`)) {
        await Store.deleteMateria(m.id);
        renderLista();
      }
    });
    lista.appendChild(row);
  });
}

async function addMateria() {
  const input = document.getElementById("nova-materia");
  const nome = input.value.trim();
  if (!nome) return;
  await Store.addMateria({ nome, nivel: document.getElementById("novo-nivel").value });
  input.value = "";
  renderLista();
}
