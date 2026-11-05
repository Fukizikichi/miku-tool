# -*- mode: python ; coding: utf-8 -*-
import os
import sys
import imageio_ffmpeg

ffmpeg_bin_dir = os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())

a = Analysis(
    ['engine/api.py'],
    pathex=[],
    datas=[(os.path.join(ffmpeg_bin_dir, '*'), 'imageio_ffmpeg/binaries')],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops.auto',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan.on',
        'engineio.async_drivers.threading',
        'websockets',
        'syncedlyrics',
        'spotipy',
        'mutagen',
        'librespot',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='miku-engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['public/miku-icon.ico'],
)
