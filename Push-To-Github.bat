@echo off
title GitHub Push - Dada Help
color 0A
cd /d "c:\Users\LR MAHAMUD\Desktop\New folder (6)"
echo ===================================================
echo   Pushing Dada-Help project to GitHub...
echo ===================================================
git add .
git commit -m "Fix download failure and update media converter"
git push -u origin main
echo.
echo ===================================================
echo   Done! Push complete! Render will auto deploy.
echo ===================================================
pause
