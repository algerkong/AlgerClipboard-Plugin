# Spotlight 全局搜索架构重构 + 插件设计方案

> 日期：2026-03-23
> 范围：阶段一 — Spotlight 架构重构（AlgerClipboard 宿主）；阶段二 — 11 个新插件（AlgerClipboard-Plugin）
> 参考：Microsoft PowerToys Run 插件体系

---

## 阶段一：Spotlight 架构重构（AlgerClipboard 宿主项目）

### 核心理念

当前 Spotlight 是单模式搜索：用户必须先切换到某个模式（剪贴板/应用/翻译），或通过前缀路由到特定模式。重构后改为：

- **默认全局搜索**：无前缀时，同时查询所有参与全局搜索的模式，结果混合排列
- **前缀精确模式**：用户输入 `前缀+空格` 时，仅查询对应的单一模式（行为与当前一致）

### SpotlightMode 接口变更

在现有 `SpotlightMode` 接口基础上新增以下字段：

- `globalSearch: boolean` — 是否参与全局搜索，默认 false
- `match?: (input: string) => boolean` — 内容匹配函数，全局搜索时调用，返回 true 才执行该模式的 onQuery。未提供时视为始终参与（由 globalSearch 控制）
- `priority: number` — 模式优先级权重（0-100），全局搜索结果排序时使用，数值越大越靠前

`SpotlightResult` 接口新增：

- `score?: number` — 单条结果的匹配评分（0-1），由各模式的 onQuery 自行计算。全局搜索排序公式：`finalScore = score * priority`

### 全局搜索查询流程

1. 用户输入文本，无前缀命中
2. 遍历所有 `globalSearch: true` 的模式
3. 对每个模式，调用 `match(input)` 判断是否匹配（无 match 函数的默认匹配）
4. 对所有匹配的模式，**并行调用** `onQuery(input)`
5. 结果先到先显示，按 `score * priority` 降序插入结果列表
6. 设置总超时（默认 2000ms），超时后不再接受新结果，停止 loading 状态

### 历史记录系统

全局搜索架构需要在宿主侧新增历史记录存储，记录用户在 Spotlight 中选择过的结果：

- 在 `executeSelected` 中，每次用户选择结果后记录：结果标题、subtitle、来源模式、原始查询、时间戳
- 存储位置：SQLite settings 表，key 为 `spotlight_history`，value 为 JSON 数组
- 最大记录数可配置（默认 200 条），超出时淘汰最旧记录
- 提供 `getSpotlightHistory(query)` 和 `clearSpotlightHistory()` 方法供历史记录插件调用
- 通过插件 API 暴露：`api.invokeBackend("get_spotlight_history", { query })` 和 `api.invokeBackend("clear_spotlight_history")`

### 模式分类

| 参与全局搜索 | 仅前缀触发 |
|---|---|
| 剪贴板（clipboard） | 翻译（translate）`tt` — 任何文本都能翻译，噪音大 |
| 应用启动（app） | 密码生成（password-generator）`pw` — 无查询概念 |
| Everything 文件搜索 `f` | System Info `si` — 无查询概念 |
| IDE Projects `\|` | GitHub Search `gh` — 网络请求慢 |
| Calculator — match 检测表达式特征 | Web Search `??` — 任何文本都能搜 |
| Color Toolbox — match 检测颜色值特征 | 历史记录 `!!` — 专用回溯场景 |
| Timestamp — match 检测时间戳/日期特征 | |
| Browser Bookmarks | |
| Network Info — match 检测 IP/域名特征 | |
| URL Opener — match 检测 URL 特征 | |

### 各模式 match 函数设计

