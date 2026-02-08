#!/usr/bin/env python3
"""Shared utilities for DGS fetching scripts."""

import json
import urllib.error
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup

BASE_URL = "https://signdict.org"
DATA_DIR = Path("server/data/dgs_video_examples")
MANIFEST_PATH = Path("server/data/dgs_manifest.json")
FALLBACK_LABEL_URLS = {
    "alle": ["https://dw-dgs.de/static/videos/alle.mp4"],
    "blau": ["https://dw-dgs.de/static/videos/blau.mp4"],
    "essen": ["https://dw-dgs.de/static/videos/essen.mp4"],
    "fertig": ["https://dw-dgs.de/static/videos/fertig.mp4"],
    "gelb": ["https://dw-dgs.de/static/videos/gelb.mp4"],
    "gruen": ["https://dw-dgs.de/static/videos/gruen.mp4"],
    "nochmal": ["https://dw-dgs.de/static/videos/nochmal.mp4"],
    "rot": ["https://dw-dgs.de/static/videos/rot.mp4"],
    "satt": ["https://dw-dgs.de/static/videos/satt.mp4"],
    "schwester": ["https://dw-dgs.de/static/videos/schwester.mp4"],
    "spielen": ["https://dw-dgs.de/static/videos/spielen.mp4"],
    "trinken": ["https://dw-dgs.de/static/videos/trinken.mp4"],
}

def ensure_dirs():
    """Ensure data directory exists."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

def fetch_url(url):
    """Fetch content from a URL with a browser-like User-Agent."""
    print(f"Fetching {url}...")
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        )
        with urllib.request.urlopen(req) as response:
            return response.read().decode('utf-8')
    except urllib.error.URLError as e:
        print(f"Error fetching {url} (URL error): {e}")
        return None
    except UnicodeDecodeError as e:
        print(f"Error fetching {url} (decode error): {e}")
        return None

def find_entry_url(search_html):
    """Find the first entry URL in search results using BeautifulSoup."""
    if not search_html:
        return None
    soup = BeautifulSoup(search_html, 'html.parser')
    link = soup.find('a', class_='so-search-result--link')
    if link and link.get('href'):
        return BASE_URL + link.get('href')
    return None

def find_video_url_direct(html):
    """Find video URL directly from entry page using BeautifulSoup."""
    if not html:
        return None
    soup = BeautifulSoup(html, 'html.parser')
    
    # 1. Open Graph secure url
    meta_secure = soup.find('meta', property='og:video:secure_url')
    if meta_secure and meta_secure.get('content'):
        return meta_secure.get('content')

    # 2. Open Graph url
    meta_url = soup.find('meta', property='og:video:url')
    if meta_url and meta_url.get('content'):
        return meta_url.get('content')

    # 3. Video tag src
    video_tag = soup.find('video')
    if video_tag and video_tag.get('src'):
        return video_tag.get('src')

    return None

def find_variant_links(html):
    """Find variant links using BeautifulSoup."""
    if not html:
        return []
    soup = BeautifulSoup(html, 'html.parser')
    links = []
    for a in soup.find_all('a', attrs={'aria-label': 'Diese Variante wählen'}):
        if a.get('href'):
            links.append(BASE_URL + a.get('href'))
    return list(set(links))

def download_video(label, video_url, index=None):
    """Download a video file."""
    filename = f"{label}.mp4" if index is None else f"{label}_{index}.mp4"
    output_path = DATA_DIR / filename

    if output_path.exists():
        if output_path.stat().st_size > 1000:
            print(f"  File {filename} already exists. Skipping.")
            return str(filename)

    print(f"  Downloading {label} from {video_url}...")
    try:
        urllib.request.urlretrieve(video_url, output_path)
        print(f"  Downloaded {filename}")
        return str(filename)
    except urllib.error.URLError as e:
        print(f"  Failed to download {filename} (URL error): {e}")
        return None
    except OSError as e:
        print(f"  Failed to download {filename} (file error): {e}")
        return None

def fetch_fallback_videos(label):
    """Download videos from fallback sources (e.g., DW-DGS) for a label."""
    urls = FALLBACK_LABEL_URLS.get(label, [])
    downloaded = []
    for idx, url in enumerate(urls):
        filename = download_video(label, url, f"fallback_{idx}")
        if filename:
            downloaded.append(filename)
    return downloaded

def load_manifest():
    """Load the manifest file safely."""
    if MANIFEST_PATH.exists():
        try:
            with open(MANIFEST_PATH) as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            print(f"Warning: Could not parse manifest file at {MANIFEST_PATH}. Creating new manifest. Error: {e}")
        except OSError as e:
            print(f"Warning: Could not read manifest file at {MANIFEST_PATH}: {e}")
    return {"gestures": []}

def save_manifest(manifest):
    """Save the manifest file."""
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Manifest updated at {MANIFEST_PATH}")
