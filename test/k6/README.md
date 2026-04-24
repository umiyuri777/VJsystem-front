## k6 負荷検証（30体のBotが1秒に1回リクエスト）

### 前提
- `k6` がインストール済み（未導入なら各OSの手順で導入）
- `test/k6/.env` に送信先などを設定（`run.sh` が読み込みます）

### 実行例
デフォルトは `VUS=30`, `DURATION=1m` です。

```bash
./test/k6/run.sh test/k6/audience-bot.js
```

送信先や挙動を変えたい場合は `test/k6/.env` を編集するか、実行時の環境変数で上書きできます。

```bash
GAS_ENDPOINT="https://script.google.com/macros/s/xxxxx/exec" \
VUS=30 \
DURATION=5m \
TEAM=random \
COUNT=3 \
./test/k6/run.sh test/k6/audience-bot.js
```

### 環境変数
- **`GAS_ENDPOINT`**: 送信先のGAS `exec` URL（未指定ならリポジトリ既定値）
- **`VUS`**: Bot数（既定: 30）
- **`DURATION`**: 実行時間（既定: `1m`）
- **`TEAM`**: `red` / `white` / `random`（既定: `random`）
- **`COUNT`**: 送信する `count`（未指定なら 1〜5 をランダム）
- **`TIMEOUT`**: HTTPタイムアウト（既定: `10s`）

### run.sh について
- `test/k6/run.sh` は `K6_ENV_FILE`（既定: `test/k6/.env`）を `source` してから `k6 run` を実行します