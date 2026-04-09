# Health Dashboard Monorepo

医疗健康数据可视化三屏项目（全球 / 全国 / 各省），使用 Monorepo 管理三个前端子应用，并统一本地联调与 Vercel 部署流程。

---

## 快速导航

|    场景    |    需要做什么    |    命令/地址    |
|    ---     |      ---       |      ---       |
| 本地三屏联调 | 一键启动三个页面 | `npm run dev:all` |
| 本地访问-全球 | 打开全球大屏 | `http://localhost:5172/` |
| 本地访问-全国 | 打开全国大屏 | `http://localhost:5173/` |
| 本地访问-各省 | 打开各省大屏 | `http://localhost:5174/` |
| 本地构建检查 | 生成部署产物 | `npm run vercel-build` |
| Vercel 构建命令 | 平台 Build Command | `npm run vercel-build` |
| Vercel 输出目录 | 平台 Output Directory | `public_out` |
| 线上子路径-全球 | 直接访问 | `/global-screen/` |
| 线上子路径-全国 | 直接访问 | `/china-screen/` |
| 线上子路径-各省 | 直接访问 | `/province-screen/` |

**排障优先顺序（建议）**
1. 先看端口是否正常（5172/5173/5174）  
2. 再看 `npm run vercel-build` 是否成功  
3. 最后看线上子路径和资源请求是否 200  

---

##项目介绍

**

“本项目是一个面向公共健康治理场景的三层级数据可视化系统，围绕‘全球—全国—各省’形成同一主题下的多尺度分析闭环。  
我们将复杂的健康资源数据转化为可交互、可联动、可对比的大屏表达：在全球层面呈现时空演变，在全国层面揭示老龄化与资源错配关系，在省域层面定位结构差异与重点区域。  
技术上，项目采用 Monorepo 多应用架构，支持一键三屏联调与子路径稳定部署，最终实现了从数据理解、决策沟通到上线交付的完整工程化落地能力。”

**关键词**

- 三层级联动（全球/全国/各省）
- 指标时空演变（时间轴 + 地图 + 多图协同）
- 工程化交付（Monorepo + 一键构建 + Vercel 稳定部署）
- 可复用与可扩展（文档完备：需求/设计/运维）

---

## 1. 项目简介

本项目由三个独立大屏组成：

- `apps/global-screen`：全球大屏（原 `bigbig_screen`）
- `apps/china-screen`：全国大屏（原 `two_bigscreen`）
- `apps/province-screen`：各省大屏（原 `screen`）

项目特点：

- 三屏独立开发与构建，根目录统一编排
- 本地支持一键启动三屏
- 线上支持子路径访问与旧路径兼容重定向
- 构建产物统一输出到 `public_out`

---

## 2. 功能总览

### 2.1 全球大屏（global-screen）

- 顶部 KPI 指标卡
- 世界地图热力图 + 年份时间轴（播放/暂停）
- LISA 空间分布图
- 趋势图、风险占比图、堆叠图、雷达图、地区分布图

### 2.2 全国大屏（china-screen）

- 中国分级设色地图
- 年份联动多图（散点、折线、柱图、雷达、桑基、排行）
- 顶部四项指标动画展示

### 2.3 各省大屏（province-screen）

- 省级热力图（年份滑块）
- 耦合度/OTE Top10 排行
- 雷达图、气泡图、区域趋势图
- 顶部实时时钟

---

## 3. 技术栈

- 框架：Vue 3
- 构建：Vite
- 图表：ECharts（global/china 为 ECharts 5；province 页面运行时脚本为 ECharts 4）
- 数据：CSV / XLSX / GeoJSON
- 部署：Vercel（静态部署）
- 工程结构：Monorepo（根脚本统一编排）

---

## 4. 项目结构

```text
health-dashboard/
├── apps/
│   ├── global-screen/
│   ├── china-screen/
│   └── province-screen/
├── scripts/
│   ├── dev-all.mjs          # 本地一键启动三屏
│   └── vercel-build.mjs     # 统一构建与产物汇总
├── index.html               # 根路径跳转入口
├── package.json             # 根脚本入口
├── vercel.json              # Vercel 路由与回退配置
├── requirements.md          # 需求规格文档
├── design.md                # 技术设计文档
└── tasks.md                 # 使用与运维手册
```

---

## 5. 环境要求

- Node.js 18+（建议 LTS）
- npm 9+
- Windows / macOS / Linux 均可

---

## 6. 本地开发

## 6.1 安装依赖

在项目根目录执行：

```bash
npm install
```

> 说明：子项目依赖会在对应脚本执行时自动安装/校验。

## 6.2 一键启动三屏

```bash
npm run dev:all
```

默认地址：

- 全球：`http://localhost:5172/`
- 全国：`http://localhost:5173/`
- 各省：`http://localhost:5174/`

## 6.3 单独启动某一屏

```bash
npm run dev:global
npm run dev:china
npm run dev:province
```

---

## 7. 构建与部署

## 7.1 本地构建

```bash
npm run vercel-build
```

构建输出目录：

- `public_out/global-screen/`
- `public_out/china-screen/`
- `public_out/province-screen/`
- `public_out/index.html`

## 7.2 Vercel 配置

在 Vercel 项目中填写：

- Root Directory：`./`
- Build Command：`npm run vercel-build`
- Output Directory：`public_out`

## 7.3 路由说明

`vercel.json` 已包含：

- 根路径入口
- 三屏子路径回退（刷新不 404）
- 旧路径兼容重定向：
  - `/bigbig_screen` -> `/global-screen`
  - `/two_bigscreen` -> `/china-screen`
  - `/screen` -> `/province-screen`

---

## 8. 常见问题（FAQ）

### Q1: `npm run dev:all` 提示端口被占用

- 现象：`Port 5173 is already in use` 等
- 处理：重新执行 `npm run dev:all`；若仍冲突，关闭占用 5172/5173/5174 的旧进程后再启动

### Q2: 页面打开了但图表空白

- 检查访问路径是否正确（本地端口或线上子路径）
- 检查浏览器 Network 中数据文件请求是否为 200
- 重新执行 `npm run vercel-build` 验证产物完整性

### Q3: Windows 构建出现 `EPERM unlink`

- 先关闭所有正在运行的 dev server
- 再执行 `npm run vercel-build`
- 构建脚本已内置安装失败回退逻辑

---

## 9. 文档索引

- 需求规格：`requirements.md`
- 技术设计：`design.md`
- 使用与运维：`tasks.md`

---

## 10. 维护说明

- 本 README 仅描述当前已实现成品能力与流程
- 如更新启动脚本、部署路径或目录结构，请同步更新本文档与 `tasks.md`
