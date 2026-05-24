# 2026-2027 极氪001全国自驾公开协作页

这是 `national-ev-roadtrip-2026.html` 的公网发布版本。它保留静态行程页，并通过 Supabase Auth + Postgres + RLS 增加公开备注和评论。

## 本地预览

```bash
python3 -m http.server 8765
```

打开 `http://localhost:8765`。

## Supabase 设置

1. 创建 Supabase 项目。
2. 打开 SQL Editor。
3. 执行 `supabase/schema.sql`。
4. 打开 Authentication Providers。
5. 启用 GitHub OAuth 或 Email Magic Link。
6. 在 URL Configuration 中加入本地地址和正式公网地址：
   - `http://localhost:8765`
   - `https://aria777y.github.io/china_travel/`
7. 把 Supabase Project URL 和 anon public key 写入 `assets/roadtrip-config.js`：

```js
window.ROADTRIP_SUPABASE_CONFIG = {
  siteId: "roadtrip-2026",
  url: "https://你的项目.supabase.co",
  anonKey: "你的 anon public key",
  oauthProvider: "github",
  redirectPath: "/china_travel/"
};
```

anon public key 是前端公开 key，不能使用 service role key。

## 管理员设置

1. 用正式页面登录一次并设置姓名。
2. 在 Supabase SQL Editor 中运行：

```sql
update public.profiles
set role = 'admin'
where display_name = '你的公开显示姓名';
```

3. 刷新页面后，该用户可以隐藏备注和评论。

## GitHub Pages 发布

本仓库计划发布到：

```text
https://aria777y.github.io/china_travel/
```

同一 GitHub Pages 站点也托管狼人杀实战记录工具：

```text
https://aria777y.github.io/china_travel/werewolf/
```

推送到 GitHub 后，在仓库页面打开：

```text
Settings -> Pages -> Build and deployment -> Source: Deploy from a branch
```

然后选择：

```text
Branch: gh-pages
Folder: / (root)
```

保存后等待 GitHub Pages 构建完成。发布后，将 GitHub Pages 域名加入 Supabase Auth redirect URLs。

## 验证

```bash
node --check "assets/roadtrip-api.js"
node --check "assets/roadtrip-collab.js"
node "tools/verify-roadtrip-site.mjs"
```

预期输出：

```text
PASS: roadtrip static site verification succeeded
```

## 权限摘要

- 游客可读取行程、未隐藏备注、未隐藏评论。
- 登录用户首次发言前必须设置唯一姓名。
- 登录用户可新增备注和评论。
- 作者可编辑或删除自己的内容。
- 管理员可隐藏任何内容。
