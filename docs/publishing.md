# 商店上架与打包

> 插件基于 WXT 构建,打包与自动发布由 WXT 提供;首次上架各商店需手动走一遍流程(WXT 不代创建 listing)。

## 一、打包(本地)

```bash
npm run build:ext            # 构建 Chrome 版(校验用,发布前先跑 typecheck:ext)
npm run typecheck:ext        # 类型检查,必跑
npx wxt zip                  # 打 Chrome 安装包 → .output/bookmark-nav-<版本>-chrome.zip
npx wxt -b firefox zip       # 打 Firefox 安装包 + 源码包
```

产物(`.output/`):

| 文件 | 用途 |
| --- | --- |
| `bookmark-nav-0.1.0-chrome.zip` | Chrome / Edge / Brave 等 Chromium 系安装包(约 173 kB) |
| `bookmark-nav-0.1.0-firefox.zip` | Firefox 安装包 |
| `bookmark-nav-0.1.0-sources.zip` | Firefox **源码包**(AMO 审核必需,约 641 kB) |

> 版本号来自 `package.json` 的 `version`;源码包已配置排除 `dist/**` 等非源码内容,且默认不包含 `.dev.vars`/`.env` 等隐藏文件。

## 二、自动发布(WXT submit)

WXT 内置自动提交工具,用于**后续每次发新版本**:

```bash
npx wxt submit init          # 首次:交互式配置各商店凭据,生成 .env.submit
npx wxt zip && npx wxt -b firefox zip   # 先打好所有要发的 zip
npx wxt submit --dry-run --chrome-zip .output/*-chrome.zip \
  --firefox-zip .output/*-firefox.zip --firefox-sources-zip .output/*-sources.zip   # 试跑
npx wxt submit --chrome-zip .output/*-chrome.zip \
  --firefox-zip .output/*-firefox.zip --firefox-sources-zip .output/*-sources.zip   # 正式提交
```

所需凭据(存 `.env.submit`,勿提交 git):

| 商店 | 变量 |
| --- | --- |
| Chrome Web Store | `CHROME_EXTENSION_ID`、`CHROME_CLIENT_ID`、`CHROME_CLIENT_SECRET`、`CHROME_REFRESH_TOKEN` |
| Firefox AMO | `FIREFOX_EXTENSION_ID`、`FIREFOX_JWT_ISSUER`、`FIREFOX_JWT_SECRET` |

> Edge 无需单独打包:直接复用 Chrome 的 zip 上架到 [Partner Center](https://aka.ms/PartnerCenterLogin)。

## 三、Chrome Web Store(手动上架,仅首次)

1. **注册开发者账号**:[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole),一次性注册费 **$5**(需 Google 账号 + 付款信息)
2. **创建项目**:Dashboard → 新增项目 → 上传 `bookmark-nav-0.1.0-chrome.zip`
3. **填写四个标签页**:
   - **Store Listing**:名称、简介(简述“一键收藏网页到自托管 Bookmark Nav”)、**至少 1280×800 或 640×400 的截图**、128×128 图标、分类、支持语言
   - **Privacy**:声明单用途;如实说明收集的数据——**用户主动收藏时发送网页 URL/标题到用户自己的服务器**(不出第三方);单用途填“书签管理”
   - **Distribution**:可见范围(公开/仅链接)与允许地区
   - **Test instructions**:非必需(本扩展无需登录凭据即可测,可选填演示 URL)
4. **Submit for review**:提交后进入审核(简单权限扩展通常较快);审核通过后可**选择立即发布或暂存 30 天内手动发布**
5. 之后更新版本:上传新 zip → 提交 → 审核 → 发布(可全程用 `wxt submit` 自动化)

**本项目材料清单**:✅ 已就绪——zip 可打、权限最小(storage/activeTab/contextMenus + 可选站点权限)、manifest 合规;⏳ 待做——插件图标、商店截图、隐私政策页面。

## 四、Firefox AMO(手动上架,仅首次)

1. 注册 [Firefox Add-ons](https://addons.mozilla.org/developers/)(免费,需 Firefox 账号)
2. 创建扩展 → 上传 `bookmark-nav-0.1.0-firefox.zip`(**必须**同时上传 `sources.zip` 源码包供审核)
3. AMO 要求源码包能**独立重建**:解压后 `npm install && npm run build:ext:firefox` 产物应一致;请在根 README 或 `SOURCE_CODE_REVIEW.md` 写明该构建命令
4. 填写 listing(名称/简介/图标/截图/隐私政策)
5. 审核通过后 AMO 自动签名,你的扩展获得正式签名(侧载的本地版无签名,仅 AMO 发布版带签名)

> Firefox 兼容已就绪:WXT 自动转 event page + `browser_specific_settings.gecko.id`(见 `wxt.config.ts`)。

## 五、上架前的通用检查单

- [ ] `npm run typecheck:ext` 与 `npm run build:ext` 通过
- [ ] zip 内含的 manifest 权限与隐私声明一致(仅 storage/activeTab/contextMenus + 动态站点权限)
- [ ] 插件图标(128×128 及 popup 用)已放入 `src/extension/public/`
- [ ] 商店截图与简介已准备
- [ ] 隐私政策页面已准备(如实说明数据只到用户自己的服务器)
- [ ] Firefox 源码包可独立重建,README/SOURCE_CODE_REVIEW.md 写了构建命令
- [ ] 版本号已在 `package.json` 递增(`wxt submit` 每次需要新版本号)

## 六、CI/CD 自动化构建(补充渠道)

仓库内置两个 GitHub Actions workflow(`.github/workflows/`),把"质量门禁"与"Releases 侧载分发"自动化:

| Workflow | 触发 | 作用 |
| --- | --- | --- |
| `ci.yml` | push / PR | typecheck:ext + Chrome/Firefox 构建 + lint,防错误流入产物 |
| `release.yml` | 推送 `v*` 标签 / 手动 | 校验 tag 与版本一致 → 构建打包 → 检查源码包无敏感文件 → 发布到 GitHub Releases;手动触发时跳过发布,改为上传 zip 到运行详情页的 Artifacts(保留 7 天)供下载试用 |

**发版流程**(约定与 release.yml 的硬校验一致):

```bash
# 1. 手动 bump 版本
npm version patch --no-git-tag-version     # 或手动改 package.json 的 version
# 2. 提交 + 打同版本标签
git add package.json package-lock.json && git commit -m "chore: bump version"
git tag v$(node -p "require('./package.json').version")
# 3. 推送触发 release workflow
git push origin main --tags
```

推送 `v*` 标签后,workflow 自动把 `-chrome.zip` / `-firefox.zip` / `-sources.zip` 三个安装包挂到对应 Release,用户可直接下载后手动安装(侧载),无需 clone 构建。这是商店审核渠道之外的**即时分发补充**。

## 七、Safari

暂不支持自动发布;需用 Xcode + `safari-web-extension-packager` 打包成 Safari Web Extension(成本高,本项目不作为目标)。
