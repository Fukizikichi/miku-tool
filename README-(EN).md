# 🎵 Miku Tool

<p align="left">
  <a href="README-(EN).md"><b>English</b></a> •
  <a href="README-(TR).md">Türkçe</a>
</p>

A modern desktop application that makes it easy to download media from platforms like YouTube, Spotify, and more.

---

## 💡 Why I Built It

Downloading mp3/mp4 files from platforms like YouTube and Spotify is usually either locked behind paid services or requires tedious workarounds. I built this app to make it simple and convenient for myself.

## 🛠️ Tech Stack

- **Frontend:** Node.js, Electron, Vite, React, Tailwind CSS, Framer Motion
- **Backend:** Python (FastAPI, yt-dlp, Librespot), PyInstaller

## ✨ Features

- Download media from platforms like YouTube, Spotify, Pinterest, Instagram, etc.
- Direct Spotify downloading with smart fallback matching
- Automatic synchronized lyrics (LRC) and ID3 album art tagging
- Simple, aesthetic, and user-friendly interface (Hatsune Miku themed)
- Standalone executable backend (`miku-engine.exe`) and portable packaging

## 🔒 A Challenge I Ran Into

During development, I noticed that Spotify API credentials had accidentally been included in the repo. I rotated the credentials (invalidated the old keys and generated new ones) and fixed the `.gitignore` file so sensitive information would never be committed again. This experience made me a lot more careful about credential and secrets management from the start of a project.

## 🚀 How to Run

```bash
# Clone the repo
git clone https://github.com/Fukizikichi/miku-tool.git
cd miku-tool

# Install frontend dependencies
npm install

# Setup Python virtual environment & backend dependencies
python -m venv venv
venv\Scripts\pip install -r requirements.txt

# Run in development mode
npm run dev
```

> **Tip (Windows):** You can also run `start.cmd` to automatically manage setup, build, and launch tasks.

---

This is a personal learning/development project. Feedback and suggestions are welcome.

## 📜 License

Shared for personal use.
