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

### C. GitHub Pages（このフォルダからデプロイ）

1. [GitHub](https://github.com/new) で **New repository** を開き、名前（例: `bear-puzzle-game`）を付けて **Create repository**（README は追加しなくてよい）。  
2. このフォルダで初回だけ Git の名前・メールを設定していない場合は、次のどちらかを実行する。  
   - 全体設定: `git config --global user.name "表示名"` と `git config --global user.email "GitHubに登録したメール"`  
   - このリポジトリだけ: 同じコマンドに `--global` を付けず、フォルダ内で実行  
3. リモートを追加して push する（`<ユーザー名>` と `<リポジトリ名>` は自分のものに置き換え）。

   ```bash
   git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
   git push -u origin main
   ```

4. GitHub のリポジトリで **Settings → Pages** を開き、**Build and deployment** の Source を **Deploy from a branch** にし、Branch は **`main`**、フォルダは **`/ (root)`** を選んで Save。  
5. 1〜3 分後に **`https://<ユーザー名>.github.io/<リポジトリ名>/`** で公開される（初回は GitHub から表示される URL を確認）。

**注意:** プロジェクトサイト（`/リポジトリ名/` 付き）でも、このプロジェクトは相対パスの CSS/JS なので追加設定は不要です。

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
