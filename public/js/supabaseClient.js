// Configuração do projeto Supabase "Gabarita".
// A anon key é pública por natureza (é feita para rodar no navegador) —
// a segurança real vem das políticas de RLS configuradas no banco, que
// garantem que cada usuário só acessa os próprios dados.
const SUPABASE_URL = "https://dxvyxutuywxcjkywblge.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4dnl4dXR1eXd4Y2preXdibGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNTMwODgsImV4cCI6MjEwNDkyOTA4OH0.rsv_VWyeUIpnYo38Tkgp5EmBdTAFCzV4j6fd4wsNSv8";

// A biblioteca do Supabase vem de um CDN. Se ela não carregar (rede instável,
// bloqueio corporativo, CDN fora do ar), `window.supabase` fica indefinido e
// TODO o resto do site quebrava numa cascata de erros de console, deixando a
// página em branco sem nenhuma explicação para o usuário.
let supabaseClient = null;

if (window.supabase && typeof window.supabase.createClient === "function") {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  mostrarFalhaDeCarregamento();
}

function mostrarFalhaDeCarregamento() {
  const aviso = document.createElement("div");
  aviso.style.cssText =
    "position:fixed; inset:0; z-index:999; display:flex; align-items:center;" +
    "justify-content:center; padding:24px; background:#12181b; color:#ece7da;" +
    "font-family:ui-sans-serif,system-ui,sans-serif; text-align:center;";
  aviso.innerHTML =
    '<div style="max-width:420px;">' +
    '<div style="font-size:19px; margin-bottom:10px;">Não consegui carregar o site por completo</div>' +
    '<div style="font-size:14px; color:#98a3a3; line-height:1.55;">' +
    "Uma das bibliotecas externas não carregou. Isso costuma ser conexão instável " +
    "ou algum bloqueador de rede. Recarregue a página para tentar de novo." +
    "</div>" +
    '<button onclick="location.reload()" style="margin-top:18px; padding:10px 18px;' +
    'border-radius:4px; border:1px solid #c98a3b; background:#c98a3b; color:#1a1305;' +
    'font-weight:600; cursor:pointer; font-size:14px;">Recarregar</button>' +
    "</div>";

  if (document.body) document.body.appendChild(aviso);
  else document.addEventListener("DOMContentLoaded", () => document.body.appendChild(aviso));
}
