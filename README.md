# 数学建模教练 · Math Modeling Tutor

面向**全国大学生数学建模竞赛（CUMCM / 国赛）**的教学式 Agent 桌面应用。

它**不替你写论文**。它把你做一次建模该走的十一个阶段拆成任务卡，逐阶段追问你、卡住你的检查点、在你真要放弃时按级别给提示，并且把你和 AI 的每一次交互如实记录下来——最后生成国赛要求提交的《AI 工具使用详情》文档。

> 设计底线（改动代码时请不要绕过）：
> 1. **AI 不代写**。教练角色只提问和给分级提示，成稿正文与代码必须由学生自己写；主进程里有 Critic 反向审查，检测到代写内容会拒绝采纳并留痕。
> 2. **API Key 只进本机系统钥匙串**（Electron `safeStorage`），绝不写明文、绝不在加密不可用时静默降级成明文存储。
> 3. **LLM 调用只发生在主进程**，渲染层拿不到 Key，也连不上模型。
> 4. **沙箱的定位是"防跑飞 / 防误删 / 防联网"**，不是防蓄意逃逸——使用对象是参赛学生，不是不可信第三方代码。
> 5. 政策条款文案一律标注「**以官方原文为准**」，本仓库不内置、也不代抓官方政策原文。

---

## 功能

| 模块 | 说明 |
| --- | --- |
| 十一阶段状态机 | 读题拆解 → 数据探索 → 假设与符号 → 模型选型 → 模型推导 → 求解实现 → 灵敏度与稳健性检验 → 结果分析与图表 → 摘要训练 → 全文组装与编译 → AI 使用详情导出。每阶段有任务卡字段、评分点、历年常见失分项；关键阶段 `blocking`，没通过检查点不许推进 |
| 教练对话 | 按当前阶段的任务卡 + 已钉方法卡生成追问，只能围绕该阶段的 rubric 反馈 |
| 分级提示 | L0 提问 / L1 方向性提示 / L2 半成品脚手架 / L3 完整示例；同一阶段连续 3 次没过检查点自动升一级，每次给了哪一级都写进合规日志 |
| 方法卡库 | 26 张建模方法卡（规划、评价、预测、图与网络、机器学习等），只有要点与建模思路骨架，没有成稿正文；可钉选注入教练上下文，未钉选时按任务卡文本自动检索 |
| Python 沙箱 | 主进程起子进程跑学生代码，`sandbox/runner.py` 用 audit hook + Windows Job Object 限制联网、文件写入范围与超时，出图直接回流到工作区面板 |
| 论文排版 | 国赛中文 LaTeX 模板（`resources/latex/cumcm.tex`），主进程调 `xelatex` 两遍编译，解析 `.log` 定位到具体行列，PDF 在应用内预览 |
| 合规导出 | 汇总全部留痕生成 `ai-usage.tex` 并编译为 **《AI 工具使用详情.pdf》**，含使用的模型、每一级提示的发放记录、完整交互过程 |

## 运行环境

- **Windows**（沙箱与 Job Object 依赖 Windows 语义；打包脚本按 Windows 写）
- **Node 22+，建议 24**（Vite 7 的最低要求；本仓库开发时用的是 Node 24 / npm 11）
- **Python 3.12 + numpy + matplotlib** —— 只有跑沙箱出图的功能需要。主进程按 `py -3.12` → 其它候选顺序探测，并优先挑带 numpy + matplotlib 的那个解释器
- **TeX Live（或 MiKTeX）的 `xelatex`** —— 只有论文编译与合规 PDF 需要。先查 PATH，再扫 `C:\|D:\|E:\texlive\<版本>\bin\windows\xelatex.exe` 与 MiKTeX 安装目录

缺 Python 或缺 XeLaTeX 时应用照常启动，相应功能会明确提示缺什么并禁用入口，已写内容不丢。

## 从源码跑起来

```bash
git clone <仓库地址>
cd math-modeling-tutor
npm install
npm run dev
```

**Electron 二进制下载失败是国内最常见的坑**：`npm install` 的 postinstall 经常静默不下载，表现为 `npm run dev` 报找不到 Electron。补一条即可：

```bash
# Git Bash
ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/ node node_modules/electron/install.js
```

首次进入应用，点右上角**设置**，填自己的模型服务：选内置的 OpenAI 兼容预设或自定义 Base URL + 模型名 + API Key。Key 存进本机钥匙串，只在本机生效，不会同步、不会进 git、也不会出现在导出的 PDF 里。

只想看界面不接模型：填个假的 Base URL 也能进，对话会报错，但阶段状态机、任务卡、方法卡、论文编辑都可用。

## 打测试包

```bash
npm run build     # 编译到 out/
npm run dist      # electron-builder，产物在 release/
```

