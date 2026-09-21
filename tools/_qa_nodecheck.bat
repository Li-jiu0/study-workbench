@echo off
set NODE=C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe
set ROOT=D:/下载的文件/学习工作台/assets
set OUT=D:/下载的文件/学习工作台/tools/_qa_report_nodecheck.txt
del "%OUT%" 2>nul
for %%f in (xt-moments.js xt-profile.js api.js chat-local.js ai-page.js ai-service.js ai-settings.js ai-config.js) do (
  "%NODE%" --check "%ROOT%/%%f" >nul 2>"%TEMP%/_qa_err.txt"
  if errorlevel 1 (
    echo FAIL %%f >>"%OUT%"
    type "%TEMP%/_qa_err.txt" >>"%OUT%"
  ) else (
    echo PASS %%f RC=0 >>"%OUT%"
  )
)
echo done >>"%OUT%"
