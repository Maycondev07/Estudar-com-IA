// Configuração do projeto Supabase "Treineiro".
// A anon key é pública por natureza (é feita para rodar no navegador) —
// a segurança real vem das políticas de RLS configuradas no banco, que
// garantem que cada usuário só acessa os próprios dados.
const SUPABASE_URL = "https://dxvyxutuywxcjkywblge.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4dnl4dXR1eXd4Y2preXdibGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNTMwODgsImV4cCI6MjEwNDkyOTA4OH0.rsv_VWyeUIpnYo38Tkgp5EmBdTAFCzV4j6fd4wsNSv8";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
