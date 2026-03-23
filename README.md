# Font Viewer

Electron製のクロスプラットフォーム対応フォントビューアです。システムにインストールされたフォントを一覧表示し、リアルタイムでプレビューできます。

## 機能

- **フォント一覧表示** - システムフォントを自動検出・一覧表示（仮想スクロールで高速描画）
- **リアルタイムプレビュー** - 任意のテキスト・サイズでフォントをプレビュー
- **フィルター** - 日本語対応 / 等幅 / プロポーショナルでフィルタリング
- **お気に入り** - よく使うフォントをブックマーク（永続化）
- **ダークモード** - ライト/ダークテーマ切替（システム設定を自動検出）
- **文字セット表示** - 大文字・小文字・数字・記号・ひらがな・カタカナ・漢字
- **ウェイト＆スタイル** - Light / Regular / Medium / Bold / Italic / Bold Italic
- **キーボード操作** - 上下キーで移動、Cmd/Ctrl+F で検索
- **リサイズ可能サイドバー** - ドラッグで幅を調整
- **フォント名コピー** - ワンクリックでクリップボードにコピー
- **日本語ローカライズ名対応**（macOS）- 「ヒラギノ」等の日本語名で検索可能

## セットアップ

```bash
bun install
```

> プロキシ環境では `ELECTRON_GET_USE_PROXY=true bun install` を使用してください。

## ディレクトリ構成

```text
font-viewer/
├─ main.js
├─ preload.js
├─ src/
│  └─ renderer/
│     ├─ index.html
│     ├─ index.js
│     └─ styles.css
├─ scripts/
│  └─ listFonts.swift
├─ package.json
└─ Makefile
```

## 開発

```bash
bun run start
```

## ビルド（スタンドアロンアプリ）

### macOS

```bash
bun run build
```

| 出力ファイル | 内容 |
|-------------|------|
| `dist/Font Viewer-x.x.x-arm64.dmg` | DMG インストーラー |
| `dist/mac-arm64/Font Viewer.app` | アプリケーション本体 |

DMGを作成せず `.app` だけ生成する場合:

```bash
bun run build:dir
```

#### macOS インストール方法

1. `bun run build` を実行
2. `dist/Font Viewer-x.x.x-arm64.dmg` を開く
3. `Font Viewer.app` を Applications フォルダにドラッグ

> **注意**: コード署名されていないため、初回起動時に「開発元が未確認」の警告が表示されます。
> `システム設定 > プライバシーとセキュリティ` から「このまま開く」を選択してください。

### Windows

```bash
bun run build:win
```

| 出力ファイル | 内容 |
|-------------|------|
| `dist/Font Viewer Setup x.x.x.exe` | NSIS インストーラー |

#### macOS から Windows 向けにクロスビルドする場合

macOS 上で Windows 用ビルドを行うには [Wine](https://www.winehq.org/) が必要です。

```bash
brew install --cask wine-stable
bun run build:win
```

> 最も確実な方法は Windows マシン上で直接 `bun run build:win` を実行することです。

#### Windows インストール方法

1. `Font Viewer Setup x.x.x.exe` を実行
2. インストール先を選択してインストール

### Linux

```bash
bun run build:linux
```

| 出力ファイル | 内容 |
|-------------|------|
| `dist/Font Viewer-x.x.x.AppImage` | AppImage（インストール不要） |

### 全プラットフォーム一括ビルド

```bash
bun run build:all
```

> クロスビルドには各プラットフォーム向けのツールチェーンが必要です。
> CI/CD（GitHub Actions 等）の利用を推奨します。

## プラットフォーム別のフォント取得

| プラットフォーム | 方式 | 特徴 |
|----------------|------|------|
| macOS | Swift (`NSFontManager`) | 日本語ローカライズ名を含む完全なフォント一覧 |
| Windows / Linux | `font-list` パッケージ | フォールバック |

## 技術スタック

- Electron 28
- electron-builder（マルチプラットフォーム対応パッケージング）
- font-list（Windows/Linux 向けフォント取得）
- NSFontManager（macOS 向けネイティブフォント取得）
