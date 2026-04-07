# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

King of Time（勤怠管理システム）のスケジュール登録画面に「一括スケジュール登録」機能を追加するChrome拡張。SES企業向け。コピー元の特定日のスケジュールパターンを、対象月の全平日に一括適用する。

## 開発方法

1. `chrome://extensions` でデベロッパーモードON → このディレクトリを読み込み
2. コード変更後: 拡張🔄再読み込み → KOTページもリロード
3. 対象: `https://s2.ta.kingoftime.jp/admin/*` のスケジュール登録画面

## アーキテクチャ

読み込み順序（manifest.jsonで定義、順序に依存関係あり）:
```
lib/kot-parser.js   → KotParser（DOM解析）
lib/schedule-logic.js → ScheduleLogic（ビジネスロジック）
lib/kot-api.js      → KotApi（実行・保存）
content.js          → メイン（UI注入・オーケストレーション）
```

ESモジュール不使用。グローバルオブジェクトで連携。外部依存なし。

## Gotchas（ハマりポイント）

<important if="KOTのページ操作やスケジュール登録の実装を変更する場合">
### Content Script の Isolated World 問題
Content scriptはページのJS関数（`set_schedule`等）を直接呼べない。
- ❌ `set_schedule(id)` → undefined（isolated world）
- ❌ `<script>` タグ注入 → CSPが `unsafe-inline` を禁止してブロック
- ✅ `.click()` でDOMイベント発火 → onclick属性のKOT関数がページ環境で実行される

### param_ JSON は HTML に存在しない
`param_{empId}_{date}` フィールドはフォームPOST時に必要だが、ページのHTMLには最初から存在しない。KOTのJS関数 `set_schedule()` がチェックボックスクリック時に動的生成する。
- ❌ fetchしたHTMLからparam_を読み取る → 存在しない
- ❌ 自前でparam JSONを組み立てる → 構造が複雑で不完全になる
- ✅ `.click()` で `set_schedule()` を発火させ、KOT側にparam JSONを生成させる

### 保存後の月遷移
保存ボタン押下後、表示月と異なる月（例: 5月）にリダイレクトされる。登録自体は成功している。原因未特定。

### スケジュール表のテーブルインデックス
KOTのページには複数の `<table>` があり、スケジュール表は `document.querySelectorAll('table')[2]`。インデックス0はナビメニュー。KOTのUI更新でインデックスが変わる可能性あり。

### CSRFトークンの動的キー名
CSRFトークンのフィールド名（例: `c4Noqmtd`）はセッションごとに変わる。既知フィールド名を除外し、出現回数が最も多いhiddenフィールドをCSRFとして検出する方式。
</important>

## KOT画面のDOM構造

- **日付ヘッダー**: `th` 内の `input[id^="date_check_YYYYMMDD"]`
- **土日祝判定**: `th` のclass名に `saturday` / `sunday` / `holiday` を含むか
- **社員スケジュール**: hidden input `original_schedulepatternid_{empId}_{YYYYMMDD}`
- **保存ボタン**: `<button onclick="KOT_GLOBAL.KOT_LIB.onClickActionButton('action_02_X')">`
- **パターンセレクト**: `select[name="schedule_pattern_id"]`

## 残課題

- ~~全社員（複数パターン）でのテスト~~ → 解決済み（チェックのみ方式に変更、7パターンでも1回保存で完了）
- ~~保存後の月遷移問題の対応~~ → 解決済み（コピー元fetch後にコピー先月を再fetchしてセッションリセット）
- ~~スキップ/上書きモードの動作確認~~ → 確認済み、問題なし
- ~~UIの仕上げ~~ → 完了（ボタンをKOT既存UIの表示ボタン横に配置、スタイル統一）

## 実装プラン

`~/.claude/plans/graceful-enchanting-squid.md`
