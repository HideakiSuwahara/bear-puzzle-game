// 現在ログイン中のユーザー情報
let currentUser = null;

/** いま表示している画面 ID（register / login / play / ranking） */
let currentScreenId = "play";

function saveCurrentUser(user) {
  localStorage.setItem("kumaPuyoCurrentUser", JSON.stringify(user));
  currentUser = user;
  updateCurrentUserDisplay();
}

function loadCurrentUser() {
  const raw = localStorage.getItem("kumaPuyoCurrentUser");
  if (raw) {
    try {
      currentUser = JSON.parse(raw);
    } catch {
      currentUser = null;
    }
  }
  updateCurrentUserDisplay();
}

function logout() {
  localStorage.removeItem("kumaPuyoCurrentUser");
  currentUser = null;
  updateCurrentUserDisplay();
  showAuthMessage("ログアウトしました");
}

function updateCurrentUserDisplay() {
  const el = document.getElementById("currentUserText");
  if (!el) return;
  if (currentUser) {
    el.textContent = `ログイン中: ${currentUser.userId}`;
  } else {
    el.textContent = "未ログイン";
  }
}

function showAuthMessage(message) {
  const el = document.getElementById("authMessage");
  if (el) el.textContent = message;
}

/** メインタブ ID（account / info / play） */
const SCREEN_TO_ROOT = {
  register: "account",
  login: "account",
  ranking: "info",
  play: "play",
};

function showRoot(rootId) {
  document.querySelectorAll(".root-panel").forEach((el) => {
    el.classList.toggle("is-active", el.id === "root-" + rootId);
  });
  document.querySelectorAll(".root-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.root === rootId);
  });
}

/**
 * メニューで画面を切り替える
 * @param {"register"|"login"|"play"|"ranking"} screenId
 */
function showScreen(screenId) {
  currentScreenId = screenId;
  const rootId = SCREEN_TO_ROOT[screenId] || "play";
  showRoot(rootId);

  document.querySelectorAll(".screen").forEach((el) => {
    el.classList.toggle("is-active", el.id === "screen-" + screenId);
  });
  document.querySelectorAll(".sub-nav-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.screen === screenId);
  });
  if (screenId === "ranking") {
    loadRanking();
  }
}

async function handleRegister() {
  try {
    if (typeof registerUser !== "function") {
      showAuthMessage("エラー: api.js が読み込まれていないか、registerUser がありません");
      return;
    }
    const userIdEl = document.getElementById("registerUserId");
    const passEl = document.getElementById("registerPassword");
    if (!userIdEl || !passEl) {
      showAuthMessage("エラー: 登録用の入力欄が見つかりません");
      return;
    }
    const userId = userIdEl.value.trim();
    const password = passEl.value;
    const result = await registerUser(userId, password);
    if (result && result.success) {
      showAuthMessage("登録成功！ログイン画面でサインインしてください");
      passEl.value = "";
      showScreen("login");
    } else {
      let msg = (result && result.message) || "登録失敗（サーバーが success: true を返していません）";
      if (result && result._rawPreview) {
        msg += " [応答の先頭: " + result._rawPreview.replace(/\s+/g, " ") + "…]";
      }
      showAuthMessage(msg);
      console.warn("registerUser 応答:", result);
    }
  } catch (err) {
    console.error(err);
    showAuthMessage("登録処理中にエラーが発生しました: " + (err && err.message ? err.message : String(err)));
  }
}

async function handleLogin() {
  try {
    if (typeof loginUser !== "function") {
      showAuthMessage("エラー: api.js が読み込まれていないか、loginUser がありません");
      return;
    }
    const userIdEl = document.getElementById("loginUserId");
    const passEl = document.getElementById("loginPassword");
    if (!userIdEl || !passEl) {
      showAuthMessage("エラー: ログイン用の入力欄が見つかりません");
      return;
    }
    const userId = userIdEl.value.trim();
    const password = passEl.value;
    const result = await loginUser(userId, password);
    if (result.success) {
      saveCurrentUser(result.user);
      showAuthMessage("ログイン成功！プレイ画面へどうぞ");
      showScreen("play");
    } else {
      showAuthMessage(result.message || "ログイン失敗");
    }
  } catch (err) {
    console.error(err);
    showAuthMessage("ログイン処理中にエラーが発生しました: " + (err && err.message ? err.message : String(err)));
  }
}

