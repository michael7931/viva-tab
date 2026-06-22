# viva tab JSMod

该脚本注入 Vivaldi 的内部页面，为 `viva tab` 扩展提供工作区和会话归档能力。Vivaldi 没有公开相应扩展 API，因此必须安装此部分。

## 安装（macOS）

先完全退出 Vivaldi，再在本目录执行：

```bash
bash install.sh
```

脚本仅支持默认安装位置 `/Applications/Vivaldi.app`，会请求管理员权限并修改 Vivaldi 的 `window.html`。执行完成后，完全退出并重新打开 Vivaldi。

可在 `vivaldi://inspect/#apps` 中打开 `main.html` 的控制台，运行以下命令验证：

```js
window.vwsBridge.version
```

如果 Vivaldi 升级、重装后扩展无法连接 JSMod，请重新运行安装脚本并重启浏览器。

完整的安装说明、限制和排障信息见项目根目录的 [README](../README.md)。
