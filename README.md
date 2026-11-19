# MyDesk

一个跑在浏览器里的个人工作台，把待办、便签、物品、每日复盘和教学工具收在一处。纯前端实现，默认全部数据存在本机，可以装到桌面或手机主屏幕当 PWA 用。

在线演示：https://warm-brioche-f00869.netlify.app

> 打开是空的。数据按浏览器 origin 隔离，访问者之间互不可见，不需要注册。

## 功能

| 模块 | 说明 |
| --- | --- |
| 待办（`/`） | 分类、优先级、截止时间、重复规则；分类视图 / 时间轴视图；拖拽排序 |
| 物品（`/items`） | 拍照建档、备注、置顶；统计页与拍照草稿箱 |
| 教学工具（`/homework`） | 作业登记、面批、成绩分析、课程安排四个子模块 |
| 番茄钟（`/pomodoro`） | 专注与休息计时，时长可调 |
| 便签（`/notes`） | 置顶、语音转文字、自动保存 |
| 复盘（`/review`） | 自定义问题模板、睡眠、图片和附件、自动保存；日历跳转、全文搜索、周月年总览 |
| 知识库（`/knowledge`） | 文件存 IndexedDB，部分格式抽文本参与全局搜索 |
| 仪表盘（`/dashboard`） | 快捷入口、最新便签 |

通用能力：全局搜索、JSON 备份、版本更新消息、可选的多设备同步。

## 技术栈

React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · Zustand 5 · React Router 7 · vite-plugin-pwa。
拖拽用 `@dnd-kit`，日期用 `dayjs`，表格解析用 `xlsx`，本地 OCR 用 `tesseract.js`。图表是手写 SVG / CSS，没有引入图表库和 UI 组件库。

## 本地运行

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc -b && vite build，产物在 dist/
npm run lint         # oxlint
```

环境变量见 `.env.example`。**不配置也能完整使用本地功能**，只有多设备同步需要 Supabase 的 URL 和 anon key。

生产部署在 Netlify：`npm run deploy` 用文件摘要上传（只传变化的文件）。脚本自带系统代理适配，token 从 `NETLIFY_TOKEN` 或 `~/.workbuddy/netlify-token.txt` 读取。

## 数据存在哪里

| 内容 | 位置 |
| --- | --- |
| 业务状态（待办、便签、物品元数据、作业、复盘等） | localStorage，key 前缀 `my-desk:` |
| 物品照片、复盘图片 | IndexedDB `mydesk-photos`，存 data URL |
| 知识库原始文件、复盘附件 | IndexedDB `my-desk-knowledge`，存 Blob |
| 文本快照（可选） | Supabase `snapshots` 表，存加密后的密文 |
| 二进制文件（可选） | Supabase `files` 表，按 SHA-256 增量上传 |

Zustand 用 `persist` 直接读写 localStorage 原始值，结构变更在 `onRehydrateStorage` 里做兼容处理。这不是显式的 `version / migrate` 迁移体系，新增字段时按约定只加不改。

知识库的文本提取只覆盖 `txt / md / csv / xls / xlsx`；PDF、Word、PPT 和图片浏览器没有原生提取能力，只能按文件名检索，这是明确的降级行为，不是待修复的 bug。

## 同步流程

同步默认关闭。在主力设备生成同步码，其他设备输入同一个码加入。

1. 同步码来自 24 字节随机数（192 位熵）。PBKDF2-SHA256 迭代 12 万次派生 256 位 AES-GCM 密钥；identity ID 取派生结果 SHA-256 的前 16 字节（128 位）。
2. 文本快照加密后写入 `snapshots` 表。数据库用 `revision` 做 CAS，本地记录自己基于哪个版本修改（`lastRevision`）。
3. 照片和文件按 SHA-256 比较，只上传变化的内容，分批发送。文件哈希、大小是明文，内容本身加密。
4. 冲突策略：本地有未上传修改、且云端版本已前进时，先把本地快照存成冲突副本（`my-desk:sync-conflict`，只保留最近一次），再采用云端版本。冲突副本可在同步面板导出。CAS 失败会重新拉取，不会用旧快照覆盖新云端。

Supabase 的 RLS 依赖客户端传 `x-identity-id`，属于能力令牌方案，不是完整的账户鉴权。知道这个标识的一方可以读写对应密文，但拿不到明文解密密钥。要公开给多人用，需要换成 Supabase Auth + `auth.uid()`。

## 已知限制

- 同步是整份快照覆盖，不是逐字段合并。冲突时另存副本，仍需人工选择；不提供自动合并，也没有 CRDT。
- 删除不会传播到云端；同 ID 文件的远程更新没有完整冲突策略。
- 单个文件转 data URL 后超过 12 MB 不进同步；超过 20 MB 不进备份，导出时会给出警告。
- JSON 备份文件不加密，且包含同步码与 OCR 配置，不要外传。
- 浏览器直连 OCR 服务时，密钥一定会出现在请求头里。代码里不内置任何密钥，需要使用者自己申请并填写。给别人用应当走受控服务端中转。
- 离线可以用本地数据和 PWA 应用壳；云端 OCR 和多设备同步需要网络。
- 忘记同步码无法解密云端数据。

## 源码结构

```
src/
  pages/             15 个页面
  components/        通用组件，以及 homework / items / review / todo 四个业务目录
  store/             13 个 Zustand store
  lib/               存储、同步、备份、OCR、课表解析等纯逻辑
  router/            路由表
supabase/schema.sql  数据库表与 RLS
scripts/             Netlify 部署脚本
```

应用内的版本更新日志在 `src/lib/appInfo.ts`。它记录的是产品迭代说明，不是 Git 提交记录。