/**
 * ランキング一覧を取得して表示（GAS の ranking アクション）
 */
async function loadRanking() {
  try {
    if (typeof fetchRanking !== "function") {
      const list = document.getElementById("rankingList");
      if (list) list.innerHTML = "<li>fetchRanking が未定義です</li>";
      return;
    }
    const list = document.getElementById("rankingList");
    if (list) {
      list.innerHTML = "<li>読み込み中…</li>";
    }
    const result = await fetchRanking();
    if (!list) return;
    list.innerHTML = "";
    if (!result || !result.success || !result.ranking) {
      const reason =
        (result && result.message) || "ランキング取得失敗（success / ranking を確認）";
      list.innerHTML = "<li>" + reason + "</li>";
      console.warn("fetchRanking 応答:", result);
      return;
    }
    if (result.ranking.length === 0) {
      list.innerHTML = "<li>まだ記録がありません</li>";
      return;
    }
    result.ranking.forEach((item, index) => {
      const li = document.createElement("li");
      const uid = item.userId != null ? item.userId : "?";
      const sc = item.score != null ? item.score : 0;
      li.textContent = `${index + 1}. ${uid} — ${sc}点`;
      list.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    const list = document.getElementById("rankingList");
    if (list) list.innerHTML = "<li>ランキング読み込みエラー</li>";
  }
}

/**
 * ゲームオーバー時に呼ぶ。ログイン済みなら saveScore で GAS に送信し、ランキングを再取得。
 * @param {number} finalScore
 */
async function submitScoreAfterGameOver(finalScore) {
  const s = Math.floor(Number(finalScore) || 0);
  if (s <= 0) {
    return;
  }
  if (!currentUser || !currentUser.userId) {
    showAuthMessage("ゲームオーバー！スコア " + s + " 点（ログインするとランキングに送信されます）");
    return;
  }
  if (typeof saveScore !== "function") {
    showAuthMessage("saveScore が未定義のため送信できません");
    return;
  }
  try {
    const result = await saveScore(currentUser.userId, s);
    if (result && result.success) {
      showAuthMessage("スコア " + s + " 点をランキングに送信しました");
      await loadRanking();
    } else {
      const msg = (result && result.message) || "スコア送信に失敗しました";
      showAuthMessage(msg);
      console.warn("saveScore 応答:", result);
    }
  } catch (err) {
    console.error(err);
    showAuthMessage("スコア送信中にエラー: " + (err && err.message ? err.message : String(err)));
  }
}

window.submitScoreAfterGameOver = submitScoreAfterGameOver;

function setupAuthEvents() {
  document.querySelectorAll(".root-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      showAuthMessage("");
      const root = btn.dataset.root;
      if (!root) return;
      if (root === "account") {
        if (currentScreenId === "register" || currentScreenId === "login") {
          showScreen(currentScreenId);
        } else {
          showScreen("login");
        }
      } else if (root === "info") {
        showScreen("ranking");
      } else if (root === "play") {
        showScreen("play");
      }
    });
  });

  document.querySelectorAll(".sub-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      showAuthMessage("");
      const id = btn.dataset.screen;
      if (id) showScreen(id);
    });
  });

  const regBtn = document.getElementById("registerBtn");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const refreshRank = document.getElementById("refreshRankingBtn");
  if (regBtn) regBtn.addEventListener("click", handleRegister);
  if (loginBtn) loginBtn.addEventListener("click", handleLogin);
  if (logoutBtn) logoutBtn.addEventListener("click", logout);
  if (refreshRank) refreshRank.addEventListener("click", () => loadRanking());
}

document.addEventListener("DOMContentLoaded", () => {
  setupAuthEvents();
  loadCurrentUser();
  showScreen("play");
});
