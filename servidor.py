from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import json
import urllib.request
import urllib.error

BASE = Path(__file__).resolve().parent
os.chdir(BASE)

# URL de tu Web App de Google Sheets
SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbxtUrRMiDngaZi9hKMVpgPB-5E-OZw1_vVFo0amZbXR-ZXpaVu7C-4fTg1rv67FZEWsmQ/exec"

def load_api_key():
    env_file = BASE / ".env"
    if not env_file.exists():
        return os.environ.get("GEMINI_API_KEY", "")

    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""

class Handler(SimpleHTTPRequestHandler):

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        # Proxy para leer las clases desde Google Sheets
        if self.path == "/api/docs":
            try:
                req = urllib.request.Request(SHEETS_API_URL, method="GET")
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return
        super().do_GET()

    def do_POST(self):
        # Proxy para guardar documentos o lecciones en Google Sheets
        if self.path == "/api/sheets":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body_data = self.rfile.read(length)
                
                req = urllib.request.Request(
                    SHEETS_API_URL,
                    data=body_data,
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    result_data = resp.read()
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(result_data)))
                self.end_headers()
                self.wfile.write(result_data)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return

        # Generación de contenido con Gemini
        if self.path != "/api/generate":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 2000000:
                self.send_json({"error": "Petición vacía o demasiado grande."}, 400)
                return

            data = json.loads(self.rfile.read(length).decode("utf-8"))
            prompt = str(data.get("prompt", "")).strip()

            if not prompt:
                self.send_json({"error": "No se ha recibido ninguna instrucción."}, 400)
                return

            api_key = load_api_key()
            if not api_key:
                self.send_json({"error": "Falta configurar la clave API de Gemini."}, 400)
                return

            request_data = {
                "contents": [{"parts": [{"text": prompt}]}]
            }

            url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"

            request = urllib.request.Request(
                url,
                data=json.dumps(request_data).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": api_key
                },
                method="POST"
            )

            with urllib.request.urlopen(request, timeout=120) as response:
                result = json.loads(response.read().decode("utf-8"))

            answer = result["candidates"][0]["content"]["parts"][0]["text"]
            self.send_json({"text": answer})

        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            self.send_json({"error": "Gemini ha devuelto un error: " + details[:1200]}, 502)
        except Exception as error:
            self.send_json({"error": str(error)}, 500)

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"MY ENGLISH ACADEMY corriendo en puerto {port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
