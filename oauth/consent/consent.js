(async function () {
  "use strict";

  const message = document.getElementById("consentMessage");
  const details = document.getElementById("consentDetails");
  const clientName = document.getElementById("consentClientName");
  const authorizationId = new URLSearchParams(location.search).get("authorization_id");
  const config = window.SimpleStepSupabaseConfig;

  if (!authorizationId || !config || !window.supabase?.createClient) {
    message.textContent = "連携情報を確認できませんでした。ChatGPTから接続をやり直してください。";
    return;
  }

  const client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) {
    const returnPath = location.pathname + location.search;
    location.href = `../../?returnTo=${encodeURIComponent(returnPath)}`;
    return;
  }

  try {
    const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error) throw error;
    if (!data.authorization_id && data.redirect_url) {
      location.href = data.redirect_url;
      return;
    }
    clientName.textContent = data.client?.name || "接続元のAI";
    message.textContent = "内容を確認して、連携を許可してください。";
    details.hidden = false;
  } catch (error) {
    console.error(error);
    message.textContent = "連携情報を取得できませんでした。接続をやり直してください。";
    return;
  }

  const finish = async action => {
    details.querySelectorAll("button").forEach(button => { button.disabled = true; });
    message.textContent = action === "approve" ? "連携を許可しています…" : "連携を拒否しています…";
    const method = action === "approve" ? "approveAuthorization" : "denyAuthorization";
    const { data, error } = await client.auth.oauth[method](authorizationId);
    if (error) {
      message.textContent = `処理できませんでした：${error.message}`;
      details.querySelectorAll("button").forEach(button => { button.disabled = false; });
      return;
    }
    location.href = data.redirect_url;
  };

  document.getElementById("approveConsent").onclick = () => finish("approve");
  document.getElementById("denyConsent").onclick = () => finish("deny");
}());
