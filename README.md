# SSH-AT

SSH-AT 是一个基于 **Electron + React + TypeScript** 构建的桌面端 SSH 配置管理工具，用于更方便地管理本机 SSH Host、SSH Key、配置文件与备份。

> 当前版本：`0.1.0`

## 功能特性

- **SSH Host 管理**
  - 查看、搜索、新增、编辑、删除 SSH Host
  - 支持常用 SSH 配置项，例如 `HostName`、`User`、`Port`、`IdentityFile`、`ProxyJump`、`ProxyCommand` 等
  - 支持 Jump Host、SOCKS5、自定义代理命令

- **SSH 配置编辑器**
  - 直接编辑 SSH config 文本
  - 保存前自动解析配置
  - 支持全局配置项与 Host 配置项

- **SSH Key 管理**
  - 扫描本机 SSH 私钥
  - 查看密钥类型、指纹、加密状态等信息
  - 生成新的 SSH Key
  - 复制公钥内容到剪贴板
  - 删除私钥及对应公钥

- **配置备份与恢复**
  - 修改 SSH 配置前自动备份
  - 查看备份列表
  - 恢复历史备份
  - 删除旧备份
  - 可配置最大备份数量

- **应用设置**
  - 深色/浅色/跟随系统主题
  - 中英文界面切换
  - 自动备份开关
  - 删除确认开关

- **跨平台桌面应用**
  - 支持 Windows、macOS、Linux 打包
  - Windows 使用 NSIS 安装包
  - macOS 使用 DMG
  - Linux 支持 AppImage 与 deb

## 项目结构

```text
ssh-at-electron/
├── assets/                     # 应用图标等静态资源
├── src/
│   ├── main/                   # Electron 主进程
│   │   ├── index.ts            # 主进程入口、窗口、托盘、IPC 注册
│   │   └── services/           # SSH 配置、密钥、备份、设置等服务
│   ├── preload/                # Electron preload 脚本
│   ├── renderer/               # React 渲染进程
│   │   ├── api/                # Renderer 侧 IPC API 封装
│   │   ├── components/         # 通用组件
│   │   ├── contexts/           # React Context
│   │   ├── locales/            # 国际化语言包
│   │   ├── pages/              # 页面组件
│   │   └── styles/             # 全局样式
│   └── shared/                 # 主进程/渲染进程共享类型与 IPC 定义
├── electron.vite.config.ts     # electron-vite 配置
├── package.json
└── tsconfig*.json
```

## 数据存储位置

SSH-AT 默认会读取或写入以下本机路径：

| 内容 | 默认路径 |
| --- | --- |
| SSH 配置文件 | `~/.ssh/config` |
| 应用数据目录 | `~/.ssh-at/` |
| 备份目录 | `~/.ssh-at/backups/` |
| 应用生成的 SSH Key | `~/.ssh-at/creds/` |
| 应用设置 | `~/.ssh-at/settings.json` |

> ⚠️ 注意：本应用会直接操作本机 SSH 配置文件。开发或测试时建议使用 `SSH_AT_HOME_OVERRIDE` 指向临时目录，避免修改真实配置。

## 环境要求

- Node.js 20+ 或 22+
- npm
- OpenSSH 工具链
  - 需要系统可执行 `ssh-keygen`
  - Windows 用户建议安装系统自带的 OpenSSH Client，或通过 Git for Windows / Windows 可选功能安装

## 安装

```bash
npm install
```

## 运行

```bash
npm run dev
```

## 打包

```bash
npm run dist
```

打包产物默认输出到 `release/`。

当前 `package.json` 中的打包配置：

- Windows：NSIS 安装包
- macOS：DMG
- Linux：AppImage、deb


## 许可证

本项目基于 [Apache License 2.0](./LICENSE) 开源。
