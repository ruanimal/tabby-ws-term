## 加载开发中的插件
pnpm build
WSTERM_DEBUG=1 TABBY_PLUGINS=$(pwd) tabby --debug  # linux
WSTERM_DEBUG=1 TABBY_PLUGINS=$(pwd) /Applications/Tabby.app/Contents/MacOS/Tabby --debug  # macos