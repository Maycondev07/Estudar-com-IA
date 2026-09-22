function renderNavbar(activePage, user) {
  const links = [
    { id: "inicio", href: "index.html", label: "Início" },
    { id: "simulados", href: "simulados.html", label: "Simulados" },
    { id: "materias", href: "materias.html", label: "Matérias" },
    { id: "perfil", href: "perfil.html", label: "Perfil" },
  ];

  const el = document.getElementById("navbar");
  if (!el) return;

  const currentPage = location.pathname.split("/").pop() || "index.html";

  const authArea = user
    ? `
      <span class="label" style="text-transform:none">${user.email}</span>
      <button id="logout-btn" class="btn" style="padding:6px 14px; font-size:13px;">Sair</button>
    `
    : `
      <a class="btn" style="padding:6px 14px; font-size:13px; text-decoration:none;"
         href="login.html?next=${encodeURIComponent(currentPage)}">Entrar</a>
      <a class="btn btn-primary" style="padding:6px 14px; font-size:13px; text-decoration:none;"
         href="login.html?next=${encodeURIComponent(currentPage)}&modo=signup">Criar conta</a>
    `;

  el.innerHTML = `
    <div class="brand">Treineiro</div>
    <nav>
      ${links
        .map(
          (l) =>
            `<a href="${l.href}" class="${l.id === activePage ? "active" : ""}">${l.label}</a>`
        )
        .join("")}
    </nav>
    <div style="display:flex; align-items:center; gap:10px;">
      ${authArea}
    </div>
  `;

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);
}
