@echo off
echo Setting up git repository...
git init
git config user.name "FatFox Offline Builder"
git config user.email "fatfox-offline@example.com"

echo Adding all files...
git add .

echo Committing changes...
git commit -m "Initial commit: Setup Wizard UI and API enhancements for offline EXE"

echo Setting remote origin...
git remote add origin https://github.com/Gagan-k0/fatfox-exe-offline.git

echo Pushing to main branch...
git push -u origin main

echo Done!
pause