- **Calculator**：包含运算符（`+` `-` `*` `/` `^` `%`）且含数字，或以 `0x`/`0b`/`0o` 开头，或含 `to` 且有数字和单位关键词，或含数学函数名。纯数字不匹配（避免与时间戳冲突）
- **Color Toolbox**：以 `#` 开头且后跟 3/4/6/8 位十六进制字符，或以 `rgb(`/`hsl(` 开头，或完全匹配 CSS 颜色名表，或匹配 Tailwind 色名模式
- **Timestamp**：10-13 位纯数字，或匹配日期格式 `YYYY-MM-DD`/`YYYY/MM/DD`，或为 `now`，或含 `to` 且两侧为日期
- **Network Info**：IPv4 格式（`x.x.x.x`），或 `ping ` 开头
- **URL Opener**：以 `http://`/`https://` 开头，或以 `www.` 开头，或匹配 `xxx.yyy` 且 yyy 为已知 TLD，或匹配 `localhost`/`127.0.0.1`

### 并发控制

- 所有模式的 onQuery 并行发起，使用 Promise 各自独立
- 每个模式结果到达后立即插入结果列表（流式更新）
- 总超时 2000ms，超时后设置 `loading: false`，忽略后续到达的结果
- 前缀模式不受并发控制影响，行为与当前完全一致

### spotlightStore 变更

- `checkPrefix` 重命名为 `resolveQuery`，返回值新增 `isGlobal: boolean` 字段
- 新增 `queryTimeout` 配置项（默认 2000ms）
- 查询调度逻辑从 SpotlightPanel 的 useEffect 移入 store 的 `executeQuery` 方法，统一管理并发和超时
- 新增 `addHistory(result)` 方法，在 `executeSelected` 中调用

### SpotlightPanel 变更

- 查询调度简化为调用 `store.executeQuery(query)`
- 结果列表渲染逻辑不变（已是混合列表）
- 需要处理全局搜索时结果动态追加的渲染更新

### 插件 API 变更

- `registerMode` 支持新增的 `globalSearch`、`match`、`priority` 字段
- manifest.json 的 `spotlight_modes` 新增 `global_search` 和 `priority` 字段，前端 loader 读取并传给 registerMode
- 向后兼容：未设置新字段的旧插件默认 `globalSearch: false`、`priority: 50`

### 已有内置模式适配

- **clipboard**：`globalSearch: true`，`priority: 80`，无 match 函数（始终参与），score 按搜索匹配度
- **app**：`globalSearch: true`，`priority: 90`（应用启动优先级最高），score 按名称匹配度
- **translate**：`globalSearch: false`，仅前缀 `tt` 触发

### 设置页变更

Spotlight 设置 tab 新增：
- 全局搜索超时时间设置（默认 2000ms）
- 各模式的全局搜索开关（允许用户关闭某些模式的全局搜索参与）
- 各模式优先级排序（拖拽排序或数值设置）

---

## 阶段二：插件开发（AlgerClipboard-Plugin 项目）

### 总体约定

- 所有插件遵循已有插件结构：`manifest.json` + `frontend/index.js` + 可选 `src/lib.rs`（Rust 后端 DLL）
- 国际化：manifest 中 name/description 使用 `{en, zh-CN}` 格式，前端 JS 内置 i18n 对象
- 每个插件独立目录，位于 `plugins/` 下
- 纯前端插件不需要 Rust 后端，manifest 中省略 `backend` 字段，permissions 按需最小化
- 所有参与全局搜索的插件需实现 `match` 函数，确保只在输入匹配时返回结果
- 所有模式的 `onQuery` 返回结果需包含 `score` 字段

---

### 第一批：纯前端插件

#### 1. Calculator（计算器）

**目录名：** `calculator`
**前缀：** `=`
**全局搜索：** 是（match 检测表达式特征）
**优先级：** 95（精确计算结果应排最前）

**功能：**
- 数学表达式计算：四则运算、括号、幂运算（`2^10`）、取余
- 内置数学函数：`sqrt()`, `sin()`, `cos()`, `log()`, `abs()`, `ceil()`, `floor()`, `round()`, `exp()`, `pow()`, `min()`, `max()`, `rand()`
- 常量支持：`pi`, `e`
- 进制转换：输入 `0xFF` 或 `0b1010` 自动显示十进制/十六进制/八进制/二进制结果
- 单位转换：长度（km/m/cm/mm/mi/ft/in）、重量（kg/g/lb/oz）、温度（C/F/K）、数据（GB/MB/KB/B）、面积、体积、加速度、角度、能量、压力、速度等，格式为 `12kg to lb`
- 百分比计算：`15% of 200` → 30，`200 + 10%` → 220
- 隐含乘法支持：`2(3+4)` → 14，`(1+2)(3+4)` → 21
- 结果列表：主结果 + 额外格式（如输入十六进制时同时显示十进制/二进制）

