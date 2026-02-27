import http.server
import socketserver
import socket

PORT = 8000

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

Handler = http.server.SimpleHTTPRequestHandler
Handler.extensions_map['.js'] = 'application/javascript'

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    local_ip = get_local_ip()
    print(f"\n{'='*60}")
    print(f"服务器已启动！")
    print(f"{'='*60}")
    print(f"\n在电脑上访问: http://localhost:{PORT}")
    print(f"在 iPad 上访问: http://{local_ip}:{PORT}")
    print(f"\n按 Ctrl+C 停止服务器\n")
    print(f"{'='*60}\n")
    httpd.serve_forever()
