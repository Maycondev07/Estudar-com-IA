// Retorna o usuário logado (com .id, .email), ou null se ninguém estiver
// logado — sem redirecionar. Use isso em páginas que funcionam também para
// visitantes (não logados), como o chat.
async function getOptionalUser() {
  // Se a biblioteca do Supabase não carregou, o aviso já está na tela —
  // aqui só evitamos a cascata de erros no console.
  if (!supabaseClient) return null;
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  return session ? session.user : null;
}

// Versão mais rígida: redireciona para login.html se não houver sessão.
// Só usada em telas que exigem estar logado para funcionar de verdade.
async function requireAuth() {
  const user = await getOptionalUser();
  if (!user) {
    window.location.href = "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop());
    return null;
  }
  return user;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}