**交互：**
- 输入即算，debounce 100ms
- Enter 复制计算结果到剪贴板
- 结果 subtitle 显示原始表达式
- 计算错误时显示友好提示而非崩溃

**match 函数逻辑：**
- 包含运算符（`+` `-` `*` `/` `^` `%`）且含数字
- 以 `0x` / `0b` / `0o` 开头（进制）
- 包含 `to` 或 `in` 且含数字和单位关键词
- 包含数学函数名（`sqrt`、`sin` 等）
- 纯数字不匹配（避免与时间戳冲突）

**实现要点：**
- 纯前端 JS，安全的表达式解析（不用 eval），手写 Shunting-yard 算法或递归下降解析器
- 单位转换使用内置转换表
- 无需 Rust 后端，无需特殊权限

**设置项：**
- `prefix`：前缀，默认 `=`
- `decimal_places`：小数位数，默认 6，number，min 0，max 15

---

#### 2. Color Toolbox（颜色工具）

**目录名：** `color-toolbox`
**前缀：** `cc`
**全局搜索：** 是（match 检测颜色值特征）
**优先级：** 90

**功能：**
- 颜色输入解析：HEX（`#FF5733`、`FF5733`）、RGB（`rgb(255,87,51)`）、HSL（`hsl(11,100%,60%)`）、CSS 颜色名（`red`、`tomato`）、Tailwind 色名（`blue-500`）
- 结果列表：每种格式一行
  - HEX → `#FF5733`
  - RGB → `rgb(255, 87, 51)`
  - HSL → `hsl(11, 100%, 60%)`
  - Tailwind 最近色 → `red-600`（最接近的 Tailwind 调色板颜色）
- 颜色预览：利用 SpotlightResult 的 icon 字段，生成纯色色块的 data URI 作为缩略图
- 对比色/互补色：subtitle 中提示互补色 HEX

**交互：**
- 输入即解析，debounce 100ms
- Enter 复制选中格式的颜色值
- Ctrl+Enter 复制所有格式（多行文本）

**match 函数逻辑：**
- 以 `#` 开头且后跟 3/4/6/8 位十六进制字符
- 以 `rgb(` 或 `hsl(` 开头
- 完全匹配 CSS 颜色名表
- 匹配 Tailwind 色名模式（`color-number`）

**实现要点：**
- 纯前端 JS，内置 CSS 颜色名表（~148 个）和 Tailwind 调色板表
- HEX/RGB/HSL 互转算法内置
- 生成色块预览：构造 1x1 像素 data URI PNG
- 无需 Rust 后端，无需特殊权限

**设置项：**
- `prefix`：前缀，默认 `cc`
- `default_format`：默认复制格式，select 类型，选项 HEX/RGB/HSL，默认 HEX

---

#### 3. Password Generator（密码生成器）

**目录名：** `password-generator`
**前缀：** `pw`
**全局搜索：** 否（无查询概念，纯生成）
**优先级：** 50

**功能：**
- 默认行为（输入为空或仅前缀）：生成多种风格的密码各一条，长度使用设置中的默认值
- 输入数字（如 `20`）：生成指定长度的密码
- 结果列表（每次显示 4-5 条）：
  - 强随机密码（大小写+数字+特殊字符）
  - 字母数字密码（无特殊字符）
  - 纯数字 PIN
  - 可记忆密码（单词组合式，如 `correct-horse-battery`）
  - 十六进制密码（如 token/key 用途）
- 每条结果的 badge 标注类型（Strong / Alphanumeric / PIN / Memorable / Hex）

**交互：**
- 进入模式即生成（空查询也出结果）
- Enter 复制选中密码
- Tab 或特定操作刷新重新生成

