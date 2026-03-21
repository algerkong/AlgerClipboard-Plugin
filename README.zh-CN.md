# AlgerClipboard 插件

[AlgerClipboard](https://github.com/algerkong/AlgerClipboard) 官方插件仓库。

中文 | [English](./README.md)

## 可用插件

| 插件 | 说明 | 前缀 |
|------|------|------|
| [IDE Projects](./plugins/ide-projects/) | 搜索并打开 VS Code、Cursor、Windsurf、Trae、Antigravity、Zed 的最近项目 | `\|` |

## 安装

1. 从 [Releases](https://github.com/algerkong/AlgerClipboard-Plugin/releases) 下载插件 `.zip`
2. 解压到 `{app_data_dir}/plugins/`（Windows: `%APPDATA%/com.alger.clipboard/plugins/`）
3. 重启 AlgerClipboard
4. 在 **设置 > 插件** 中启用

也可以直接通过 **设置 > 插件 > 打开插件目录** 打开插件文件夹。

## 插件注册表

[插件注册表](./registry/plugins.json) 包含所有可用插件的元数据，未来 AlgerClipboard 可通过此文件发现和下载插件。

注册表 URL:
```
https://raw.githubusercontent.com/algerkong/AlgerClipboard-Plugin/main/registry/plugins.json
```

## 开发插件

详见 [CONTRIBUTING.md](./CONTRIBUTING.md) 插件开发指南。

### 快速开始

1. 在 `plugins/` 下创建新目录
2. 添加 `manifest.json`、`frontend/index.js`，可选 Rust 后端
3. 本地构建测试
4. 提交 PR

### 构建

```bash
# 构建指定插件
./scripts/build.sh ide-projects

# 打包插件为 zip
./scripts/package.sh ide-projects
```

## 发布流程

推送格式为 `<plugin-id>-v<version>` 的 tag 触发自动构建发布：

```bash
git tag ide-projects-v1.0.0
git push origin ide-projects-v1.0.0
```

## 许可证

[GPL-3.0](LICENSE)
