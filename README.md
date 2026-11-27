<p align="center"><img src="assets/logo.png" width="96" alt="Steam GIF Picker"></p>
<h1 align="center">Steam GIF Picker</h1>
<p align="center">为 Steam 桌面聊天提供快捷的 GIF 表情包体验</p>
<p align="center"><a href="https://github.com/sgszzxx/Steam-GIF-Picker/releases/latest">下载安装</a> · <a href="docs/安装教程.html">离线图文教程</a> · <a href="https://github.com/sgszzxx/Steam-GIF-Picker/issues">问题反馈</a> · <a href="README.en.md">English</a></p>

当前版本：**v0.1.29** · Windows / Steam 桌面客户端 · Manifest V3

> 独立社区项目，与 Valve、Steam、GifSnap、GIPHY 或 KLIPY 无官方关联。第三方客户端更新可能影响兼容性。

## 功能

- GifSnap 默认免 API Key；可选 GIPHY 数据源（自行申请 Key）。
- 聊天悬浮球、横向滚轮浏览及三列展开、热门和搜索、收藏、搜索历史。
- 点击选中的动图发送到当前聊天，保留原有草稿；失败不自动补发。
- 链接优先、本地 GIF 体积检测、原文件上传、动态 WebP 转 GIF、静态 WebP 转 PNG。
- 精确及有界视觉去重、实际展示位置 ±2 同名过滤、附近媒体预加载。
- 无需本项目自建服务器；使用时仍需连接第三方 API、媒体 CDN 和 Steam。

## 安装（Windows）

1. 从 [Releases](https://github.com/sgszzxx/Steam-GIF-Picker/releases/latest) 下载 `Steam-GIF-Picker-v0.1.29-Release.zip`，不要下载自动生成的 Source code ZIP 用作 CRX 安装。
2. 完整解压，双击 `安装教程.html`，按图操作：Steam 商店任意游戏详情页 → 右键游戏分类/系列等链接 → 在新选项卡中打开链接。
3. 在新标签可编辑地址栏输入 `chrome://extensions/`，开启开发者模式，将 CRX 拖到空白处，核对名称并确认。
4. 重开聊天窗口，点击 GIF 悬浮球。默认 GifSnap 无需申请 Key。

不同 Steam 版本可能拒绝第三方 CRX；不要关闭系统安全防护。更新前保留原扩展及数据，优先使用同签名 ID 的版本。签名 ID：`lokafhlmojloffehiebmdmakjmlgnlaa`。

## 数据源与网络

| | GifSnap（默认） | GIPHY（可选） |
|---|---|---|
| API Key | 当前公开接口无需 Key | 自行申请 |
| 国内访问 | 项目实测可直连，不保证所有地区 | API 可能超时，部分网络需要稳定、合规的国际网络连接 |
| 服务 | 公共接口可用性可能变化 | 遵守 Key 配额与服务条款 |

GIPHY 官网可访问不代表 `api.giphy.com` 可访问。扩展不提供代理；遇到加载失败先使用设置中的「检测网络连接」。参考 [GifSnap 文档](https://gifsnap.com/docs) 与 [GIPHY 文档](https://developers.giphy.com/docs/api/)。

## 兼容与限制

- 2 MB 是可调整的实验性 GIF 链接阈值，不是 Valve 官方限制；外链仍可能无法预览。可右键选择本次作为图片文件发送。
- 原文件及转换输出受本地 8 MiB 上限约束；GIF 格式的颜色数量有限，WebP 转码可能有损。
- 自动附件确认依赖 Steam 界面，无法识别时需手动确认。仅发送你有权使用、转换和重新上传的媒体。
- 邻近同名规则可能隐藏内容不同但同标题的结果；不会影响收藏。
- 开发者测试使用模拟 Steam 页面和媒体；不代表所有真实聊天环境均通过。

## 文档与开发

[更新日志](CHANGELOG.md) · [隐私说明](PRIVACY.md) · [安全报告](SECURITY.md) · [贡献指南](CONTRIBUTING.md) · [技术规格（含历史）](docs/项目需求与技术规格书.md) · [打包签名](docs/打包与签名.md)

运行时目录为 `steam-gif-picker/`，测试位于 `steam-gif-picker/test/`。安装 Node.js 后，在仓库根目录运行 `node tools/run-node-tests.cjs`。CI 不需要 API Key 或签名私钥。

## 授权

当前公开源码未指定开源许可证。请先与维护者确认修改、再分发等授权；第三方服务及媒体遵循各自条款，项目公开不代表获得第三方内容的授权。