**实现要点：**
- 使用 Web Crypto API（`crypto.getRandomValues`）生成安全随机数
- 可记忆密码需内置一个常用英文单词表（200-500 个短词）
- 纯前端 JS，无需后端，无需权限

**设置项：**
- `prefix`：前缀，默认 `pw`
- `default_length`：默认密码长度，number，默认 16，min 4，max 128
- `include_symbols`：强密码是否包含特殊字符，boolean，默认 true

---

#### 4. Timestamp / Date（时间工具）

**目录名：** `timestamp`
**前缀：** `ts`
**全局搜索：** 是（match 检测时间戳/日期特征）
**优先级：** 85

**功能：**
- 空输入或 `now`：显示当前时间的多种格式
  - Unix 时间戳（秒）
  - Unix 时间戳（毫秒）
  - ISO 8601（`2026-03-23T14:30:00+08:00`）
  - 本地格式（`2026年3月23日 14:30:00`）
  - UTC 时间
- 输入纯数字（时间戳）：自动判断秒/毫秒，转换为可读日期
  - 10 位数字视为秒级，13 位视为毫秒级
  - 同时显示本地时间、UTC 时间、ISO 格式
- 输入日期字符串：转换为时间戳
  - 支持常见格式：`2026-03-23`、`2026/03/23 14:30`、`Mar 23 2026`
- 日期差计算：`2026-01-01 to 2026-03-23` 显示天数差、周数、工作日数
- 时区转换：`now in PST`、`now in UTC+9`
- 日历周查询：输入日期显示该日期所在的日历周

**交互：**
- 输入即算，debounce 150ms
- Enter 复制选中行的值
- 空输入时仅在前缀模式下自动刷新当前时间

**match 函数逻辑：**
- 10-13 位纯数字（时间戳）
- 匹配日期格式正则：`YYYY-MM-DD`、`YYYY/MM/DD`
- 输入为 `now`
- 含 `to` 且两侧为日期格式

**实现要点：**
- 纯前端 JS，使用 `Date` API 和 `Intl.DateTimeFormat`
- 时区转换利用 `Intl.DateTimeFormat` 的 `timeZone` 选项
- 内置常见时区别名映射表（PST/EST/CST/JST/CET 等 → IANA 时区名）
- 无需后端，无需权限

**设置项：**
- `prefix`：前缀，默认 `ts`
- `default_timezone`：默认显示的额外时区，string，默认空（仅本地+UTC）

---

#### 5. URL Opener（URL 快开）

**目录名：** `url-opener`
**前缀：** 无（纯靠全局搜索 match 检测）
**全局搜索：** 是（match 检测 URL 特征）
**优先级：** 95（用户输入 URL 意图明确，应最先展示）

**功能：**
- 识别用户输入的网络地址，提供快速打开选项
- 支持识别的格式：
  - 完整 URL：`http://example.com`、`https://example.com/path?q=1`
  - www 开头：`www.example.com`
  - 域名格式：`example.com`、`sub.example.com`（含 `.` 且后缀为已知 TLD）
  - 本地地址：`localhost:3000`、`127.0.0.1:8080`
  - 特殊协议：`mailto:` 链接
- 结果列表：
  - 主结果：「在浏览器中打开」— 显示完整 URL，badge 为 "Open"
  - 辅助结果：「复制链接」— 复制标准化后的 URL
  - 如果是纯域名输入（无协议），自动补全为 `https://`

**交互：**
- Enter 用默认浏览器打开链接
- Ctrl+Enter 复制 URL

**match 函数逻辑：**
- 以 `http://` 或 `https://` 开头
- 以 `www.` 开头
- 匹配 `xxx.yyy` 格式且 `yyy` 为已知 TLD（内置约 50-100 个常见 TLD）
- 匹配 `localhost` 或 `127.0.0.1` 开头（含可选端口）
- 以 `mailto:` 开头

**实现要点：**
- 纯前端 JS
- 内置常见 TLD 列表，避免误匹配普通文本
- 使用 Tauri 的 shell open API 打开浏览器
- 无需 Rust 后端

