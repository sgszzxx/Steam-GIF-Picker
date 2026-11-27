# 参与开发

请先通过 Issue 描述问题或建议，并与维护者确认代码使用授权。当前未选择开源许可证。

## 本地测试

安装 Node.js 22+，在仓库根目录执行：

```sh
node tools/run-node-tests.cjs
```

浏览器回归需要 Python、Playwright、Pillow 与 Chromium：

```sh
python -m pip install -r tools/test-requirements.txt
python -m playwright install chromium
```

Linux 下设置 `CHROMIUM` 为本地 Chromium 的可执行文件路径，或 Playwright 安装的浏览器路径，然后执行 `python steam-gif-picker/test/browser-nearby-title-regression.py` 等测试。PowerShell 可用 `$env:CHROMIUM = 'C:\path\to\chrome.exe'`。所有模拟测试不发送真实 Steam 消息。

提交前保持单次发送、目标会话检查、数据源与 CDN 权限边界；不要引入 API Key、私钥或真实聊天截图。更新 CHANGELOG 并注明本地测试与实机测试的区别。正式签名由维护者离线执行，见 docs/打包与签名.md。
