import os
import http.server
import socketserver
import urllib.request
import json
import urllib.parse

# Configuración del puerto para Render o local
port = int(os.environ.get("PORT", 10000))
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Redirigir la raíz a index.html o servir archivos estáticos
        if self.path == '/':
            self.path = '/index.html'
        return super().do_GET()

    def do_POST(self):
        # Endpoint para generar contenido con IA y registrar en Google Sheets
        if self.path == '/api/generar':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                prompt_usuario = data.get('prompt', 'Lección de inglés')

                # Llamada directa a la API de Gemini (Vertex / Generative Language API)
                api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
                
                payload = {
                    "contents": [{
                        "parts": [{"text": f"Actúa como un profesor experto de inglés. Crea una lección estructurada, clara y útil basada en esto: {prompt_usuario}"}]
                    }]
                }

                req = urllib.request.Request(
                    api_url,
                    data=json.dumps(payload).encode('utf-8'),
                    headers={'Content-Type': 'application/json'}
                )

                with urllib.request.urlopen(req) as response:
                    res_data = json.loads(response.read().decode('utf-8'))
                    # Extraer la respuesta de la IA
                    texto_ia = res_data['candidates'][0]['content']['parts'][0]['text']

                # Enviar respuesta de éxito al cliente
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                
                respuesta_final = json.dumps({"status": "success", "content": texto_ia}, ensure_ascii=False)
                self.wfile.write(respuesta_final.encode('utf-8'))

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                error_msg = json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False)
                self.wfile.write(error_msg.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

# Iniciar servidor
class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

print(f"Iniciando servidor en puerto {port}...")
with ThreadingHTTPServer(("0.0.0.0", port), Handler) as httpd:
    httpd.serve_forever()