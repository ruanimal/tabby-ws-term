# Tabby WS Term

一个 tabby 插件，用于连接 云厂商 k8s 的 web terminal （xterm.js） 的 ws shell 连接.
连接后，可以像使用 tabby 原生tab 一样使用。

- 暂时不用考虑额外的认证，认证信息由 ws 的参数传递
- 使用 pnpm 管理依赖
- ws url 示例： `wss://opm.pupuvip.com/k8sexec?namespace=qa&pod=dify-api-worker-6bdb4b9f9d-59mw2&container=dify-api-worker&ns=qa&type=share&shell=normal&authorization=<token>`

# 参考
- [tabby源码](./tabby.link)