**设置项：**
- `default_action`：Enter 默认行为，select，选项 open / copy，默认 open

---

#### 6. Web Search（网页搜索）

**目录名：** `web-search`
**前缀：** `??`
**全局搜索：** 否（任何文本都能搜索，噪音大）
**优先级：** 50

**功能：**
- 使用默认或配置的搜索引擎在浏览器中搜索
- 空输入时：直接打开搜索引擎首页
- 有输入时：构造搜索 URL 并打开浏览器
- 支持多搜索引擎，结果列表同时显示多个引擎选项：
  - Google：`https://www.google.com/search?q={query}`
  - Bing：`https://www.bing.com/search?q={query}`
  - Baidu：`https://www.baidu.com/s?wd={query}`
  - DuckDuckGo：`https://duckduckgo.com/?q={query}`
  - GitHub：`https://github.com/search?q={query}`
  - Stack Overflow：`https://stackoverflow.com/search?q={query}`
- 每条结果 badge 显示搜索引擎名称

**交互：**
- Enter 用默认浏览器打开搜索结果页
- Ctrl+Enter 复制搜索 URL

**实现要点：**
- 纯前端 JS
- 搜索引擎 URL 模板内置，query 部分做 `encodeURIComponent` 编码
- 使用 Tauri 的 shell open API 打开浏览器
- 无需 Rust 后端

**设置项：**
- `prefix`：前缀，默认 `??`
- `engines`：启用的搜索引擎列表，array 类型，item_type select，选项 Google/Bing/Baidu/DuckDuckGo/GitHub/StackOverflow，默认 Google + Bing
- `default_engine`：默认搜索引擎（Enter 直接使用），select，默认 Google

---

#### 7. History（历史记录）

**目录名：** `history`
**前缀：** `!!`
**全局搜索：** 否（专用回溯场景）
**优先级：** 50

**功能：**
- 搜索之前在 Spotlight 中选择过的结果
- 空输入时：显示最近的历史记录（按时间倒序）
- 有输入时：模糊匹配历史记录的标题和 subtitle
- 结果显示：原始标题 + 原始 subtitle + 来源模式（badge）+ 选择时间
- 选择历史条目时，执行与原始模式相同的操作（重新触发原模式的 onSelect）

**交互：**
- Enter 重新执行该历史结果的原始操作（打开应用/粘贴剪贴板/打开链接等）
- Ctrl+Enter 复制结果标题文本
- Shift+Enter 从历史记录中移除该条目

**依赖宿主功能：**
- 需要阶段一中实现的历史记录存储系统
- 通过 `api.invokeBackend("get_spotlight_history", { query, limit })` 查询
- 通过 `api.invokeBackend("remove_spotlight_history", { id })` 删除单条
- 通过 `api.invokeBackend("clear_spotlight_history")` 清空全部

**历史记录条目结构：**
- `id`：唯一标识
- `title`：原始结果标题
- `subtitle`：原始结果 subtitle
- `mode_id`：来源模式 ID
- `mode_name`：来源模式显示名
- `original_result_id`：原始结果 ID（用于重新执行 onSelect）
- `query`：原始搜索查询
- `timestamp`：选择时间

**实现要点：**
- 纯前端 JS（历史数据存储在宿主侧）
- 重新执行操作时，找到对应模式并调用其 onSelect
- 如果原始模式已卸载或不可用，降级为复制标题文本
- 无需 Rust 后端

**设置项：**
- `prefix`：前缀，默认 `!!`
- `max_history`：最大历史记录数，number，默认 200，min 10，max 1000

---

### 第二批：需要 Rust 后端的插件

#### 8. Browser Bookmarks（浏览器书签搜索）

**目录名：** `browser-bookmarks`
**前缀：** `bm`
**全局搜索：** 是（始终参与，无 match 函数）
**优先级：** 60

**功能：**
- 搜索本地浏览器书签，支持 Chrome、Edge、Firefox、Brave、Arc
- 模糊匹配书签标题和 URL
- 结果显示：标题 + URL（subtitle）+ 浏览器来源（badge）+ 文件夹路径
- 支持多个浏览器的书签合并搜索

