# environment.md — Figma MCP / REST token 环境配置

> 分层原则:**Skill 带工具与约定,环境带秘密与服务**。SKILL.md 只保留一句"先跑 doctor";诊断细节在这里。

## REST token

三级查找链(脚本自动走,不要硬编码):

1. `FIGMA_TOKEN` 环境变量
2. `~/.secrets/figma`(机器级,跨项目一次配置)
3. 项目 `.secrets/env`(`FIGMA_TOKEN=xxx`)

安全规则:
- `.secrets/` 必须在 `.gitignore`
- token 出现过明文的场景要 revoke 轮换
- Skill 目录本身不放 token

## MCP 注册

宿主职责,Skill 不注册。复制 `assets/figma-mcp.example.json` 变体到:
- 项目级:`.mcp.json`
- 全局:`~/.claude.json` mcpServers

**2026-09-07 起 MCP 运行时已内嵌**,运行时仅需 `assets/mcp/`:
- `socket-node.cjs` 桥接(4.5K)
- `dist/server.js` 打包产物(80K)
- `start-mcp.cmd` 启动器
- 共 ~86KB,零 node_modules(上游 tsup 全量打包)

注册指向 `assets/mcp/start-mcp.cmd` 即可。

Figma 插件 manifest 在 `assets/mcp/figma-plugin/manifest.json`(code.js/ui.html 同目录)。

**Figma 重启或目录移动后**:需在 Figma → Plugins → Development → Import plugin from manifest 重新导入,导入后点 Join(频道名以插件面板为准)。

## 运行时诊断

插件掉线的诊断顺序:

1. `get_document_info` 超时即掉线
2. 用户重开 Figma 插件
3. `join_channel`(频道名以插件面板为准)

3055 桥接是否在线由 doctor 探测。

## 新项目/新机器第一步

```bash
node <skill>/assets/doctor.mjs <项目根>
```

按 ✗ 项提示修复。doctor 检查:node 版本、REST token 验真、MCP 注册扫描、3055 桥接探测、工具池完整性。
