# Cloudflare Pages 静态部署

> 迁移自：[CloudFlarePage静态部署](https://docs.tangly1024.com/article/notion-next-cloud-flare)

## 特点

- 适合**访问量大、发文不频繁**的站点  
- 采用静态导出，更新 Notion 后需**重新部署**  
- 内置搜索在纯静态下需配合 [Algolia](../config/algolia.md) 等方案

## 部署要点

1. 在 Cloudflare Pages 连接 GitHub 仓库  
2. 构建命令使用静态导出（如 `yarn export`，以仓库当前文档为准）  
3. 配置 `NOTION_PAGE_ID` 等环境变量  
4. 可使用 **Deploy Hooks** 触发重建（仅支持 POST）

## 原文链接

https://docs.tangly1024.com/article/notion-next-cloud-flare