**交互：**
- 输入关键词搜索，debounce 150ms
- Enter 用默认浏览器打开链接
- Ctrl+Enter 复制 URL
- Shift+Enter 复制 Markdown 格式 `[title](url)`

**Rust 后端职责：**
- 定位各浏览器书签文件路径
  - Chrome/Edge/Brave：`%LOCALAPPDATA%/{Browser}/User Data/Default/Bookmarks`（JSON）
  - Firefox：`%APPDATA%/Mozilla/Firefox/Profiles/*/places.sqlite`（SQLite）
- 解析书签文件，提取标题、URL、文件夹层级
- 提供 `search_bookmarks` 命令，接收 query 参数，返回匹配结果
- 缓存书签数据，启动时加载，定时刷新

**权限：** `filesystem:read`

**设置项：**
- `prefix`：前缀，默认 `bm`
- `browsers`：启用的浏览器列表，array 类型，item_type select，选项 Chrome/Edge/Firefox/Brave/Arc，默认全选
- `max_results`：最大结果数，number，默认 20
- `cache_ttl`：缓存刷新间隔（分钟），number，默认 5

---

#### 9. System Info（系统信息）

**目录名：** `system-info`
**前缀：** `si`
**全局搜索：** 否（无查询概念，直接展示系统状态）
**优先级：** 50

**功能：**
- 空输入：显示系统概览
  - CPU 使用率 + 型号
  - 内存使用（已用/总量 + 百分比）
  - 各磁盘分区使用情况
  - 系统运行时间（uptime）
  - 操作系统版本
  - 当前用户名 + 主机名
- 输入 `cpu`：CPU 详细信息（核心数、频率、各核心使用率）
- 输入 `mem` / `memory`：内存详情（物理内存、虚拟内存、swap）
- 输入 `disk`：各分区详情（总容量、已用、可用、文件系统类型）
- 输入 `net` / `network`：网络接口列表（名称、IP、MAC、速度）
- 输入 `proc` / `process`：按 CPU/内存排序的 Top 进程列表

**交互：**
- Enter 复制选中信息文本
- 概览模式自动刷新（每 2 秒）

**Rust 后端职责：**
- 使用 `sysinfo` crate 获取系统信息
- 提供 `get_system_overview`、`get_cpu_detail`、`get_memory_detail`、`get_disk_detail`、`get_network_detail`、`get_top_processes` 命令
- 进程列表返回 Top 10，包含 PID、名称、CPU%、内存使用

**权限：** 无特殊权限

**设置项：**
- `prefix`：前缀，默认 `si`
- `refresh_interval`：自动刷新间隔（秒），number，默认 2，min 1，max 10

---

#### 10. IP / Network Info（网络信息）

**目录名：** `network-info`
**前缀：** `ip`
**全局搜索：** 是（match 检测 IP/域名特征）
**优先级：** 70

**功能：**
- 空输入或 `ip`：显示本机网络信息（内网 IP、公网 IP、网关、DNS）
- 输入域名（如 `google.com`）：DNS 解析（A/AAAA/CNAME + 耗时）
- 输入 IP 地址（如 `8.8.8.8`）：IP 归属地查询（国家/城市/ISP）
- 输入 `ping <host>`：连通性测试，显示延迟

**交互：**
- Enter 复制选中信息
- 公网 IP 查询异步加载，先显示本地信息

**match 函数逻辑：**
- IPv4 格式（`x.x.x.x`，四段数字）
- `ping ` 开头

注意：域名格式与 URL Opener 的 match 有重叠。区别是 URL Opener 提供"打开浏览器"操作，Network Info 提供"DNS 解析"操作，两者可同时出现在全局搜索结果中，各展示各的功能。

**Rust 后端职责：**
- 使用系统 API 获取网卡列表、IP、网关、DNS
- DNS 解析：使用 `hickory-resolver`
- 公网 IP / IP 归属地：通过 host VTable 的 `http_request` 调用外部 API
- Ping：使用系统 ping 命令

