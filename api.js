/**
 * Google Apps Script Web アプリと通信します。
 *
 * ■ スプレッドシートに書き込まれないとき先に確認すること
 * 1) index.html を file:// で開いていないか
 *    → Live Server や「python -m http.server」など http://localhost で開いてください。
 *    file:// だと CORS で fetch が失敗することがあります。
 * 2) GAS のデプロイで「アクセスできるユーザー」が「全員」になっているか
 * 3) 新しいコード保存後に「デプロイを管理」から新しいバージョンで再デプロイしたか
 *
 * ■ GAS 側 doPost の例（postData.contents を JSON として読む）
 * function doPost(e) {
 *   const out = ContentService.createTextOutput();
 *   out.setMimeType(ContentService.MimeType.JSON);
 *   try {
 *     const data = JSON.parse(e.postData.contents);
 *     if (data.action === 'register') { ...スプレッドシートへ追記... }
 *     return out.setContent(JSON.stringify({ success: true }));
 *   } catch (err) {
 *     return out.setContent(JSON.stringify({ success: false, message: String(err) }));
 *   }
 * }
 */

const API_BASE_URL =
  "https://script.google.com/macros/s/AKfycbxCfd6bP4XomhjUlaMvNdqY679ZNh9NJB1WNLg_cQxAOLCSgFGP89Wy-QNCAjsdCn5_Gw/exec";

/**
 * レスポンス本文を読み、JSON を返す。失敗時は { _parseError, _rawText, _httpStatus } を付与できる形で返す
 * @param {Response} response
 * @returns {Promise<object>}
 */
async function parseJsonResponse(response) {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      success: false,
      message: "サーバーから空の応答が返りました（HTTP " + response.status + "）",
      _httpStatus: response.status,
    };
  }
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    return {
      success: false,
      message:
        "HTML が返りました（WebアプリのURL・デプロイ・権限を確認）。HTTP " +
        response.status,
      _httpStatus: response.status,
      _rawPreview: trimmed.slice(0, 120),
    };
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return {
      success: false,
      message: "JSON でない応答です（HTTP " + response.status + "）: " + trimmed.slice(0, 80),
      _httpStatus: response.status,
    };
  }
}

/**
 * Google Apps Script Web アプリへの POST。
 * fetch は 302 リダイレクト時に POST が GET に化けるブラウザがあり、登録/ログインが失敗することがあるため
 * XMLHttpRequest を使う（GAS 公式のデプロイ URL 向け）。
 */
function apiPostXhr(data) {
  const body = JSON.stringify(data);
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE_URL);
    xhr.setRequestHeader("Content-Type", "text/plain;charset=utf-8");
    xhr.timeout = 60000;
    xhr.onload = () => {
      const text = (xhr.responseText || "").trim();
      let result;
      if (!text) {
        result = {
          success: false,
          message: "サーバーから空の応答が返りました（HTTP " + xhr.status + "）",
        };
      } else if (text.startsWith("<!") || text.startsWith("<html")) {
        result = {
          success: false,
          message:
            "HTML が返りました（WebアプリのURL・デプロイ・権限を確認）。HTTP " +
            xhr.status,
          _rawPreview: text.slice(0, 120),
        };
      } else {
        try {
          result = JSON.parse(text);
        } catch {
          result = {
            success: false,
            message:
              "JSON でない応答です（HTTP " + xhr.status + "）: " + text.slice(0, 80),
          };
        }
      }

      if (xhr.status >= 400 && result.success !== false && !result.message) {
        result.success = false;
        result.message = "HTTP エラー " + xhr.status;
      }

      if (result.success === undefined && result.ok === true) {
        result.success = true;
      }
      if (result.success === undefined && result.status === "ok") {
        result.success = true;
      }

      resolve(result);
    };
    xhr.onerror = () => {
      resolve({
        success: false,
        message:
          "通信エラー（ネットワーク）。HTTPS の公開URLで開いているか、GAS を「全員」デプロイしているか確認してください。",
      });
    };
    xhr.ontimeout = () => {
      resolve({ success: false, message: "通信がタイムアウトしました" });
    };
    xhr.send(body);
  });
}

async function apiPost(data) {
  return apiPostXhr(data);
}

async function apiGet(params = {}) {
  try {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${API_BASE_URL}?${query}` : API_BASE_URL;
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
    });

    const result = await parseJsonResponse(response);

    if (!response.ok && result.success !== false && !result.message) {
      result.success = false;
      result.message = "HTTP エラー " + response.status;
    }

    if (result.success === undefined && result.ok === true) {
      result.success = true;
    }
    if (result.success === undefined && result.status === "ok") {
      result.success = true;
    }

    return result;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return {
      success: false,
      message: "通信エラー: " + msg,
      ranking: [],
    };
  }
}

async function registerUser(userId, password) {
  return await apiPost({ action: "register", userId, password });
}

async function loginUser(userId, password) {
  return await apiPost({ action: "login", userId, password });
}

async function saveScore(userId, score) {
  return await apiPost({ action: "saveScore", userId, score });
}

async function fetchRanking() {
  return await apiGet({ action: "ranking" });
}
