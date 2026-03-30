/**
 * script.js — くまぷよ風パズル
 * --------------------------------------------
 * - 2 匹が 1 組で落ちる（色はそれぞれランダム）。回転で向きを変えられる。
 * - 固定後は列ごとに重力がかかり、足場のない方は下まで落ちる（ぷよと同様）。
 * - 4 個以上の同色つながりで消去・連鎖のルールは従来どおり。
 * - フィールドは row=0 が一番上。activePiece はピボット 1 マス + 相対オフセットで 2 マスを表す。
 */

(function initBearPuyoGame() {
  "use strict";

  // ---------------------------------------------------------------------------
  // 定数：フィールドサイズ・色・スコア関連
  // ---------------------------------------------------------------------------

  /** 横方向のマス数（列） */
  const COLS = 6;

  /** 縦方向のマス数（行） */
  const ROWS = 12;

  /** ぷよの色は 4 種類（0〜3 の番号で管理し、描画時に色に変換） */
  const COLOR_COUNT = 4;

  /**
   * くまの毛色（4色・ベースの色相はそのままにパステル調）
   */
  const PUYO_COLORS = [
    "#f0b8a8", // 0: テラコッタ系ピーチ
    "#fce4a8", // 1: はちみつ系レモンクリーム
    "#b8e8d4", // 2: 森系ミント
    "#c5daf0", // 3: 空色スカイパステル
  ];

  /** 盤面に積んで待っているときの瞬き：周期（ミリ秒） */
  const IDLE_BLINK_CYCLE_MS = 2000;
  /** 1 周期のうち目を閉じている時間 */
  const IDLE_BLINK_CLOSED_MS = 110;

  /** 待機中の「口や目を変える」表情スロットの切り替わり（マスごとに位相ずらし） */
  const IDLE_VARIANT_BASE_MS = 720;
  const IDLE_VARIANT_JITTER_MS = 380;

  /** 消去前：驚き顔を見せる時間（その後 2 回点滅して消える） */
  const PHASE_SURPRISE_MS = 200;
  /** 1 回の「消える」側の点滅の長さ */
  const BLINK_OFF_MS = 75;
  /** 1 回の「戻る」側の表示の長さ */
  const BLINK_ON_MS = 110;
  /** 驚き + (消える→戻る) × 2 の合計 */
  const CLEAR_ANIM_TOTAL_MS =
    PHASE_SURPRISE_MS + 2 * (BLINK_OFF_MS + BLINK_ON_MS);

  /** 消した 1 個あたりの基礎点 */
  const POINTS_PER_PUYO = 65;

  /**
   * 連鎖倍率（強め）：1連鎖目 1倍、2連鎖目 3倍、3連鎖目 9倍、4連鎖目 27倍 …
   * 3 の (chain-1) 乗。さらに連鎖が深いほど加算ボーナスを足す。
   * @param {number} chain 1 始まりの連鎖段数
   */
  function chainMultiplier(chain) {
    return Math.pow(3, chain - 1);
  }

  /**
   * 連鎖深度ボーナス（消した個数 × この値 × (連鎖段数-1)）を加点
   */
  const CHAIN_DEPTH_BONUS_PER_CELL = 12;

  /**
   * 盤面に固定され待機中のくまが「目を閉じる」瞬間か（マスごとに位相をずらす）
   */
  function isIdleBearEyesClosed(row, col) {
    const offset = (row * 19 + col * 23) * 41;
    const cycle = IDLE_BLINK_CYCLE_MS;
    const t = (performance.now() + offset) % cycle;
    return t >= cycle - IDLE_BLINK_CLOSED_MS;
  }

  /** 待機中に繰り返す表情バリアント（瞬き以外の変化） */
  const IDLE_FACE_VARIANTS = ["happy", "ooh", "sleepy", "peek", "grin"];

  /**
   * マスごとに短い周期で表情モードを切り替え（飽きないよう位相をばらす）
   */
  function getIdleFaceVariant(row, col) {
    const salt = row * 71 + col * 113;
    const t = performance.now() + salt * 23;
    const period = IDLE_VARIANT_BASE_MS + (salt % IDLE_VARIANT_JITTER_MS);
    const slot = Math.floor(t / period) % IDLE_FACE_VARIANTS.length;
    return IDLE_FACE_VARIANTS[slot];
  }

  /** 新しい組が出現する列（0 始まり）。6 列の中央付近 */
  const SPAWN_COL = 2;

  /**
   * 一番上の行（row=0）。ここに固定ブロックが乗ると次の組が出せずゲームオーバーになり得る。
   * 描画でこの段を「デッドライン」として色分けする。
   */
  const DEADLINE_ROW = 0;

  /** 初期縦向き出現で空きが必要な上側の段数（row 0 と 1） */
  const SPAWN_CLEAR_ROW_COUNT = 2;

  /**
   * ピボットから見た「もう 1 匹」の相対位置（rot 0〜3、時計回り）
   * rot0: 上 — ピボットが下側のくま（初期出現は row=1 がピボット、上に相棒）
   */
  const ROT_SECONDARY_OFFSET = [
    { dr: -1, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
  ];

  /** ゲーム開始直後の自然落下の間隔（ミリ秒） */
  const NORMAL_DROP_MS = 650;

  /** ↓キー押下中の高速落下の間隔（ミリ秒） */
  const FAST_DROP_MS = 45;

  /**
   * 開始から 60 秒までは自然落下は一定。それ以降は経過秒に比例してどんどん短くする。
   */
  const GRAVITY_FLAT_PHASE_SEC = 60;
  /** 1 分経過後の最短落下間隔（ミリ秒） */
  const GRAVITY_FASTEST_MS = 300;
  /** 60 秒より後、1 秒あたりこの分だけ間隔を短くする（線形・どんどん加速） */
  const GRAVITY_ACCEL_MS_PER_SEC = 11;

  /** つながり判定に使う「上下左右」の移動ベクトル */
  const DIRECTIONS = [
    { dr: 1, dc: 0 },
    { dr: -1, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 0, dc: -1 },
  ];

  // ---------------------------------------------------------------------------
  // DOM 参照
  // ---------------------------------------------------------------------------

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas && canvas.getContext("2d");
  // index.html では id が score / chain。旧レイアウトの scoreDisplay もフォールバック
  const scoreDisplay =
    document.getElementById("score") || document.getElementById("scoreDisplay");
  const chainDisplay =
    document.getElementById("chain") || document.getElementById("chainDisplay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  // 再開ボタンが無いページでは「ゲームスタート」でリセット
  const restartBtn =
    document.getElementById("restartBtn") || document.getElementById("startBtn");

  /** 1 マスあたりのピクセル幅・高さ（canvas サイズから自動計算） */
  const CELL_W = canvas ? canvas.width / COLS : 0;
  const CELL_H = canvas ? canvas.height / ROWS : 0;

  // ---------------------------------------------------------------------------
  // ゲーム状態
  // ---------------------------------------------------------------------------

  /**
   * 固定済みのぷよだけを保持する盤面。
   * board[row][col] は「null か 0〜3 の色番号」
   */
  let board = [];

  /**
   * 今落ちている 2 匹組。ないときは null。
   * ピボット (row,col) に colorA、相棒に colorB。rot は 0〜3（ROT_SECONDARY_OFFSET）
   * @type {{ col: number, row: number, rot: number, colorA: number, colorB: number } | null}
   */
  let activePiece = null;

  /**
   * 次の組の色（現在操作中の組の次に出る予定）
   * @type {{ colorA: number, colorB: number } | null}
   */
  let nextPair = null;

  /** 累積スコア */
  let score = 0;

  /**
   * 「直前の固定〜次の固定まで」の連鎖で、最後に達した連鎖段数の表示用。
   * 消えなかった場合は 0。
   */
  let lastChainCount = 0;

  /** ゲームオーバーなら true */
  let gameOver = false;

  /**
   * 消去アニメ中に「驚き顔」を描くマス（board はまだ消してない）
   * @type {{ row: number, col: number, color: number }[] | null}
   */
  let clearAnimSnapshots = null;

  /** 驚きアニメ開始時刻（少し弾む演出用） */
  let clearAnimStartTime = 0;

  /** ゲームスタートからの経過で重力を変える基準時刻 */
  let gameSpeedEpochStart = 0;

  /** キー入力（↓が押されているか） */
  const keys = { down: false, left: false, right: false };

  /** 左右キーのリピート用 */
  let lateralRepeatTimerId = null;
  let lateralInitialTimerId = null;

  /** 落下用の蓄積時間 */
  let dropAccumulator = 0;

  /** requestAnimationFrame の前フレーム時刻 */
  let lastFrameTime = performance.now();

  // ---------------------------------------------------------------------------
  // 盤面まわりのユーティリティ
  // ---------------------------------------------------------------------------

  /**
   * 空の盤面を作り直す（すべて null）
   */
  function createEmptyBoard() {
    const b = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        row.push(null);
      }
      b.push(row);
    }
    return b;
  }

  /**
   * 盤面内かどうか
   */
  function inBounds(row, col) {
    return row >= 0 && row < ROWS && col >= 0 && col < COLS;
  }

  /**
   * そのマスに「固定された」ぷよがあるか
   */
  function isCellFilled(row, col) {
    return board[row][col] !== null;
  }

  /**
   * 操作中のぷよが (row, col) に移動できるか
   * - 盤外（下方向の「地面」は row === ROWS）も「埋まっている」とみなす
   */
  function canActiveOccupy(row, col) {
    if (col < 0 || col >= COLS || row < 0) {
      return false;
    }
    if (row >= ROWS) {
      return false;
    }
    return !isCellFilled(row, col);
  }

  /**
   * ランダムな色番号（0〜COLOR_COUNT-1）
   */
  function randomColor() {
    return Math.floor(Math.random() * COLOR_COUNT);
  }

  /**
   * いまの自然落下 1 マス分の待ち時間（↓押下中は常に FAST）
   */
  function getGravityDropIntervalMs() {
    if (keys.down) {
      return FAST_DROP_MS;
    }
    const elapsedSec = (performance.now() - gameSpeedEpochStart) / 1000;
    if (elapsedSec <= GRAVITY_FLAT_PHASE_SEC) {
      return NORMAL_DROP_MS;
    }
    const overtime = elapsedSec - GRAVITY_FLAT_PHASE_SEC;
    const maxDrop = NORMAL_DROP_MS - GRAVITY_FASTEST_MS;
    const reduction = Math.min(overtime * GRAVITY_ACCEL_MS_PER_SEC, maxDrop);
    return Math.max(GRAVITY_FASTEST_MS, NORMAL_DROP_MS - reduction);
  }

  // ---------------------------------------------------------------------------
  // ぷよの移動・固定（2 匹組）
  // ---------------------------------------------------------------------------

  /**
   * ピボット位置と向きから、2 マスの座標 [ピボット, 相棒] を返す
   */
  function getActivePairCells(pivotRow, pivotCol, rot) {
    const o = ROT_SECONDARY_OFFSET[rot & 3];
    return [
      { row: pivotRow, col: pivotCol },
      { row: pivotRow + o.dr, col: pivotCol + o.dc },
    ];
  }

  /**
   * 2 マスとも操作中として置けるか
   */
  function canPairOccupy(pivotRow, pivotCol, rot) {
    const cells = getActivePairCells(pivotRow, pivotCol, rot);
    return cells.every(({ row, col }) => canActiveOccupy(row, col));
  }

  /**
   * 操作中の組を 1 マス下へ。動けたら true。
   */
  function tryMoveDown() {
    if (!activePiece || gameOver) {
      return false;
    }
    const nextRow = activePiece.row + 1;
    if (canPairOccupy(nextRow, activePiece.col, activePiece.rot)) {
      activePiece.row = nextRow;
      return true;
    }
    return false;
  }

  /**
   * 左右に 1 マス移動。deltaCol は -1 か +1。
   */
  function tryMoveHorizontal(deltaCol) {
    if (!activePiece || gameOver) {
      return;
    }
    const nc = activePiece.col + deltaCol;
    if (canPairOccupy(activePiece.row, nc, activePiece.rot)) {
      activePiece.col = nc;
    }
  }

  /**
   * 時計回りに 90° 回転（壁キックで位置調整）
   */
  function tryRotateClockwise() {
    if (!activePiece || gameOver) {
      return false;
    }
    const ap = activePiece;
    const nextRot = (ap.rot + 1) & 3;
    const kicks = [
      [ap.row, ap.col],
      [ap.row, ap.col - 1],
      [ap.row, ap.col + 1],
      [ap.row, ap.col - 2],
      [ap.row, ap.col + 2],
      [ap.row - 1, ap.col],
      [ap.row - 1, ap.col - 1],
      [ap.row - 1, ap.col + 1],
      [ap.row + 1, ap.col],
      [ap.row + 1, ap.col - 1],
      [ap.row + 1, ap.col + 1],
    ];
    for (const [r, c] of kicks) {
      if (canPairOccupy(r, c, nextRot)) {
        ap.row = r;
        ap.col = c;
        ap.rot = nextRot;
        return true;
      }
    }
    return false;
  }

  /**
   * 操作中の組を盤面に書き込み、重力で沈めてから消去・連鎖へ
   */
  function lockActivePiece() {
    if (!activePiece) {
      return;
    }
    const ap = activePiece;
    const [p0, p1] = getActivePairCells(ap.row, ap.col, ap.rot);
    board[p0.row][p0.col] = ap.colorA;
    board[p1.row][p1.col] = ap.colorB;
    activePiece = null;
    applyGravity();
    resolveClearsAndChainsAsync()
      .then(() => {
        trySpawnNextPiece();
      })
      .catch((err) => {
        console.error(err);
        clearAnimSnapshots = null;
        trySpawnNextPiece();
      });
  }

  /**
   * 新しい 2 匹組を出す。出せなければゲームオーバー。
   * 初期向きは縦（上に相棒）、ピボットは上から 2 段目。
   */
  function trySpawnNextPiece() {
    if (gameOver) {
      return;
    }
    const spawnRot = 0;
    const pivotRow = 1;
    const pivotCol = SPAWN_COL;
    if (!canPairOccupy(pivotRow, pivotCol, spawnRot)) {
      triggerGameOver();
      return;
    }
    const use =
      nextPair != null
        ? nextPair
        : { colorA: randomColor(), colorB: randomColor() };
    nextPair = { colorA: randomColor(), colorB: randomColor() };
    activePiece = {
      col: pivotCol,
      row: pivotRow,
      rot: spawnRot,
      colorA: use.colorA,
      colorB: use.colorB,
    };
  }

  // ---------------------------------------------------------------------------
  // つながり検出・消去・落下（連鎖）
  // ---------------------------------------------------------------------------

  /**
   * 幅優先探索で「同色でつながった塊」を求める
   * @param {number} startRow
   * @param {number} startCol
   * @param {boolean[][]} visited 参照渡しで訪問済みを更新
   * @returns {{ row: number, col: number }[]}
   */
  function collectConnectedGroup(startRow, startCol, visited) {
    const color = board[startRow][startCol];
    if (color === null) {
      return [];
    }
    const cells = [];
    const queue = [{ row: startRow, col: startCol }];
    visited[startRow][startCol] = true;

    while (queue.length > 0) {
      const cur = queue.shift();
      cells.push(cur);
      for (const d of DIRECTIONS) {
        const nr = cur.row + d.dr;
        const nc = cur.col + d.dc;
        if (!inBounds(nr, nc) || visited[nr][nc]) {
          continue;
        }
        if (board[nr][nc] === color) {
          visited[nr][nc] = true;
          queue.push({ row: nr, col: nc });
        }
      }
    }
    return cells;
  }

  /**
   * 「一度の消去フェーズ」で消すべき全マスをまとめて返す（4 個以上の塊すべて）
   * @returns {{ row: number, col: number }[]}
   */
  function findAllCellsToClearNow() {
    const visited = [];
    for (let r = 0; r < ROWS; r++) {
      visited.push(new Array(COLS).fill(false));
    }
    const toClear = [];
    const seen = new Set();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c] === null || visited[r][c]) {
          continue;
        }
        const group = collectConnectedGroup(r, c, visited);
        if (group.length >= 4) {
          for (const cell of group) {
            const key = cell.row + "," + cell.col;
            if (!seen.has(key)) {
              seen.add(key);
              toClear.push(cell);
            }
          }
        }
      }
    }
    return toClear;
  }

  /**
   * 指定マスを null にする
   */
  function clearCells(cells) {
    for (const { row, col } of cells) {
      board[row][col] = null;
    }
  }

  /**
   * 各列について、ぷよを下に詰める（上の空きは null）
   */
  function applyGravity() {
    for (let c = 0; c < COLS; c++) {
      const stack = [];
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][c] !== null) {
          stack.push(board[r][c]);
        }
      }
      let writeRow = ROWS - 1;
      for (const val of stack) {
        board[writeRow][c] = val;
        writeRow--;
      }
      while (writeRow >= 0) {
        board[writeRow][c] = null;
        writeRow--;
      }
    }
  }

  /**
   * 消去対象のマスを「驚き顔 → 2回点滅（消えて戻る）」のあと盤から消す（1連鎖分）
   */
  async function playSurpriseThenClearCells(cells, chainIndex) {
    clearAnimSnapshots = cells.map(({ row, col }) => ({
      row,
      col,
      color: board[row][col],
    }));
    clearAnimStartTime = performance.now();
    await new Promise((resolve) =>
      setTimeout(resolve, CLEAR_ANIM_TOTAL_MS)
    );
    clearAnimSnapshots = null;
    const mult = chainMultiplier(chainIndex);
    const base = cells.length * POINTS_PER_PUYO * mult;
    const depthExtra =
      chainIndex > 1
        ? cells.length * CHAIN_DEPTH_BONUS_PER_CELL * (chainIndex - 1)
        : 0;
    score += Math.floor(base + depthExtra);
    clearCells(cells);
    applyGravity();
  }

  /**
   * 消えるマスの付近に「Nれんさ！」を 2 回点滅させる（2 連鎖目以降）
   * @param {number} chainLevel 2 以上
   * @param {{ row: number, col: number }[]} cells
   */
  function showChainComboPopup(chainLevel, cells) {
    if (chainLevel < 2 || !cells || cells.length === 0) {
      return;
    }
    const layer = document.getElementById("chainFxLayer");
    if (!layer) {
      return;
    }
    let sumR = 0;
    let sumC = 0;
    for (const c of cells) {
      sumR += c.row;
      sumC += c.col;
    }
    const ar = sumR / cells.length;
    const ac = sumC / cells.length;
    const leftPct = Math.min(88, Math.max(12, ((ac + 0.5) / COLS) * 100));
    const topPct = Math.min(90, Math.max(8, ((ar + 0.5) / ROWS) * 100));

    const el = document.createElement("div");
    el.className = "chain-fx-bubble";
    el.textContent = chainLevel + " れんさ！";
    el.style.left = leftPct + "%";
    el.style.top = topPct + "%";
    layer.appendChild(el);
    el.addEventListener(
      "animationend",
      () => {
        el.remove();
      },
      { once: true }
    );
  }

  /**
   * 固定直後：消えるものがなくなるまで「驚き→消去→落下」を繰り返し、連鎖を数える
   */
  async function resolveClearsAndChainsAsync() {
    let chain = 0;
    while (true) {
      const cells = findAllCellsToClearNow();
      if (cells.length === 0) {
        break;
      }
      chain += 1;
      if (chain >= 2) {
        showChainComboPopup(chain, cells);
      }
      await playSurpriseThenClearCells(cells, chain);
    }
    lastChainCount = chain;
    updateHud();
  }

  // ---------------------------------------------------------------------------
  // 描画
  // ---------------------------------------------------------------------------

  /**
   * マス中心のピクセル座標
   */
  function cellCenterPx(row, col) {
    const x = col * CELL_W + CELL_W / 2;
    const y = row * CELL_H + CELL_H / 2;
    return { x, y };
  }

  /**
   * #RRGGBB を少し暗くした色（耳など）
   */
  function shadeHex(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * factor);
    const g = Math.round(((n >> 8) & 255) * factor);
    const b = Math.round((n & 255) * factor);
    return `rgb(${r},${g},${b})`;
  }

  /**
   * 次の組プレビュー用の簡易くま（メインキャンバスと同色）
   */
  function drawMiniBearPreview(pctx, cx, cy, R, colorIndex) {
    const mainColor = PUYO_COLORS[colorIndex];
    const earColor = shadeHex(mainColor, 0.62);
    pctx.save();
    pctx.translate(cx, cy);
    pctx.fillStyle = earColor;
    pctx.beginPath();
    pctx.arc(-R * 0.65, -R * 0.7, R * 0.28, 0, Math.PI * 2);
    pctx.arc(R * 0.65, -R * 0.7, R * 0.28, 0, Math.PI * 2);
    pctx.fill();
    pctx.fillStyle = mainColor;
    pctx.beginPath();
    pctx.arc(0, 0, R, 0, Math.PI * 2);
    pctx.fill();
    pctx.fillStyle = "rgba(255,255,255,0.2)";
    pctx.beginPath();
    pctx.ellipse(-R * 0.32, -R * 0.32, R * 0.2, R * 0.12, -0.4, 0, Math.PI * 2);
    pctx.fill();
    pctx.fillStyle = "rgba(255, 235, 220, 0.9)";
    pctx.beginPath();
    pctx.ellipse(0, R * 0.15, R * 0.4, R * 0.3, 0, 0, Math.PI * 2);
    pctx.fill();
    pctx.fillStyle = "#1a120c";
    pctx.beginPath();
    pctx.ellipse(0, R * 0.05, R * 0.08, R * 0.06, 0, 0, Math.PI * 2);
    pctx.fill();
    const line = "#4a3540";
    pctx.fillStyle = line;
    pctx.beginPath();
    pctx.arc(-R * 0.22, -R * 0.08, R * 0.055, 0, Math.PI * 2);
    pctx.arc(R * 0.22, -R * 0.08, R * 0.055, 0, Math.PI * 2);
    pctx.fill();
    pctx.strokeStyle = line;
    pctx.lineWidth = Math.max(1, R * 0.045);
    pctx.lineCap = "round";
    pctx.beginPath();
    pctx.arc(0, R * 0.06, R * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
    pctx.stroke();
    pctx.restore();
  }

  /**
   * 右上プレビューキャンバスに「次の 2 匹」を縦並びで描く（上＝colorB、下＝colorA）
   */
  function renderNextPreview() {
    const el = document.getElementById("nextPreviewCanvas");
    if (!el) {
      return;
    }
    const pctx = el.getContext("2d");
    if (!pctx) {
      return;
    }
    const w = el.width;
    const h = el.height;
    pctx.clearRect(0, 0, w, h);
    if (gameOver || !nextPair) {
      return;
    }
    const R = Math.min(w, h) * 0.22;
    drawMiniBearPreview(pctx, w / 2, h * 0.27, R * 0.95, nextPair.colorB);
    drawMiniBearPreview(pctx, w / 2, h * 0.72, R * 0.95, nextPair.colorA);
  }

  /**
   * このマスが「消去直前の驚き＋点滅」対象か
   */
  function isSurprisedCell(row, col) {
    if (!clearAnimSnapshots) {
      return false;
    }
    return clearAnimSnapshots.some((s) => s.row === row && s.col === col);
  }

  /**
   * 消去アニメ中の表示（1=表示、0=点滅で消えている）
   * 驚き → 1回目オフ→オン → 2回目オフ→オン のあとクリア
   */
  function getClearAnimVisibility(elapsed) {
    if (elapsed < PHASE_SURPRISE_MS) {
      return 1;
    }
    let t = elapsed - PHASE_SURPRISE_MS;
    if (t < BLINK_OFF_MS) {
      return 0;
    }
    t -= BLINK_OFF_MS;
    if (t < BLINK_ON_MS) {
      return 1;
    }
    t -= BLINK_ON_MS;
    if (t < BLINK_OFF_MS) {
      return 0;
    }
    t -= BLINK_OFF_MS;
    if (t < BLINK_ON_MS) {
      return 1;
    }
    return 1;
  }

  /**
   * 待機中の「目を閉じた」二重線まぶた風
   */
  function drawIdleClosedEyes(R) {
    const line = "#4a3540";
    ctx.strokeStyle = line;
    ctx.lineCap = "round";
    ctx.lineWidth = R * 0.075;
    ctx.beginPath();
    ctx.moveTo(-R * 0.38, -R * 0.09);
    ctx.quadraticCurveTo(-R * 0.28, -R * 0.16, -R * 0.18, -R * 0.09);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R * 0.18, -R * 0.09);
    ctx.quadraticCurveTo(R * 0.28, -R * 0.16, R * 0.38, -R * 0.09);
    ctx.stroke();
  }

  /**
   * 色ごとの口だけ（瞬き中は目を描かず口だけ）
   */
  function drawNormalMouthOnly(colorIndex, R) {
    const line = "#4a3540";
    ctx.strokeStyle = line;
    ctx.fillStyle = line;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (colorIndex === 0) {
      ctx.lineWidth = R * 0.055;
      ctx.beginPath();
      ctx.arc(0, R * 0.02, R * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else if (colorIndex === 1) {
      ctx.lineWidth = R * 0.05;
      ctx.beginPath();
      ctx.arc(0, R * 0.06, R * 0.26, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.stroke();
    } else if (colorIndex === 2) {
      ctx.lineWidth = R * 0.06;
      ctx.beginPath();
      ctx.moveTo(-R * 0.2, R * 0.18);
      ctx.lineTo(R * 0.2, R * 0.18);
      ctx.stroke();
    } else {
      ctx.lineWidth = R * 0.045;
      ctx.beginPath();
      ctx.moveTo(-R * 0.12, R * 0.2);
      ctx.quadraticCurveTo(0, R * 0.08, R * 0.12, R * 0.2);
      ctx.stroke();
    }
  }

  /**
   * 色ごとの「いつもの」目だけ（口は描かない）
   */
  function drawEyesDefaultByColor(colorIndex, R) {
    const line = "#4a3540";
    ctx.strokeStyle = line;
    ctx.fillStyle = line;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (colorIndex === 0) {
      ctx.beginPath();
      ctx.arc(-R * 0.28, -R * 0.08, R * 0.07, 0, Math.PI * 2);
      ctx.arc(R * 0.28, -R * 0.08, R * 0.07, 0, Math.PI * 2);
      ctx.fill();
    } else if (colorIndex === 1) {
      ctx.beginPath();
      ctx.arc(-R * 0.3, -R * 0.1, R * 0.09, 0, Math.PI * 2);
      ctx.arc(R * 0.3, -R * 0.1, R * 0.09, 0, Math.PI * 2);
      ctx.fill();
    } else if (colorIndex === 2) {
      ctx.lineWidth = R * 0.06;
      ctx.beginPath();
      ctx.moveTo(-R * 0.38, -R * 0.1);
      ctx.lineTo(-R * 0.18, -R * 0.1);
      ctx.moveTo(R * 0.18, -R * 0.1);
      ctx.lineTo(R * 0.38, -R * 0.1);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-R * 0.28, -R * 0.1, R * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = R * 0.06;
      ctx.beginPath();
      ctx.moveTo(R * 0.16, -R * 0.12);
      ctx.lineTo(R * 0.4, -R * 0.08);
      ctx.stroke();
    }
  }

  /** 横をチラ見する目（どの色でも同じ構図） */
  function drawPeekEyes(R) {
    const line = "#4a3540";
    ctx.fillStyle = line;
    ctx.beginPath();
    ctx.arc(-R * 0.3 - R * 0.04, -R * 0.09, R * 0.055, 0, Math.PI * 2);
    ctx.arc(R * 0.26 + R * 0.04, -R * 0.09, R * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }

  /** にこっとした弧の目 */
  function drawGrinEyes(R) {
    const line = "#4a3540";
    ctx.strokeStyle = line;
    ctx.lineWidth = R * 0.07;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-R * 0.38, -R * 0.07);
    ctx.quadraticCurveTo(-R * 0.28, -R * 0.15, -R * 0.18, -R * 0.07);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R * 0.18, -R * 0.07);
    ctx.quadraticCurveTo(R * 0.28, -R * 0.15, R * 0.38, -R * 0.07);
    ctx.stroke();
  }

  /** 小さな「お」口 */
  function drawOohMouth(R) {
    const line = "#4a3540";
    ctx.strokeStyle = line;
    ctx.lineWidth = R * 0.045;
    ctx.beginPath();
    ctx.ellipse(0, R * 0.2, R * 0.1, R * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * 色ごとの通常表情で目と口を描く（0〜3）
   * @param {boolean} eyesClosed 盤面待機中の瞬き
   * @param {string} variant 待機中の表情バリアント（happy 等）
   */
  function drawNormalFaceFeatures(colorIndex, R, eyesClosed, variant) {
    const line = "#4a3540";
    ctx.strokeStyle = line;
    ctx.fillStyle = line;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (eyesClosed) {
      drawIdleClosedEyes(R);
      drawNormalMouthOnly(colorIndex, R);
      return;
    }

    const v = variant || "";

    if (v === "happy") {
      drawEyesDefaultByColor(colorIndex, R);
      ctx.strokeStyle = line;
      ctx.lineWidth = R * 0.048;
      ctx.beginPath();
      ctx.arc(0, R * 0.02, R * 0.3, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.stroke();
      return;
    }

    if (v === "ooh") {
      drawEyesDefaultByColor(colorIndex, R);
      drawOohMouth(R);
      return;
    }

    if (v === "sleepy") {
      ctx.lineWidth = R * 0.065;
      ctx.strokeStyle = line;
      ctx.beginPath();
      ctx.moveTo(-R * 0.38, -R * 0.1);
      ctx.lineTo(-R * 0.16, -R * 0.1);
      ctx.moveTo(R * 0.16, -R * 0.1);
      ctx.lineTo(R * 0.38, -R * 0.1);
      ctx.stroke();
      drawNormalMouthOnly(colorIndex, R);
      return;
    }

    if (v === "peek") {
      drawPeekEyes(R);
      drawNormalMouthOnly(colorIndex, R);
      return;
    }

    if (v === "grin") {
      drawGrinEyes(R);
      ctx.strokeStyle = line;
      ctx.lineWidth = R * 0.05;
      ctx.beginPath();
      ctx.arc(0, R * 0.04, R * 0.27, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      return;
    }

    drawEyesDefaultByColor(colorIndex, R);
    drawNormalMouthOnly(colorIndex, R);
  }

  /**
   * 驚き顔（どの色でも同じ「うわっ」系）
   */
  function drawSurprisedFaceFeatures(R) {
    const line = "#2a1810";
    ctx.strokeStyle = line;
    ctx.fillStyle = "#fff";
    ctx.lineCap = "round";
    const eyeR = R * 0.2;
    const elapsed = performance.now() - clearAnimStartTime;
    const t =
      clearAnimSnapshots != null
        ? Math.min(1, elapsed / PHASE_SURPRISE_MS)
        : 0;
    const bounce = 1 + 0.06 * Math.sin(t * Math.PI);

    ctx.save();
    ctx.scale(bounce, bounce);
    // 白目の大きな目
    ctx.beginPath();
    ctx.arc(-R * 0.32, -R * 0.12, eyeR, 0, Math.PI * 2);
    ctx.arc(R * 0.32, -R * 0.12, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = line;
    ctx.beginPath();
    ctx.arc(-R * 0.32, -R * 0.1, R * 0.09, 0, Math.PI * 2);
    ctx.arc(R * 0.32, -R * 0.1, R * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // 上がった眉
    ctx.strokeStyle = line;
    ctx.lineWidth = R * 0.055;
    ctx.beginPath();
    ctx.moveTo(-R * 0.52, -R * 0.38);
    ctx.lineTo(-R * 0.2, -R * 0.48);
    ctx.moveTo(R * 0.2, -R * 0.48);
    ctx.lineTo(R * 0.52, -R * 0.38);
    ctx.stroke();
    // 口を O に
    ctx.lineWidth = R * 0.045;
    ctx.beginPath();
    ctx.arc(0, R * 0.24, R * 0.14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 1 マス分の「くまの顔」を描く
   * @param {"normal"|"surprised"} expression
   * @param {boolean} [idleBlinkEyesClosed] 盤面待機中の瞬き（落下中は false）
   * @param {string} [idleVariant] 待機中の表情バリアント（"" で色デフォルトのみ）
   */
  function drawBearFaceAt(
    row,
    col,
    colorIndex,
    alpha,
    expression,
    idleBlinkEyesClosed,
    idleVariant
  ) {
    const { x, y } = cellCenterPx(row, col);
    const R = Math.min(CELL_W, CELL_H) * 0.36;
    const mainColor = PUYO_COLORS[colorIndex];
    const earColor = shadeHex(mainColor, 0.62);
    const snoutLight = "rgba(255, 235, 220, 0.92)";

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);

    // 耳（後ろから顔の下層）
    ctx.fillStyle = earColor;
    ctx.beginPath();
    ctx.arc(-R * 0.68, -R * 0.72, R * 0.3, 0, Math.PI * 2);
    ctx.arc(R * 0.68, -R * 0.72, R * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(248, 200, 200, 0.85)";
    ctx.beginPath();
    ctx.arc(-R * 0.68, -R * 0.72, R * 0.14, 0, Math.PI * 2);
    ctx.arc(R * 0.68, -R * 0.72, R * 0.14, 0, Math.PI * 2);
    ctx.fill();

    // 顔の丸
    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();

    // 顔のハイライト
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.ellipse(-R * 0.35, -R * 0.35, R * 0.22, R * 0.14, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // 鼻周り（薄い楕円）
    ctx.fillStyle = snoutLight;
    ctx.beginPath();
    ctx.ellipse(0, R * 0.16, R * 0.44, R * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();

    // 鼻の黒い丸
    ctx.fillStyle = "#1a120c";
    ctx.beginPath();
    ctx.ellipse(0, R * 0.06, R * 0.09, R * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    if (expression === "surprised") {
      drawSurprisedFaceFeatures(R);
    } else {
      drawNormalFaceFeatures(
        colorIndex,
        R,
        !!idleBlinkEyesClosed,
        idleVariant || ""
      );
    }

    ctx.restore();
  }

  /**
   * デッドライン（最上段）と出現に空きが要る段の背景
   */
  function drawDeadlineZoneUnderlay() {
    const y0 = DEADLINE_ROW * CELL_H;
    ctx.fillStyle = "rgba(255, 75, 95, 0.26)";
    ctx.fillRect(0, y0, canvas.width, CELL_H);
    if (SPAWN_CLEAR_ROW_COUNT > 1) {
      ctx.fillStyle = "rgba(255, 120, 135, 0.1)";
      ctx.fillRect(0, y0 + CELL_H, canvas.width, CELL_H);
    }
  }

  /**
   * row0 の下境界に赤の破線＋ラベル（くまの上に重ねて読みやすくする）
   */
  function drawDeadlineOverlay() {
    const y = (DEADLINE_ROW + 1) * CELL_H;
    const lineW = Math.max(2.5, Math.min(CELL_H * 0.06, 5));
    ctx.save();
    ctx.strokeStyle = "rgba(220, 45, 65, 0.95)";
    ctx.lineWidth = lineW;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const fontPx = Math.max(11, Math.round(CELL_H * 0.26));
    ctx.font = `800 ${fontPx}px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fillStyle = "rgba(185, 30, 50, 0.98)";
    const label = "デッドライン";
    /* 左上の小型 HUD と被りにくいよう、やや右寄せ */
    const tx = Math.min(canvas.width * 0.56, canvas.width / 2 + CELL_W * 0.35);
    const ty = DEADLINE_ROW * CELL_H + 3;
    ctx.strokeText(label, tx, ty);
    ctx.fillText(label, tx, ty);
    ctx.restore();
  }

  /**
   * 盤面と落下中のぷよを描画
   */
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawDeadlineZoneUnderlay();

    // 薄いグリッド（位置が分かりやすいように）
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL_W, 0);
      ctx.lineTo(c * CELL_W, canvas.height);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL_H);
      ctx.lineTo(canvas.width, r * CELL_H);
      ctx.stroke();
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = board[r][c];
        if (v !== null) {
          const expr = isSurprisedCell(r, c) ? "surprised" : "normal";
          let alpha = 1;
          if (expr === "surprised") {
            alpha = getClearAnimVisibility(
              performance.now() - clearAnimStartTime
            );
          }
          if (alpha > 0) {
            const blink =
              expr === "normal" && isIdleBearEyesClosed(r, c);
            const faceVar =
              expr === "normal" ? getIdleFaceVariant(r, c) : "";
            drawBearFaceAt(r, c, v, alpha, expr, blink, faceVar);
          }
        }
      }
    }

    if (activePiece) {
      const ap = activePiece;
      const [c0, c1] = getActivePairCells(ap.row, ap.col, ap.rot);
      drawBearFaceAt(c0.row, c0.col, ap.colorA, 1, "normal", false, "");
      drawBearFaceAt(c1.row, c1.col, ap.colorB, 1, "normal", false, "");
    }

    drawDeadlineOverlay();
    renderNextPreview();
  }

  // ---------------------------------------------------------------------------
  // HUD・ゲームオーバー
  // ---------------------------------------------------------------------------

  function updateHud() {
    const s = String(score);
    const c = String(lastChainCount);
    if (scoreDisplay) scoreDisplay.textContent = s;
    if (chainDisplay) chainDisplay.textContent = c;
  }

  function triggerGameOver() {
    const finalScore = score;
    gameOver = true;
    activePiece = null;
    if (gameOverOverlay) {
      gameOverOverlay.classList.remove("hidden");
    } else if (typeof showAuthMessage === "function") {
      showAuthMessage("ゲームオーバー");
    } else {
      window.alert("ゲームオーバー");
    }
    // ログイン済みなら Apps Script へスコア送信 → ランキング更新（auth.js）
    if (typeof window.submitScoreAfterGameOver === "function") {
      window.submitScoreAfterGameOver(finalScore);
    }
  }

  function resetGame() {
    board = createEmptyBoard();
    activePiece = null;
    nextPair = { colorA: randomColor(), colorB: randomColor() };
    clearAnimSnapshots = null;
    score = 0;
    lastChainCount = 0;
    gameOver = false;
    dropAccumulator = 0;
    gameSpeedEpochStart = performance.now();
    const fxLayer = document.getElementById("chainFxLayer");
    if (fxLayer) {
      fxLayer.innerHTML = "";
    }
    if (gameOverOverlay) gameOverOverlay.classList.add("hidden");
    updateHud();
    trySpawnNextPiece();
  }

  // ---------------------------------------------------------------------------
  // メインループ（落下タイミング + 描画）
  // ---------------------------------------------------------------------------

  function gameFrame(now) {
    const dt = now - lastFrameTime;
    lastFrameTime = now;

    if (!gameOver && activePiece) {
      const interval = getGravityDropIntervalMs();
      dropAccumulator += dt;
      while (dropAccumulator >= interval) {
        dropAccumulator -= interval;
        const moved = tryMoveDown();
        if (!moved) {
          dropAccumulator = 0;
          lockActivePiece();
          break;
        }
      }
    }

    render();
    requestAnimationFrame(gameFrame);
  }

  // ---------------------------------------------------------------------------
  // キーボード：左右はリピート付き、下は「押しっぱなしで高速落下」
  // ---------------------------------------------------------------------------

  function startLateralRepeat(direction) {
    stopLateralRepeat();
    tryMoveHorizontal(direction);
    lateralInitialTimerId = window.setTimeout(() => {
      lateralRepeatTimerId = window.setInterval(() => {
        tryMoveHorizontal(direction);
      }, 80);
    }, 170);
  }

  function stopLateralRepeat() {
    if (lateralInitialTimerId !== null) {
      window.clearTimeout(lateralInitialTimerId);
      lateralInitialTimerId = null;
    }
    if (lateralRepeatTimerId !== null) {
      window.clearInterval(lateralRepeatTimerId);
      lateralRepeatTimerId = null;
    }
  }

  window.addEventListener("keydown", (e) => {
    if (gameOver) {
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (!keys.left) {
        keys.left = true;
        startLateralRepeat(-1);
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (!keys.right) {
        keys.right = true;
        startLateralRepeat(1);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      keys.down = true;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      tryRotateClockwise();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft") {
      keys.left = false;
      stopLateralRepeat();
      // 右だけ押し続けているなら、右移動のリピートを続ける
      if (keys.right) {
        startLateralRepeat(1);
      }
    } else if (e.key === "ArrowRight") {
      keys.right = false;
      stopLateralRepeat();
      if (keys.left) {
        startLateralRepeat(-1);
      }
    } else if (e.key === "ArrowDown") {
      keys.down = false;
    }
  });

  // ---------------------------------------------------------------------------
  // スマホ・タブレット：画面の ←↓→ ボタン（pointer イベント）
  // ---------------------------------------------------------------------------

  function bindTouchDirectionButton(btn) {
    const dir = btn.getAttribute("data-touch-dir");
    if (!dir) {
      return;
    }

    const onDown = (e) => {
      e.preventDefault();
      if (gameOver) {
        return;
      }
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      btn.classList.add("is-pressed");
      if (dir === "left" && !keys.left) {
        keys.left = true;
        startLateralRepeat(-1);
      } else if (dir === "right" && !keys.right) {
        keys.right = true;
        startLateralRepeat(1);
      } else if (dir === "down") {
        keys.down = true;
      }
    };

    const onUp = (e) => {
      e.preventDefault();
      btn.classList.remove("is-pressed");
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (dir === "left") {
        keys.left = false;
        stopLateralRepeat();
        if (keys.right) {
          startLateralRepeat(1);
        }
      } else if (dir === "right") {
        keys.right = false;
        stopLateralRepeat();
        if (keys.left) {
          startLateralRepeat(-1);
        }
      } else if (dir === "down") {
        keys.down = false;
      }
    };

    btn.addEventListener("pointerdown", onDown, { passive: false });
    btn.addEventListener("pointerup", onUp);
    btn.addEventListener("pointercancel", onUp);
    if (dir === "left" || dir === "right") {
      btn.addEventListener("pointerleave", onUp);
    }
  }

  document.querySelectorAll("[data-touch-dir]").forEach(bindTouchDirectionButton);

  document.querySelectorAll("[data-touch-action='rotate']").forEach((btn) => {
    const onDown = (e) => {
      e.preventDefault();
      if (gameOver) {
        return;
      }
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      btn.classList.add("is-pressed");
      tryRotateClockwise();
    };
    const onUp = (e) => {
      e.preventDefault();
      btn.classList.remove("is-pressed");
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    btn.addEventListener("pointerdown", onDown, { passive: false });
    btn.addEventListener("pointerup", onUp);
    btn.addEventListener("pointercancel", onUp);
    btn.addEventListener("pointerleave", onUp);
  });

  const rotateBtn = document.getElementById("rotateBtn");
  if (rotateBtn) {
    rotateBtn.addEventListener("click", () => {
      if (!gameOver) {
        tryRotateClockwise();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 再開ボタン
  // ---------------------------------------------------------------------------

  if (restartBtn) {
    restartBtn.addEventListener("click", () => {
      resetGame();
    });
  }

  // ---------------------------------------------------------------------------
  // 起動（canvas が無い環境ではゲームループを開始しない）
  // ---------------------------------------------------------------------------

  if (canvas && ctx) {
    resetGame();
    requestAnimationFrame(gameFrame);
  }
})();
