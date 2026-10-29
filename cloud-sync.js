(function () {
  "use strict";

  const config = window.SimpleStepSupabaseConfig;
  if (!config || !window.supabase?.createClient) {
    window.SimpleStepCloud = { ready: Promise.reject(new Error("Supabase client is unavailable.")) };
    return;
  }

  const client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  let currentUser = null;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });

  function ensureAuthView() {
    let view = document.getElementById("cloudAuthView");
    if (view) return view;
    view = document.createElement("div");
    view.id = "cloudAuthView";
    view.className = "cloud-auth-view";
    view.innerHTML = `
      <section class="cloud-auth-card" aria-labelledby="cloudAuthTitle">
        <p class="eyebrow">SimpleStep Online</p>
        <h1 id="cloudAuthTitle">同じデータを、どの端末でも</h1>
        <p>メールアドレスとパスワードでログインしてください。</p>
        <form id="cloudAuthForm">
          <label>メールアドレス<input id="cloudAuthEmail" type="email" autocomplete="email" required></label>
          <label>パスワード<input id="cloudAuthPassword" type="password" minlength="10" autocomplete="current-password" required></label>
          <p id="cloudAuthMessage" class="cloud-auth-message" role="status"></p>
          <button class="primary-button" type="submit">ログイン</button>
          <button id="cloudSignUp" class="secondary-button" type="button">初めて使う方：アカウント作成</button>
        </form>
        <small>既存のブラウザ内データは、初回ログイン後に確認してから移行します。</small>
      </section>`;
    document.body.append(view);
    const form = view.querySelector("#cloudAuthForm");
    const message = view.querySelector("#cloudAuthMessage");
    const values = () => ({
      email: view.querySelector("#cloudAuthEmail").value.trim(),
      password: view.querySelector("#cloudAuthPassword").value
    });
    const busy = value => view.querySelectorAll("button,input").forEach(element => { element.disabled = value; });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      busy(true); message.textContent = "ログインしています…";
      const { error } = await client.auth.signInWithPassword(values());
      if (error) { message.textContent = "ログインできませんでした。メールアドレスとパスワードを確認してください。"; busy(false); }
    });
    view.querySelector("#cloudSignUp").addEventListener("click", async () => {
      if (!form.reportValidity()) return;
      busy(true); message.textContent = "アカウントを作成しています…";
      const { data, error } = await client.auth.signUp({
        ...values(),
        options: { emailRedirectTo: "https://sukoshikaizen.github.io/simple-step-web/" }
      });
      if (error) { message.textContent = `作成できませんでした：${error.message}`; busy(false); return; }
      if (!data.session) { message.textContent = "確認メールを送りました。メール内のリンクを開いてください。"; busy(false); }
    });
    return view;
  }

  function finishAuth(user) {
    if (!user || currentUser) return;
    currentUser = user;
    document.getElementById("cloudAuthView")?.remove();
    document.documentElement.classList.add("cloud-authenticated");
    resolveReady(user);
    const returnTo = new URLSearchParams(location.search).get("returnTo");
    if (returnTo && returnTo.startsWith("/simple-step-web/oauth/consent/")) {
      location.replace(returnTo);
    }
  }

  client.auth.onAuthStateChange((_event, session) => {
    if (session?.user) finishAuth(session.user);
    else if (!currentUser) ensureAuthView();
  });

  (async () => {
    const { data } = await client.auth.getSession();
    if (data.session?.user) finishAuth(data.session.user);
    else ensureAuthView();
  })();

  window.SimpleStepCloud = {
    client,
    ready,
    getUser: () => currentUser,
    async signOut() {
      await client.auth.signOut();
      location.reload();
    }
  };
}());
