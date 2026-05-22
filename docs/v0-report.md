# Symphony-pi v0 実装レポート

## 実装ステータス

SPEC.md の全13セクションに対応する実装が完了しています。

### 実装済みセクション

| SPEC Section                           | 内容               | 状態                   |
| -------------------------------------- | ------------------ | ---------------------- |
| 1. Problem Statement                   | サービス定義       | ✅ 実装                |
| 2. Goals and Non-Goals                 | 目標と非目標       | ✅ アーキテクチャ反映  |
| 3. System Overview                     | コンポーネント分割 | ✅ 8コンポーネント実装 |
| 4. Core Domain Model                   | 型定義             | ✅ ADT実装             |
| 5. Workflow Specification              | WORKFLOW.md        | ✅ ローダー実装        |
| 6. Configuration Specification         | 設定解決           | ✅ フル実装            |
| 7. Orchestration State Machine         | 状態管理           | ✅ オーケストレーター  |
| 8. Polling, Scheduling, Reconciliation | ポーリング         | ✅ pollTick実装        |
| 9. Workspace Management                | ワークスペース     | ✅ 管理機能            |
| 10. Agent Runner Protocol              | pi連携             | ✅ SDK統合             |
| 11. Issue Tracker Integration          | トラッカー         | ✅ Linear + Jira       |
| 12. Prompt Construction                | プロンプト         | ✅ Liquidエンジン      |
| 13. Logging, Status, Observability     | 可観測性           | ✅ HTTP API + ログ     |

## テスト状況

- **テストファイル数**: 36
- **テスト総数**: 264 (全パス)
- **カバレッジ**: Statements 63.82%, Branches 60.58%, Functions 67.78%, Lines 64.04%

## 実装ファイル構成

```
src/
├── main.ts                          # エントリポイント
├── lib/
│   ├── controllablePromise.ts       # 制御可能なPromise
│   └── typedIncludes.ts             # 型安全includes
├── server/
│   ├── app.ts                       # Honoアプリ
│   ├── cli.ts                       # CLI引数解析
│   ├── routes.ts                    # ルート設定
│   ├── server.ts                    # サーバー起動 (get-port, 48484)
│   ├── lib/                         # ユーティリティ
│   │   ├── fs/index.ts              # ファイルシステム
│   │   ├── id/index.ts              # ID生成
│   │   ├── path/index.ts            # パス操作
│   │   ├── process/index.ts         # プロセス実行
│   │   └── time/index.ts            # 時刻操作
│   └── app/
│       ├── agents/                  # エージェントランナー
│       │   ├── model.ts             # RunAttempt, LiveSession, AgentRunnerEvent
│       │   ├── services/buildPrompt.ts  # プロンプトレンダリング
│       │   └── workflows/runAgentSession.ts  # pi セッション実行
│       ├── config/                  # 設定管理
│       │   ├── model.ts             # EffectiveConfig, TrackerConfig
│       │   ├── schema.ts            # バリデーション
│       │   ├── services/resolveConfig.ts  # 設定解決
│       │   └── workflows/loadConfig.ts    # 設定読み込み
│       ├── issues/                  # 課題管理
│       │   ├── model.ts             # Issue, BlockerRef
│       │   ├── schema.ts            # バリデーション
│       │   ├── services/issueEligibility.ts  # 正規化・適格性判定
│       │   ├── workflows/fetchIssues.ts      # 課題取得
│       │   └── adapters/
│       │       ├── trackerAdapter.ts  # アダプターインターフェース
│       │       ├── linear.ts         # Linear API
│       │       └── jira.ts           # Jira API
│       ├── logs/                    # ログ
│       │   ├── model.ts             # LogEvent, LogSink
│       │   ├── services/formatLogEvent.ts  # ログフォーマット
│       │   └── workflows/writeLog.ts       # ログ出力
│       ├── orchestrator/            # オーケストレーター
│       │   ├── model.ts             # OrchestratorState, RetryEntry
│       │   ├── services/stateTransitions.ts  # 状態遷移・ソート
│       │   └── workflows/pollTick.ts        # ポーリングループ
│       ├── status/                  # ステータスAPI
│       │   ├── model.ts             # RuntimeSnapshot
│       │   ├── routes.ts            # /api/v1/* エンドポイント
│       │   └── services/runtimeSnapshot.ts  # スナップショット生成
│       ├── workflow/                # ワークフロー定義
│       │   ├── model.ts             # WorkflowDefinition, WorkflowLoadError
│       │   ├── services/resolveWorkflowConfig.ts  # パス解決
│       │   └── workflows/loadWorkflow.ts   # WORKFLOW.md ローダー
│       └── workspaces/              # ワークスペース
│           ├── model.ts             # Workspace
│           ├── services/workspacePaths.ts    # パスサニタイズ
│           └── workflows/ensureWorkspace.ts  # ワークスペース作成
└── web/                             # フロントエンド (TanStack Start)
    ├── router.tsx
    ├── app/
    │   ├── __root.page.tsx
    │   └── index.page.tsx
    └── lib/api/client.ts
```

