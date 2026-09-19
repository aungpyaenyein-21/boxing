# dev server with no-cache headers — browser module caching bit us once already
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

ThreadingHTTPServer(('', 8788), H).serve_forever()
