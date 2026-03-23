# AlgerClipboard 插件

[AlgerClipboard](https://github.com/algerkong/AlgerClipboard) 官方插件仓库。

中文 | [English](./README.md)

## 可用插件

| 插件 | 说明 | 前缀 | 后端 |
|------|------|------|------|
| [IDE Projects](./plugins/ide-projects/) | 搜索并打开 VS Code、Cursor、Windsurf、Trae、Antigravity、Zed 的最近项目 | `\|` | Rust |
| [Everything Search](./plugins/everything-search/) | 使用 Everything (voidtools) 全局搜索文件 | `f` | Rust |

## 安装

1. 从 [Releases](https://github.com/algerkong/AlgerClipboard-Plugin/releases) 下载插件 `.zip`
2. 解压到 `{app_data_dir}/plugins/`（Windows: `%APPDATA%/com.alger.clipboard/plugins/`）
3. 在 **设置 > 插件** 中启用

插件支持热重载，启用后无需重启应用。

也可以直接通过 **设置 > 插件 > 打开插件目录** 打开插件文件夹。

## 插件功能

### 配置系统

插件可在 `manifest.json` 中声明设置项，支持 6 种控件类型：

- **string** — 文本输入（支持 `secret` 密码模式）
- **number** — 数字输入（支持 `min/max/step` 范围）
- **boolean** — 开关
- **select** — 下拉选择
- **shortcut** — 快捷键录入
- **array** — 可增删列表

设置项在 **设置 > 插件** 中展开插件卡片后自动渲染。

### 国际化

`manifest.json` 中所有文本字段支持国际化，使用 locale 映射格式：

```json
{
  "name": { "en": "My Plugin", "zh-CN": "我的插件" },
  "description": { "en": "Description", "zh-CN": "描述" }
}
```

### Spotlight 集成

插件可注册 Spotlight 搜索模式，支持：
- 自定义前缀触发（如 `f` 触发文件搜索）
- 底部快捷键提示
- 键盘修饰键（Ctrl+Enter、Shift+Enter 执行不同操作）
- 每个结果行上的操作按钮

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

### 插件结构

```
plugins/my-plugin/
├── manifest.json           # 插件元数据、权限、设置项
├── Cargo.toml              # Rust 后端（可选）
├── src/
│   └── lib.rs              # C ABI 插件实现
├── frontend/
│   └── index.js            # 前端 JS
└── backend/
    └── my_plugin.dll       # 编译后的原生库
```

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
