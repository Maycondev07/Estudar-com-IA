let mode = "login"; // ou "signup"

const params = new URLSearchParams(location.search);

// Só aceita redirecionar para páginas internas conhecidas. Sem essa checagem,
// um link como login.html?next=https://site-falso.com levaria o usuário pra
// fora do site logo após o login (open redirect).
const PAGINAS_INTERNAS = ["index.html", "simulados.html", "materias.html", "perfil.html"];
const nextParam = params.get("next");
const redirectTo = PAGINAS_INTERNAS.includes(nextParam) ? nextParam : "index.html";

const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const submitBtn = document.getElementById("submit-btn");
const msgEl = document.getElementById("msg");

tabLogin.addEventListener("click", () => setMode("login"));
tabSignup.addEventListener("click", () => setMode("signup"));

function setMode(nextMode) {
  mode = nextMode;
  tabLogin.classList.toggle("active", mode === "login");
  tabSignup.classList.toggle("active", mode === "signup");
  submitBtn.textContent = mode === "login" ? "Entrar" : "Criar conta";
  hideMsg();
}

if (params.get("modo") === "signup") setMode("signup");

function showMsg(text, type) {
  msgEl.textContent = text;
  msgEl.className = "msg " + (type === "error" ? "msg-error" : "msg-success");
  msgEl.style.display = "block";
}

function hideMsg() {
  msgEl.style.display = "none";
}

submitBtn.addEventListener("click", async () => {
  if (!supabaseClient) {
    showMsg("O site não carregou por completo. Recarregue a página e tente de novo.", "error");
    return;
  }
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value;

  if (!email || !senha) {
    showMsg("Preencha e-mail e senha.", "error");
    return;
  }
  if (senha.length < 6) {
    showMsg("A senha precisa ter pelo menos 6 caracteres.", "error");
    return;
  }

  submitBtn.disabled = true;
  hideMsg();

  try {
    if (mode === "login") {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      window.location.href = redirectTo;
    } else {
      const { error } = await supabaseClient.auth.signUp({ email, password: senha });
      if (error) throw error;
      showMsg("Conta criada! Verifique seu e-mail se for pedida confirmação, ou já tente entrar.", "success");
      setMode("login");
    }
  } catch (err) {
    showMsg(traduzErro(err.message), "error");
  } finally {
    submitBtn.disabled = false;
  }
});

function traduzErro(msg) {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/user already registered/i.test(msg)) return "Já existe uma conta com esse e-mail. Tente entrar.";
  if (/email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar.";
  return msg;
}

// Se já estiver logado, pula direto para onde a pessoa queria ir
(async () => {
  if (!supabaseClient) return; // biblioteca não carregou; o aviso já está na tela
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session) window.location.href = redirectTo;
})();
