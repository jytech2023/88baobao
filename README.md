# 88 Bao Bao 运营管理系统

多门店运营中台 — Next.js 16 + Neon + Drizzle + next-intl + Auth.js

## 技术栈

- **Framework**: Next.js 16 (App Router, Server Actions)
- **Language**: TypeScript
- **Database**: Neon (Postgres) + Drizzle ORM
- **Auth**: Auth.js v5 (Credentials, JWT session)
- **i18n**: next-intl（`/zh` `/en` URL 切换）
- **Styling**: Tailwind CSS v4
- **Image**: Cloudinary
- **SMS**: Twilio｜**Email**: Resend
- **LLM**: Anthropic Claude（点评分类）
- **Analytics**: Vercel Analytics + Speed Insights
- **Hosting**: Vercel
- **Middleware**: 使用 `proxy.ts`（Next.js 16+ 推荐）

## MVP 模块

| 模块 | 路径 | 状态 |
|---|---|---|
| 数据看板 | `/[locale]/dashboard` | 占位 |
| 门店管理 | `/[locale]/stores` | 占位 |
| 菜单管理 | `/[locale]/menu` | 占位 |
| 会员中心 | `/[locale]/members` | 占位 |
| 点评舆情 | `/[locale]/reviews` | 占位 |
| 订单导入 | `/[locale]/orders` | 占位 |
| 营销活动 | `/[locale]/campaigns` | 占位 |
| 系统设置 | `/[locale]/settings` | 占位 |

## 目录结构

```
src/
├── app/
│   ├── layout.tsx              # 根 layout（pass-through）
│   ├── [locale]/
│   │   ├── layout.tsx          # i18n + html/body
│   │   ├── page.tsx            # → /dashboard
│   │   ├── sign-in/
│   │   └── (admin)/
│   │       ├── layout.tsx      # 侧边栏 + 顶栏
│   │       ├── dashboard/
│   │       ├── stores/
│   │       ├── menu/
│   │       ├── members/
│   │       ├── reviews/
│   │       ├── orders/
│   │       ├── campaigns/
│   │       └── settings/
│   └── api/auth/[...nextauth]/route.ts
├── auth.ts                     # Auth.js 配置
├── components/
│   ├── sidebar.tsx
│   ├── topbar.tsx
│   └── locale-switcher.tsx
├── db/
│   ├── client.ts               # Neon + Drizzle
│   └── schema.ts               # 完整表结构
└── i18n/
    ├── routing.ts
    └── request.ts
messages/
├── zh.json
└── en.json
proxy.ts                        # next-intl middleware (proxy.ts in Next 16)
drizzle.config.ts
.env.example
```

## 启动

```bash
# 1. 安装依赖
pnpm install   # 或 npm install

# 2. 配置环境变量
cp .env.example .env.local
# 填入 DATABASE_URL / AUTH_SECRET / Cloudinary / Twilio / Resend / Anthropic 等

# 3. 数据库迁移
pnpm db:generate
pnpm db:push

# 4. 启动开发服务器
pnpm dev
```

打开 http://localhost:3000 → 自动跳转到 `/zh/dashboard`

## 开发待办（按优先级）

### Phase 1 — 门店 + 菜单（Week 1-2）
- [ ] 爬取 88baobaous.com 11 店地址 → seed
- [ ] 门店 CRUD（含地图选点、营业时间编辑器）
- [ ] 菜品分类 & 菜品 CRUD + Cloudinary 上传
- [ ] 门店级菜品覆盖（价格 / 可见性）

### Phase 2 — 会员 + CRM（Week 3-4）
- [ ] 桌贴 QR 注册落地页（OTP via Twilio）
- [ ] 会员列表 + 标签 + 分群
- [ ] 券系统 + 核销端 H5
- [ ] SMS / Email 群发 + 自动化触发

### Phase 3 — 点评 + 订单 + 看板（Week 5-6）
- [ ] Google Places API 拉取 reviews（每店每日 cron）
- [ ] 小红书爬虫（按门店关键词）
- [ ] Claude 点评分类 + 差评告警 webhook
- [ ] CSV 订单导入解析（DoorDash / UberEats / Grubhub）
- [ ] 数据看板：11 店健康度卡片 + 单店详情 + 周报邮件

### Phase 4 — 上线 + 培训
- [ ] Vercel 部署 + 域名
- [ ] 客户培训文档（中英）
- [ ] 30 天质保期
