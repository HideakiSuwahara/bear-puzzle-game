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

async function apiPost(data) {
  try {
    const response = await fetch(API_BASE_URL, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(data),
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
    const msg =
      err && err.message
        ? err.message
        : String(err);
    let hint = "";
    if (
      msg.indexOf("Failed to fetch") >= 0 ||
      msg.indexOf("NetworkError") >= 0
    ) {
      hint =
        "（ネットワーク/CORSの可能性: file:// ではなく http://localhost で開いているか確認）";
    }
    return {
      success: false,
      message: "通信エラー: " + msg + hint,
    };
  }
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