`npm run dist` 走的是 `scripts/dist.mjs`，它给 electron-builder 加了 `NODE_OPTIONS=--use-system-ca`。没有这个参数，从 GitHub 下载 NSIS 工具链时会 `unable to verify the first certificate` 直接失败。产物：

- `release/math-modeling-tutor-setup-<版本>.exe` —— 安装版
- `release/math-modeling-tutor-portable-<版本>.exe` —— 免安装，双击就开，适合直接发给队友看效果
- `release/win-unpacked/` —— 解包目录，验证外部依赖缺失时的提示文案最方便

安装包与 dev 共用同一份用户数据目录（`%APPDATA%\math-modeling-tutor`），应用启用了单实例锁：**dev 还开着的时候，双击安装包会直接退出且不报错**，先退干净再开。

## 命令一览

| 命令 | 用途 | 需要 API Key / 网络？ |
| --- | --- | --- |
| `npm run dev` | 起开发窗口。主进程改动**不会**热重建，需要重启；加 `-w` 让主进程/preload 变更时自动重建 | 不需要（对话功能要 Key） |
| `npm run build` | 三端编译到 `out/` | 不需要 |
| `npm run typecheck` | TS 两侧检查（node + web），strict 且开了 `noUncheckedIndexedAccess` | 不需要 |
| `npm run dist` | electron-builder 打 Windows 包 | 要下载工具链 |
| `npm run smoke` | LLM 流式 SSE 解析 | 不需要 |
| `npm run smoke:agent` | 状态机 / 教练上下文 / 反代写 / 提示升级，打假 LLM | 不需要 |
| `npm run smoke:latex` | `.log` 解析与 LaTeX 片段生成 | 需要本机有 `xelatex` |
| `npm run smoke:methods` | 方法卡检索打分 | 不需要 |
| `npm run smoke:compliance` | 详情文档生成器纯函数 | 不需要 |
| `npm run smoke:sandbox` | 沙箱限制用例 | 需要 Python 3.12 |
| `npm run smoke:ui[:stage\|paper\|methods\|compliance]` | CDP 驱动真实窗口的端到端探针 | 需要按下述方式起 dev |

UI 探针需要一个开着 CDP 调试端口的窗口，且合规那条要绕开原生另存对话框：

```bash
MMT_EXPORT_DIR="$PWD/.tmp/compliance-export" \
  npx electron-vite dev --remoteDebuggingPort=9222
# 另开一个终端
npm run smoke:ui:compliance
```

探针默认连 9222；要验打包产物，把安装包用自己的调试端口起起来，再用 `MMT_CDP_PORT=<端口>` 指过去，同一套断言照跑。

## 项目结构

```
src/shared/      主进程与渲染层共用的类型与纯逻辑：阶段定义、方法卡、合规文档、沙箱协议
src/main/        主进程：LLM 适配、阶段状态机与教练、沙箱调度、LaTeX 编译、合规采集导出、
                 sqlite 持久化、safeStorage 密钥
src/preload/     暴露给渲染层的白名单 IPC 接口（渲染层拿不到任何网络与文件系统能力）
src/renderer/    React 三栏界面
resources/       latex 模板 / compliance 政策文案配置 / icon
sandbox/         runner.py，学生代码的实际执行器
scripts/         打包入口、图标生成、agent 测试打包
tests/           离线冒烟 + CDP 端到端探针
```

数据落在 `userData`（Windows 下 `%APPDATA%\math-modeling-tutor`）：sqlite 库、各会话工作区、编译中间件。**这些都不进 git。**

`npm run icons` 从 `resources/icon/source.jpg` 重画全套图标。这张源图是收到的聊天原图、含个人信息，已 gitignore；`icon.png`/`icon.ico` 等产物都入库了，正常构建和打包不需要源图。

## 提交前自检

```bash
npm run typecheck && npm run build && npm run smoke:agent && npm run smoke:compliance
```

改动碰了主进程或状态机，把上面几条全跑一遍；只碰渲染层样式，`typecheck` + 手工看一眼即可。

不要提交：`node_modules/`、`out/`、`release/`、`.tmp/`、`workspaces/`、`*.log`。安装包（~110MB，超 GitHub 单文件 100MB 上限）走 Releases 附件，不走 git。

## 关于比赛合规

国赛要求提交的《AI 工具使用详情》文档结构与措辞每年可能调整。本应用把文案与清单放在 `resources/compliance/ai-policy.json`，改这个文件就能调整导出文档的章节和提示语，不用动代码。**请务必以当年官方原文为准核对自己交出去的文档**，本工具负责的是如实留痕和排版，不是替你判断合规。

## License

MIT，见 [LICENSE](LICENSE)。
