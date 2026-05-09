# xoss

一个轻量级的自建对象存储 / 网盘系统，支持：

- 大文件分片上传 + 断点续传 + 秒传
- 文件夹层级管理（创建 / 进入 / 删除 / 面包屑）
- 公网直链访问（一键复制）
- 文件删除
- 多种文件类型在线预览（图片 / 视频 / 音频 / PDF / 文本）

## 技术栈

- 后端：Node.js + Express + better-sqlite3
- 前端：React + Vite
- 存储：本地文件系统（分片缓存 + 合并后的最终文件）

## 快速启动

```bash
# 1. 安装后端依赖并启动
cd server
npm install
npm run dev      # 默认 http://localhost:4000

# 2. 安装前端依赖并启动
cd ../web
npm install
npm run dev      # 默认 http://localhost:5173
```

前端会通过 Vite 代理把 `/api` 和 `/p` 转发到后端。

## 目录结构

```
server/
  src/
    index.js        # Express 入口，静态服务 + 路由挂载
    db.js           # SQLite schema 与连接
    routes/
      upload.js     # 分片上传 / 秒传 / 合并
      files.js      # 文件列表 / 删除 / 公网访问
      folders.js    # 文件夹 CRUD
  data/             # 运行时生成：sqlite.db + chunks/ + files/
web/
  src/
    App.jsx
    api.js
    components/
      Uploader.jsx
      FileList.jsx
      Breadcrumb.jsx
      Preview.jsx
      NewFolderDialog.jsx
```

## 公网访问

每个上传成功的文件会分配一个短 ID，公网链接为：

```
http://<host>/p/<id>/<filename>
```

在前端文件列表的"复制链接"按钮可一键复制。
