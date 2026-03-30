# くまぷよ（bear-puzzle-game）

ブラウザで遊べる静的サイトです。`index.html` をルートに置けばそのまま公開できます。

## ローカルで確認（http が必要な機能あり）

```bash
npm start
```

ブラウザで `http://localhost:3000` を開いてください（`file://` だとランキング API が動かないことがあります）。

## 公開 URL を発行する（無料の例）

どれか **1 つ**で十分です。公開後に表示される URL を共有すれば、スマホ・PC から同じアドレスで遊べます。

### A. Netlify Drop（最も簡単）

1. [https://app.netlify.com/drop](https://app.netlify.com/drop) を開く  
2. このプロジェクトのフォルダ（`index.html` があるフォルダ）をドラッグ＆ドロップ  
3. 数秒で `https://xxxx.netlify.app` のような URL が発行される  

### B. Vercel

1. [https://vercel.com](https://vercel.com) でアカウント作成  
2. 「Add New」→「Project」→ GitHub 等にこのリポジトリを接続、または CLI で `vercel`  
3. Framework は「Other」、出力ディレクトリはプロジェクトルート（ビルド不要）  

### C. GitHub Pages

1. GitHub にリポジトリを作成してファイルを push  
2. リポジトリの **Settings → Pages** で Source を **Deploy from a branch** にし、`main` の `/ (root)` を選択  
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` が有効になります  

**注意:** リポジトリ名付きの URL（`/bear-puzzle-game/` など）で開く場合、CSS/JS の相対パスはそのままで動きます。サブパス以外の設定は不要です。

### D. Cloudflare Pages

1. [https://pages.cloudflare.com](https://pages.cloudflare.com) でプロジェクト作成  
2. Git 連携またはアップロードで、このフォルダを静的サイトとして公開  

### Supabase（サパベース）で公開できる？

**結論:** このゲームのような **静的サイト（HTML/CSS/JS）を Netlify のように「ドロップして URL が出る」用途には向きません。

- **Supabase** はもっぱら **PostgreSQL・認証・ストレージ・Edge Functions** などのバックエンド向けサービスです。
- 公式もフロントのホスティングは **Vercel / Netlify** などとの併用が前提に近いです。
- 理論上は **Storage の公開バケット** に `index.html` などを置いて URL を出すこともできますが、ルーティングや更新の手間が増え、**このプロジェクトの公開方法としてはおすすめしません**。

ランキングやユーザーを **Supabase に載せ替える**（DB + API）なら Supabase は有効ですが、その場合でも **画面そのものの公開** は上記 A〜D のどれかに載せるのが簡単です。

---

ランキング・ログインは Google Apps Script の URL（`api.js` の `API_BASE_URL`）向けです。GAS のデプロイで「全員」アクセス可能にしておいてください。
