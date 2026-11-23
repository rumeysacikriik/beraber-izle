import os
import re
from urllib.parse import quote
import requests
import urllib3
import yt_dlp
import cloudscraper
from flask import Flask, request, jsonify, Response
from flask_cors import CORS

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)
CORS(app)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
}

# Cloudflare korumasını aşan özel tarayıcı nesnesi
scraper = cloudscraper.create_scraper(
    browser={'browser': 'chrome', 'platform': 'windows', 'mobile': False}
)

def get_base_url():
    """Bulut (HTTPS) veya yerel (HTTP) sunucu adresini dinamik olarak alır."""
    scheme = request.headers.get('X-Forwarded-Proto', request.scheme)
    return f"{scheme}://{request.host}"

def pick_best_combined_stream(info):
    """yt-dlp'nin bulduğu formatlar içinden hem ses hem görüntü içeren en iyi akışı seçer."""
    if info.get('url'):
        return info['url'], info.get('ext', 'mp4')

    formats = info.get('formats') or []
    combined_mp4 = [
        f for f in formats
        if f.get('url') and f.get('vcodec') != 'none' and f.get('acodec') != 'none' and f.get('ext') == 'mp4'
    ]
    if combined_mp4:
        return combined_mp4[-1]['url'], 'mp4'

    combined_any = [
        f for f in formats
        if f.get('url') and f.get('vcodec') != 'none' and f.get('acodec') != 'none'
    ]
    if combined_any:
        best = combined_any[-1]
        return best['url'], best.get('ext', 'mp4')

    valid_urls = [f for f in formats if f.get('url')]
    if valid_urls:
        best = valid_urls[-1]
        return best['url'], best.get('ext', 'mp4')

    return None, None

def extract_from_html_page(page_url):
    """Cloudflare korumalı dizi sitelerinin içindeki gerçek video kaynağını veya iframe'i bulur."""
    try:
        r = scraper.get(page_url, headers=HEADERS, timeout=15)
        html = r.text

        m3u8_match = re.search(r'(https?://[^\s"\'<>\\]+?\.m3u8[^\s"\'<>\\]*)', html)
        if m3u8_match:
            return m3u8_match.group(1).replace('\\/', '/')

        iframes = re.findall(r'<iframe[^>]+(?:src|data-src)=["\']([^"\']+)["\']', html, re.I)
        for src in iframes:
            if any(bad in src.lower() for bad in ['google', 'facebook', 'disqus', 'ads', 'analytics', 'youtube.com/embed/?']):
                continue
            if src.startswith('//'):
                src = 'https:' + src
            return src
    except Exception as e:
        print("HTML/Cloudscraper tarama hatası:", e)
    return None

@app.route('/', methods=['GET'])
def health_check():
    """player.js'in sunucunun aktif olduğunu anlaması için kontrol noktası."""
    return jsonify({'status': 'ok', 'message': 'Video çözücü sunucu aktif'}), 200

@app.route('/proxy_stream')
def proxy_stream():
    """403 engellerini aşmak için videoyu ileri-geri sarmalı (Range destekli) aktarır."""
    stream_url = request.args.get('url', '')
    if not stream_url:
        return "URL eksik", 400

    req_headers = {'User-Agent': HEADERS['User-Agent']}
    if 'Range' in request.headers:
        req_headers['Range'] = request.headers['Range']

    r = requests.get(stream_url, headers=req_headers, stream=True, verify=False, timeout=15)
    excluded = ['content-encoding', 'transfer-encoding', 'connection']
    resp_headers = [(k, v) for k, v in r.raw.headers.items() if k.lower() not in excluded]

    return Response(
        r.iter_content(chunk_size=64 * 1024),
        status=r.status_code,
        headers=resp_headers,
        content_type=r.headers.get('Content-Type', 'video/mp4')
    )

@app.route('/extract', methods=['GET'])
def extract_video():
    raw_url = request.args.get('url', '').strip()
    url_match = re.search(r'(https?://[^\s\]\)"\'<>]+)', raw_url)
    target_url = url_match.group(1) if url_match else raw_url

    if not target_url:
        return jsonify({'error': 'URL boş'}), 400

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'geo_bypass': True,
        'nocheckcertificate': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'ios', 'web']
            }
        }
    }

    base_url = get_base_url()

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(target_url, download=False)
            if 'entries' in info and len(info['entries']) > 0:
                info = info['entries'][0]

            stream_url, ext = pick_best_combined_stream(info)
            if stream_url:
                is_hls = '.m3u8' in stream_url or ext == 'm3u8'
                final_url = stream_url if is_hls else f"{base_url}/proxy_stream?url={quote(stream_url, safe='')}"

                return jsonify({
                    'success': True,
                    'streamUrl': final_url,
                    'title': info.get('title', 'Video'),
                    'type': 'hls' if is_hls else 'mp4'
                })
    except Exception as e:
        print("yt-dlp doğrudan çözemedi, alt oynatıcı aranıyor:", e)

    embedded_url = extract_from_html_page(target_url)
    if embedded_url:
        if '.m3u8' in embedded_url or '.mp4' in embedded_url:
            return jsonify({
                'success': True,
                'streamUrl': embedded_url,
                'title': 'Dizi Akışı',
                'type': 'hls' if '.m3u8' in embedded_url else 'mp4'
            })
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(embedded_url, download=False)
                stream_url, ext = pick_best_combined_stream(info)
                if stream_url:
                    is_hls = '.m3u8' in stream_url or ext == 'm3u8'
                    return jsonify({
                        'success': True,
                        'streamUrl': stream_url,
                        'title': info.get('title', 'Dizi Bölümü'),
                        'type': 'hls' if is_hls else 'mp4'
                    })
        except Exception:
            return jsonify({
                'success': True,
                'streamUrl': embedded_url,
                'title': 'Gömülü Oynatıcı',
                'type': 'iframe'
            })

    return jsonify({'success': False, 'error': 'Video akışı çözümlenemedi.'}), 422

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)