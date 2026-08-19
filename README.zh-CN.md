# Caisson

[English](README.md) | 简体中文

> 一个非官方的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Windows 桌面启动器，带系统托盘。

> [!IMPORTANT]
> Caisson 是独立的社区项目，并非 DeepSeek 官方产品。

## 项目简介

Caisson 把 DeepSeek Harness 的 Web 界面装进原生 Electron 窗口，并负责管理背后的本地 `dsh web` 服务。启动时会先探测 `http://127.0.0.1:3080`：如果那里已经有服务在跑，就直接连接复用；否则用安装包内置的 Node.js 启动内置的 DSH 运行时——用户机器上不需要装 Node.js。

预构建的 Windows 安装包完全自包含（Electron 外壳 + 便携版 Node.js + DSH 生产依赖闭包 + 已构建的前端）。

| 你想做什么？ | 需要什么 |
| --- | --- |
| **使用 Caisson** | 只需从 [Releases](https://github.com/adverturer/Caisson/releases) 下载安装包——安装后双击即用。不需要 Node.js、pnpm，也不需要 deepseek-harness。 |
| **从源码重新打包安装程序** | 一份 deepseek-harness 工作区 + Node.js 24 + pnpm 11，见[构建独立安装包](#构建独立安装包)。该章节仅面向开发者。 |

## 功能特性

- 原生 Electron `BrowserWindow` 承载 DSH Web 界面
- 已有 `dsh web` 在运行时直接连接，不重复起服务
- 没有服务时自动启动内置的 `dsh web`
- Windows 系统托盘菜单：打开主界面 · 重启服务 · 开机自启 · 退出
- 关闭即最小化到托盘，而不是退出程序
- 单实例锁——第二次启动只会聚焦已有窗口
- 退出时清理整个子进程树
- 外部链接用系统默认浏览器打开
- 服务只监听回环地址（`127.0.0.1`），不向局域网暴露

## 下载

从 [Releases](https://github.com/adverturer/Caisson/releases) 下载最新安装包：

```
Caisson Setup <版本号>.exe
```

系统要求：Windows 10/11 x64。不需要安装 Node.js、pnpm 或 deepseek-harness 源码——运行所需的一切都在安装包里。

> [!NOTE]
> 预览版未做代码签名，Windows SmartScreen 可能提示"未知发布者"。如果文件确实来自本仓库的 Releases，选 **更多信息 → 仍要运行** 即可。面向更广泛分发时会配置签名证书。

### 首次使用

1. 安装并启动 Caisson。
2. 本地 DSH web 服务自动启动，主窗口随后自动打开。
3. 在 DSH 设置里配置你自己的模型服务商和 API Key——凭据**不会**随安装包分发。
4. 关闭窗口后应用留在托盘；要彻底退出请用托盘菜单的 **退出**。

## 工作原理

```
启动
  └─ 探测 http://127.0.0.1:3080
       ├─ 服务已运行 → 直接连接（不起子进程）
       └─ 服务未运行 → 用内置 node.exe 启动内置 dsh web
                         └─ 服务就绪后窗口加载页面
```

安装后的关键资源布局：

```
resources/
├── node/node.exe                              # 便携版 Node.js
├── runtime/node_modules/@deepseek-ai/dsh/...  # DSH 运行时闭包
└── tray-icon.png
```

## 从源码运行

前置条件：Node.js 24.x、pnpm 11.x，以及一个正在 3080 端口运行的 `dsh web` 或一份 deepseek-harness 源码。

```powershell
pnpm install
pnpm run build
pnpm start                          # 连接模式：复用已有的 127.0.0.1:3080

# 拉起模式：让启动器从一份 deepseek-harness 源码启动服务
$env:DSH_REPO_ROOT = "D:\path\to\deepseek-harness"
pnpm start
```

## 构建独立安装包

> [!NOTE]
> **仅面向开发者。** 如果你只是想*使用* Caisson，跳过本节——从 [Releases](https://github.com/adverturer/Caisson/releases) 下载预构建安装包即可，无需其他任何东西。

本仓库只保存启动器源码——不含约 250 MB 的 DSH 运行时闭包。内置运行时是通过 `npm install @deepseek-ai/dsh@0.1.0-rc.6` 安装的 rc.6 闭包，并在 `dsh-client-ui-settings-models` 上叠加了推理强度 + 取消全部功能。

### 前置条件

1. 便携版 Node.js：放在 `dist-runtime/node/node.exe`（从 [npmmirror](https://npmmirror.com/mirrors/node/v24.18.0/node-v24.18.0-win-x64.zip) 下载解压到 `dist-runtime/node/`）。
2. rc.6 运行时闭包：在独立目录 `npm install @deepseek-ai/dsh`，然后将 deepseek-harness 源码构建的 `packages/client/ui-settings-models/lib/client.js` 覆盖到 `node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js`（应用功能补丁）。
3. Electron 33：安装在 `node_modules/electron/dist`（`electronDist` 配置指向此处）。

### 打包

```powershell
npm install
npx tsc -p tsconfig.json
npx electron-builder --win
```

产物：`release-0.1.1/Caisson Setup 0.1.1.exe`

`afterPack` 钩子（`scripts/after-pack.cjs`）把 rc.6 闭包从 npm 安装目录复制进 `resources/runtime/`，恢复 electron-builder 文件过滤器丢掉的根 `node_modules`。

打包前通过 `DSH_DESKTOP_RUNTIME_SOURCE` 指定准备好的 rc.6 npm 闭包；未设置时，`afterPack` 使用 `dist-runtime/final`。

## 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `DSH_DESKTOP_PORT` | `3080` | 启动器管理并打开的 Web 端口 |
| `DSH_REPO_ROOT` | 自动推导 | deepseek-harness 源码根目录（源码模式） |
| `DSH_NODE` | `NODE` / `node` | 源码模式下启动 DSH CLI 用的 Node 可执行文件 |
| `DSH_DESKTOP_RUNTIME_SOURCE` | `dist-runtime/final` | 打包时复制进应用的 rc.6 npm 闭包 |
| `DSH_DESKTOP_NODE_VERSION` | `v24.18.0` | 打包时内置的 Node.js 版本 |
| `DSH_DESKTOP_NODE_MIRROR` | npmmirror | 自定义 Node.js 下载镜像 |

## 仓库结构

```
├── src/main.ts                  # Electron 主进程
├── resources/                   # 应用图标 + 托盘图标
├── runtime-deploy/package.json  # 内置 DSH 运行时闭包的依赖清单
├── scripts/
│   ├── prepare-runtime.ts       # 部署闭包 + 暂存便携版 Node.js
│   ├── after-pack.cjs           # 把完整闭包补回打包产物
│   ├── find-missing-peers.mjs   # 审计闭包缺失的 peer 依赖
│   └── gen-icon.ps1             # 重新生成图标资源
├── package.json                 # electron-builder 配置
└── tsconfig.json
```

## 计划

- [ ] Windows 代码签名
- [ ] 自动更新
- [ ] 外壳内的服务日志 / 错误页
- [ ] 端口冲突恢复界面
- [ ] Windows arm64 构建
- [ ] CI 打包 + 自动发布 GitHub Releases

## 安全与隐私

- 托管的 Web 服务只绑定 `127.0.0.1`——有意拒绝 `0.0.0.0`。
- 模型 API Key 保存在每个用户自己的本地 DSH 配置里，安装包内不含任何凭据。
- 请只从本仓库的 Releases 页面下载安装包。

## 上游与许可

Caisson 构建在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 之上；上游项目及其软件包保留各自的版权和许可证。

Caisson 启动器源码以 [MIT License](LICENSE) 发布。