**权限：** `network:request`

**设置项：**
- `prefix`：前缀，默认 `ip`
- `public_ip_api`：公网 IP 查询 API，select，选项 `ip-api.com` / `ipinfo.io` / `ifconfig.me`
- `show_ipv6`：是否显示 IPv6，boolean，默认 true

---

### 第三批：需要外部 API 的插件

#### 11. GitHub Quick Search（GitHub 搜索）

**目录名：** `github-search`
**前缀：** `gh`
**全局搜索：** 否（网络请求慢，仅前缀触发）
**优先级：** 50

**功能：**
- 搜索 GitHub 仓库：输入关键词，搜索仓库名和描述
  - 结果显示：仓库全名（owner/repo）、描述（subtitle）、Star 数（badge）、语言
- 搜索用户/组织：输入 `@username`
- 搜索当前用户的仓库：输入 `my` 或空输入（需配置 token）
- 搜索 Issues/PR：输入 `owner/repo#` 列出该仓库的 issues
- 趋势仓库：输入 `trending` 显示今日趋势仓库

**交互：**
- Enter 用默认浏览器打开 GitHub 页面
- Ctrl+Enter 复制仓库 URL
- Shift+Enter 复制 clone 命令（`git clone ...`）

**Rust 后端职责：**
- 通过 host VTable 的 `http_request` 调用 GitHub REST API
- 搜索仓库、用户仓库、Issues 等端点
- 支持可选 Personal Access Token 认证

**权限：** `network:request`

**设置项：**
- `prefix`：前缀，默认 `gh`
- `github_token`：GitHub PAT，string，可选
- `max_results`：最大结果数，number，默认 10
- `default_action`：Enter 默认行为，select，选项 open / copy，默认 open

---

## 前缀汇总

| 插件 | 前缀 | 全局搜索 | 优先级 |
|------|------|----------|--------|
| 剪贴板（内置） | — | 是 | 80 |
| 应用启动（内置） | — | 是 | 90 |
| 翻译（内置） | `tt` | 否 | 50 |
| Everything Search | `f` | 是 | 70 |
| IDE Projects | `\|` | 是 | 65 |
| Calculator | `=` | 是（match） | 95 |
| Color Toolbox | `cc` | 是（match） | 90 |
| Password Generator | `pw` | 否 | 50 |
| Timestamp | `ts` | 是（match） | 85 |
| URL Opener | — | 是（match） | 95 |
| Web Search | `??` | 否 | 50 |
| History | `!!` | 否 | 50 |
| Browser Bookmarks | `bm` | 是 | 60 |
| System Info | `si` | 否 | 50 |
| Network Info | `ip` | 是（match） | 70 |
| GitHub Search | `gh` | 否 | 50 |

---

## 依赖和技术选型

### 阶段一（宿主重构）
- 仅修改 TypeScript 代码和 Rust 命令（历史记录存储），无新前端依赖
- 前端改动范围：`spotlight/types.ts`、`stores/spotlightStore.ts`、`pages/SpotlightPanel.tsx`、`plugin_system/types.ts`、`plugin_system/api.ts`、`plugin_system/loader.ts`
- Rust 改动范围：新增 `spotlight_history` 相关命令（commands/spotlight_cmd.rs）、数据库 migration
- 已有内置模式（clipboard/app/translate）适配新接口

### 阶段二 — 第一批（纯前端）
- 不引入外部依赖，所有逻辑内置于 `frontend/index.js`
- Calculator 的表达式解析使用手写递归下降解析器或 Shunting-yard 算法
- 密码生成使用 Web Crypto API

### 阶段二 — 第二批（Rust 后端）
- Browser Bookmarks：`serde_json`（Chrome/Edge JSON）、`rusqlite`（Firefox SQLite）
- System Info：`sysinfo` crate
- Network Info：`hickory-resolver`（DNS 解析）

### 阶段二 — 第三批
- GitHub Search：无额外 Rust 依赖，通过 host VTable 的 `http_request` 发起 HTTP 请求