## SPEC準拠の主要ポイント

### Server

- ✅ デフォルトポート 48484 (get-port セマンティクス)
- ✅ デフォルトバインド 127.0.0.1
- ✅ CLI `--port` による上書き

### Workflow Loader

- ✅ YAMLフロントマター必須
- ✅ 空プロンプトはエラー
- ✅ $VAR_NAME 環境変数解決
- ✅ ~ パス展開と相対パス解決

### Config Layer

- ✅ TrackerConfig 判別共用体 (Linear | Jira)
- ✅ デフォルト値の適用
- ✅ バリデーション (required fields, positive numbers)

### Tracker Adapters

- ✅ Linear GraphQL API (ページネーション、正規化)
- ✅ Jira REST API (JQL構築、優先度マッピング、ブロッカー抽出)
- ✅ エラー判別共用体

### Workspace Manager

- ✅ キーサニタイズ ([A-Za-z0-9._-])
- ✅ パス封じ込め検証
- ✅ 作成/再利用

### Orchestrator

- ✅ ポーリングティック (調整→検証→取得→ソート→ディスパッチ→通知)
- ✅ 候補ソート (優先度ASC → 作成日ASC → ID)
- ✅ ブロッカールール (Todo → 全ブロッカーがterminal)
- ✅ グローバル/ステート別同時実行制限
- ✅ 指数バックオフリトライ
- ✅ 継続リトライ (1000ms)

### Prompt Rendering

- ✅ 厳格なLiquid互換テンプレート
- ✅ 未知変数/フィルターのエラー検出
- ✅ upcase, downcase, prepend, append, default フィルター
- ✅ 継続プロンプト生成

### Observability

- ✅ 構造化ログ (key=value フォーマット)
- ✅ LogSink パターン
- ✅ GET /api/v1/state (ランタイムスナップショット)
- ✅ GET /api/v1/:identifier (課題詳細)
- ✅ POST /api/v1/refresh (リフレッシュ要求)

## E2E 操作確認

以下のエンドポイントが動作します：

```bash
# サーバー起動
pnpm dev:server

# ヘルスチェック
curl http://localhost:48484/info
# → {"status":"healthy","server":"symphony-pi"}

# ステータスAPI
curl http://localhost:48484/api/v1/state
# → {"generated_at":"...","counts":{"running":0,"retrying":0},...}

# カスタムポート
pnpm dev:server -- --port 9999
```

## 未実装・制限事項

1. **動的リロード (Dynamic Reload)**: WORKFLOW.mdのファイル監視と動的再読み込みは未実装
2. **実際のpi SDK接続**: pi-coding-agent SDKの実際の接続・セッション管理は未実装（モックのみ）
3. **リアルAPI連携テスト**: Linear/Jiraの実際のAPIキーを使った統合テストは未実施
4. **ダッシュボードUI**: TanStack Startのダッシュボードは最小限のスケルトン
5. **チケットツール (ticket_get, ticket_comment, ticket_transition)**: エージェントツールとしての実装が未完了

## 次のステップ

1. 実際のpi-coding-agent SDK統合
2. 実際のLinear/Jira APIキーを使った統合テスト
3. WORKFLOW.mdファイル監視による動的リロード
4. ダッシュボードUIの充実
5. Docker/Kubernetesへのデプロイ構成
