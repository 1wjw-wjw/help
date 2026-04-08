# Health Dashboard Monorepo

医疗数据可视化三屏项目，采用 Monorepo 结构管理：

- `apps/global-screen`：全球大屏（原 `bigbig_screen`）
- `apps/china-screen`：全国大屏（原 `two_bigscreen`）
- `apps/province-screen`：省份大屏（原 `screen`）

根目录统一管理部署与构建脚本，不修改任何业务代码逻辑。

## Project Structure

```text
health-dashboard/
├── apps/
│   ├── global-screen/
│   ├── china-screen/
│   └── province-screen/
├── scripts/
│   ├── dev-all.mjs
│   └── vercel-build.mjs
├── index.html
├── package.json
├── vercel.json
└── .gitignore
```

## Local Development

### Start all screens

```bash
npm run dev:all
```

### Start one screen only

```bash
npm run dev:global
npm run dev:china
npm run dev:province
```

## Vercel Deployment

### Build

```bash
npm run vercel-build
```

构建产物输出到：

- `public_out/global-screen/`
- `public_out/china-screen/`
- `public_out/province-screen/`
- `public_out/index.html`

### Vercel Settings

- Root Directory: `./`
- Build Command: `npm run vercel-build`
- Output Directory: `public_out`

`vercel.json` 已包含子路径 SPA 回退与旧路径兼容跳转，避免刷新 404。
