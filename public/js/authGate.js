// Gera o HTML de um aviso pedindo login/cadastro, usado nas páginas que só
// funcionam de verdade com uma conta (Simulados, Matérias, Perfil) quando
// a pessoa está navegando como visitante.
function loginGateHtml({ mensagem, pagina }) {
  const next = encodeURIComponent(pagina);
  return `
    <div class="empty-state" style="padding:56px 24px;">
      <p style="margin:0 0 18px; font-size:14.5px;">${mensagem}</p>
      <div style="display:flex; gap:10px; justify-content:center;">
        <a class="btn btn-primary" href="login.html?next=${next}" style="text-decoration:none;">Entrar</a>
        <a class="btn" href="login.html?next=${next}&modo=signup" style="text-decoration:none;">Criar conta</a>
      </div>
    </div>
  `;
}
