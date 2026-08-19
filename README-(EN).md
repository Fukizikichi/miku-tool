Miku Tool

A desktop application that makes it easy to download media from platforms like YouTube and Spotify.

Why I Built It

Downloading mp3/mp4 files from platforms like YouTube and Spotify is usually either locked behind paid services or requires tedious workarounds. I built this app to make it simple for myself.

Tech Stack
Frontend: Node.js, Vite, React
Backend: Python, PyInstaller
Features
Download media from platforms like YouTube and Spotify
Simple, user-friendly interface
Packaged as a standalone executable (backend bundled with PyInstaller)
A Challenge I Ran Into

During development, I noticed that Spotify API credentials had accidentally been included in the repo. I rotated the credentials (invalidated the old keys and generated new ones) and fixed the .gitignore file so sensitive information would never be committed again. This experience made me a lot more careful about credential and secrets management from the start of a project.

How to Run
bash
# Clone the repo
git clone https://github.com/Fukizikichi/miku-tool.git
cd miku-tool

# Install frontend dependencies
npm install

# Run in development mode
npm run dev

Note: Python and its required dependencies must be installed for the backend to work.

This is a personal learning/development project. Feedback and suggestions are welcome.

License
Shared for personal use.
