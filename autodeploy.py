"""
Minimal GitHub webhook receiver for auto-deploy.
Runs on port 9000. When it receives a push to main, it pulls and restarts.

APP_DIR must match the clone path on the server (default ~/equilima).

Setup: nohup python3 autodeploy.py &
GitHub webhook URL: http://<your-ip>:9000/webhook
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import subprocess
import json
import os

APP_DIR = os.path.expanduser("~/equilima")
PORT = 9000


class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/webhook":
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            payload = json.loads(body)
            ref = payload.get("ref", "")
            if ref != "refs/heads/main":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"Ignored: not main branch")
                return
        except Exception:
            pass

        # Deploy
        print("=== Webhook received, deploying... ===")
        try:
            # Pull
            subprocess.run(["git", "pull", "origin", "main"], cwd=APP_DIR, check=True)
            # Rebuild frontend
            subprocess.run(["npm", "run", "build"], cwd=os.path.join(APP_DIR, "frontend"), check=True)
            # Restart backend using the start script (which sources env vars)
            subprocess.run(["screen", "-S", "equilima", "-X", "quit"], check=False)
            import time; time.sleep(2)
            subprocess.run(["screen", "-dmS", "equilima", os.path.expanduser("~/start_equilima.sh")], check=True)
            print("=== Deploy successful ===")
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Deployed successfully")
        except Exception as e:
            print(f"Deploy failed: {e}")
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"Deploy failed: {e}".encode())

    def log_message(self, format, *args):
        print(f"[webhook] {args[0]}")


if __name__ == "__main__":
    print(f"Webhook listener on port {PORT}")
    HTTPServer(("0.0.0.0", PORT), WebhookHandler).serve_forever()
