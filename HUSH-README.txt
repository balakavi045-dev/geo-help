HUSH - Voiceover Silence Remover

WINDOWS QUICK START
Download this branch using GitHub Code > Download ZIP, then extract it.

1. Install Node.js 24.5 or later from https://nodejs.org if needed.
2. Extract this entire ZIP (do not run it from inside the ZIP).
3. Open the hush folder and double-click START-HUSH.bat.
4. Wait for installation and startup, then open http://localhost:5173.
5. Keep the terminal window open while using Hush.

Manual startup: open a terminal in the hush folder and run:
  npm ci
  npm run dev

Upload your audio, choose silence settings, click Remove silent gaps,
preview the cleaned recording, then download the WAV.
Audio is processed locally in your browser. No API keys are needed.
Internet is needed for the initial dependency installation.
Use a modern Chrome or Edge browser. Supported inputs depend on your browser.

This package includes the updated Hush app and the existing project files.
Opening index.html directly will not start the app: use the startup script.
