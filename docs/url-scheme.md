分析结果：Tabby 自定义 URL Scheme 支持
根据我的研究，这是关于 Tabby 通过链接唤起的分析：

🔍 当前状态
Tabby 目前不原生支持自定义 URL scheme（如 tabby://），但这是一个被社区请求的功能。以下是关键发现：

GitHub Issues: 社区已有多个 feature request 希望 Tabby 能作为 ssh:// 和 telnet:// 的协议处理器
源码分析: Tabby 的主进程代码 (app.ts) 中有 handleSecondInstance 方法处理二次实例，但没有看到 setAsDefaultProtocolClient 的调用
✅ 技术可行性
从 Electron 角度来看，实现是完全可行的：

平台	实现方式
macOS	app.setAsDefaultProtocolClient('tabby') + 监听 open-url 事件 + 在 Info.plist 声明协议
Windows	app.setAsDefaultProtocolClient('tabby') + 监听 second-instance 事件
Linux	app.setAsDefaultProtocolClient('tabby') + 需要 .desktop 文件配置
🛠️ 实现方案
如果要为你的 ws-term 插件支持 URL scheme 唤起，有两种路径：

方案 1：向 Tabby 主仓库提 PR (推荐)
在 app/lib/app.ts 中添加：

typescript
// 注册协议处理器
app.setAsDefaultProtocolClient('tabby')
// macOS: 监听 open-url 事件
app.on('open-url', (event, url) => {
    event.preventDefault()
    this.handleDeepLink(url)
})
// Windows/Linux: 在 second-instance 事件中处理
app.on('second-instance', (event, argv, cwd) => {
    const url = argv.find(arg => arg.startsWith('tabby://'))
    if (url) this.handleDeepLink(url)
})
URL 格式可以设计为：

tabby://ws-term?url=wss://your-server/exec&namespace=default&pod=my-pod
方案 2：使用现有 CLI 机制
Tabby 已有 CLIHandler API，你的插件可以实现一个 CLI handler 来处理参数：

bash
tabby --profile "ws-term:template" --options '{"wsUrl":"wss://..."}'
然后用操作系统的方式（如 macOS 的 AppleScript 或 Automator）将自定义 URL 转换为命令行调用。

📋 下一步建议
短期: 使用 CLI 方式，结合操作系统脚本实现 URL-to-CLI 转换
长期: 向 Eugeny/tabby 提交 PR 添加 tabby:// 协议支持，这将惠及整个社区
