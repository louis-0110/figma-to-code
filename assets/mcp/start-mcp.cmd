@echo off
rem TalkToFigma MCP 自愈启动器(路径自适应版,可在任意机器/路径使用):
rem 1) 后台拉起 3055 桥接(已在运行则桥接进程自动退出,幂等)
rem 2) 前台运行 MCP stdio server
rem node 查找顺序:PATH → fnm 默认安装目录
setlocal
where node >nul 2>nul && set "NODE=node" || set "NODE=%USERPROFILE%\AppData\Roaming\fnm\node-versions\v22.22.3\installation\node.exe"
set "BASE=%~dp0"
start "" /b "%NODE%" "%BASE%socket-node.cjs" > "%TEMP%\figma-socket.log" 2>&1
"%NODE%" "%BASE%dist\server.js"
