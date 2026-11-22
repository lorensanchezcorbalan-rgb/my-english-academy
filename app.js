const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const pdfInput = document.getElementById("pdf");
const list = document.getElementById("list");
const main = document.getElementById("main");

let documentsCache = [];
let pdfjsPromise;

// CARGAR DATOS DESDE GOOGLE SHEETS (A TRAVÉS DEL SERVIDOR)
async function fetchDocuments() {
  try {
    const response = await fetch("/api/docs");
    if (!response.ok) throw new Error("No se han podido cargar las clases.");
    documentsCache = await response.json();
    return documentsCache;
  } catch (error) {
    console.error(error);
    return [];
  }
}

function getDocById(id) {
  return documentsCache.find(doc => String(doc.id) === String(id));
}

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsPromise) return pdfjsPromise;

  pdfjsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PDFJS_URL;

    script.onload = () => {
      if (!window.pdfjsLib) {
        reject(new Error("No se pudo iniciar el lector PDF."));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      resolve(window.pdfjsLib);
    };

    script.onerror = () => reject(
      new Error("No se pudo cargar el lector PDF. Comprueba Internet.")
    );

    document.head.appendChild(script);
  });

  return pdfjsPromise;
}

async function extractPdfText(file) {
  const pdfjs = await loadPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];

  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();

    pages.push(
      content.items.map(item => item.str || "").join(" ")
    );
  }

  return {
    text: pages.join("\n\n"),
    pages: pdf.numPages
  };
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function dateText(timestamp) {
  if (!timestamp) return "";
  return new Date(Number(timestamp)).toLocaleDateString("es-ES");
}

/* FORMATO VISUAL DE LAS LECCIONES */

function inlineFormat(value) {
  return escapeHtml(value)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>");
}

function formatLesson(text) {
  const lines = String(text || "").split(/\r?\n/);
  let html = "";
  let inList = false;
  let sectionNumber = 0;
  let currentSection = "";

  function closeList() {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  }

  function startSection(title) {
    closeList();
    sectionNumber++;
    currentSection = title.toLowerCase();

    html += `
      <section class="lesson-section">
        <div class="lesson-section-heading">
          <span class="lesson-section-number">${sectionNumber}</span>
          <h2>${inlineFormat(title)}</h2>
        </div>
    `;
  }

  function closeSection() {
    closeList();
    if (sectionNumber > 0) {
      html += "</section>";
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "---") {
      closeList();
      continue;
    }

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      const title = heading[1].replace(/\*\*/g, "").trim();
      if (/^\d+[\.\)]/.test(title) || sectionNumber === 0) {
        closeSection();
        startSection(title.replace(/^\d+[\.\)]\s*/, ""));
      } else {
        closeList();
        html += `<h3>${inlineFormat(title)}</h3>`;
      }
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (!inList) {
        html += '<ul class="lesson-list">';
        inList = true;
      }
      const item = bullet[1];
      if (currentSection.includes("vocabulario") || currentSection.includes("vocabulary")) {
        html += `<li class="vocabulary-card">${inlineFormat(item)}</li>`;
      } else {
        html += `<li>${inlineFormat(item)}</li>`;
      }
      continue;
    }

    closeList();
    if (/^\*\*.*\*\*$/.test(line)) {
      html += `<h3>${inlineFormat(line)}</h3>`;
    } else if (/^\*\(/.test(line) || /^\(.*\)$/.test(line)) {
      html += `<p class="lesson-tip">${inlineFormat(line)}</p>`;
    } else {
      html += `<p>${inlineFormat(line)}</p>`;
    }
  }

  closeSection();
  return html;
}

function addLessonStyles() {
  if (document.getElementById("lesson-visual-styles")) return;

  const style = document.createElement("style");
  style.id = "lesson-visual-styles";
  style.textContent = `
    .lesson-content { display: flex; flex-direction: column; gap: 18px; line-height: 1.7; }
    .lesson-section { padding: 22px; border: 1px solid rgba(120, 130, 150, .20); border-radius: 16px; background: var(--card, rgba(128, 128, 128, .05)); }
    .lesson-section-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .lesson-section-heading h2 { margin: 0; font-size: 1.25rem; }
    .lesson-section-number { display: flex; align-items: center; justify-content: center; min-width: 34px; height: 34px; border-radius: 10px; background: rgba(90, 120, 220, .14); font-weight: 700; }
    .lesson-section h3 { margin-top: 20px; margin-bottom: 10px; font-size: 1.05rem; }
    .lesson-section p { margin: 9px 0; }
    .lesson-list { padding-left: 22px; margin: 12px 0; }
    .lesson-list li { padding: 5px 0; }
    .lesson-list .vocabulary-card { margin: 9px 0; padding: 12px 15px; list-style-position: inside; border: 1px solid rgba(120, 130, 150, .20); border-radius: 10px; background: rgba(100, 130, 220, .07); }
    .lesson-tip { padding: 12px 15px; border-left: 4px solid #8298d8; border-radius: 7px; background: rgba(100, 130, 220, .08); }
    .lesson-content > .lesson-section:first-child { margin-top: 0; }
  `;
  document.head.appendChild(style);
}

/* BIBLIOTECA */

async function drawDocuments() {
  const documents = await fetchDocuments();
  const counterElem = document.getElementById("lessons");
  if (counterElem) counterElem.textContent = documents.length;

  if (!list) return;

  if (!documents.length) {
    list.textContent = "Todavía no tienes clases en la nube. Añade tu primer PDF.";
    return;
  }

  list.innerHTML = documents.slice().reverse().map(doc => {
    const hasLesson = Boolean(doc.lessonContent && doc.lessonContent.trim().length > 0);

    return `
      <div class="lesson">
        <b>${escapeHtml(doc.name)}</b>
        <small>${dateText(doc.date)} · ${doc.pages || "?"} páginas</small>
        <p>${escapeHtml(String(doc.text || "").slice(0, 180))}…</p>
        <button data-open-document="${doc.id}">Leer archivo</button>
        <button data-generate="${doc.id}">
          ${hasLesson ? "Regenerar lección con IA" : "Generar lección con IA"}
        </button>
        ${hasLesson ? `<button data-show-lesson="${doc.id}">Ver mi lección</button>` : ""}
      </div>
    `;
  }).join("");
}

async function showAllClasses() {
  const documents = await fetchDocuments();

  main.innerHTML = `
    <section class="hero">
      <small>MI BIBLIOTECA</small>
      <h1>Mis clases</h1>
      <p>Tus documentos y lecciones de inglés sincronizados.</p>
      <button id="back-home">Volver al inicio</button>
    </section>
    <div id="class-list" class="empty"></div>
  `;

  const container = document.getElementById("class-list");
  if (!documents.length) {
    container.textContent = "Todavía no tienes documentos.";
    return;
  }

  container.innerHTML = documents.slice().reverse().map(doc => {
    const hasLesson = Boolean(doc.lessonContent && doc.lessonContent.trim().length > 0);

    return `
      <div class="lesson">
        <b>${escapeHtml(doc.name)}</b>
        <small>${dateText(doc.date)} · ${doc.pages || "?"} páginas</small>
        <p>${escapeHtml(String(doc.text || "").slice(0, 200))}…</p>
        <button data-open-document="${doc.id}">Leer archivo</button>
        <button data-generate="${doc.id}">
          ${hasLesson ? "Regenerar lección con IA" : "Generar lección con IA"}
        </button>
        ${hasLesson ? `<button data-show-lesson="${doc.id}">Ver mi lección</button>` : ""}
      </div>
    `;
  }).join("");
}

async function showDocument(id) {
  const doc = getDocById(id);
  if (!doc) return;

  main.innerHTML = `
    <section class="hero">
      <small>DOCUMENTO ORIGINAL</small>
      <h1>${escapeHtml(doc.name)}</h1>
      <p>${doc.pages || "?"} páginas · ${dateText(doc.date)}</p>
      <button id="back-home">Volver al inicio</button>
    </section>
    <article class="note">
      <pre id="document-text" style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit"></pre>
    </article>
  `;

  document.getElementById("document-text").textContent = doc.text;
}

/* MOSTRAR LECCIÓN */

async function showLesson(id) {
  const doc = getDocById(id);

  if (!doc || !doc.lessonContent) {
    alert("Todavía no hay una lección generada para este documento.");
    return;
  }

  addLessonStyles();

  main.innerHTML = `
    <section class="hero">
      <small>MY ENGLISH ACADEMY · NIVEL B1-B2</small>
      <h1>Lección: ${escapeHtml(doc.name)}</h1>
      <p>Tu clase de inglés personalizada.</p>
      <button id="back-home">Volver al inicio</button>
    </section>
    <article class="note lesson-content" id="lesson-content"></article>
  `;

  document.getElementById("lesson-content").innerHTML = formatLesson(doc.lessonContent);
}

/* GENERAR LECCIÓN CON GEMINI */

async function generateLesson(id, button) {
  const doc = getDocById(id);
  if (!doc) return;

  if (!navigator.onLine) {
    alert("Necesitas conexión a Internet para utilizar Gemini.");
    return;
  }

  button.disabled = true;
  button.textContent = "Gemini está preparando tu clase…";

  try {
    const sourceText = String(doc.text || "").slice(0, 35000);

    const prompt = `
Actúa como un profesor experto de inglés para un estudiante hispanohablante de nivel B1-B2.
Crea una lección didáctica utilizando EXCLUSIVAMENTE la información que aparece en el documento original siguiente.

DOCUMENTO: ${doc.name}

Organiza la respuesta con este formato:
1. TÍTULO DE LA LECCIÓN
2. OBJETIVOS DE APRENDIZAJE
3. VOCABULARIO
  - Palabra o expresión en inglés.
  - Traducción al español.
  - Ejemplo en inglés y traducción.
4. GRAMÁTICA
  - Explicación clara en español.
  - Estructuras importantes.
  - Ejemplos traducidos.
5. EXPRESIONES IMPORTANTES
6. EJERCICIOS
  - Crea 10 ejercicios diferentes basados en el contenido (completar huecos, elegir opciones y traducir).
7. SOLUCIONES
  - Incluye la respuesta correcta y una breve explicación.
8. RESUMEN FINAL

CONTENIDO DEL PDF:
${sourceText}
`;

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Error al conectar con Gemini.");
    if (!result.text) throw new Error("Gemini no ha devuelto una lección.");

    // Guardar la lección en Google Sheets a través del servidor
    const saveResp = await fetch("/api/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_lesson",
        id: doc.id,
        lessonContent: result.text
      })
    });

    const saveResult = await saveResp.json();
    if (saveResult.status !== "ok") {
      throw new Error("No se pudo guardar la lección en la hoja de cálculo.");
    }

    alert("¡Lección creada y guardada en la nube correctamente!");
    await drawDocuments();
    await showLesson(doc.id);

  } catch (error) {
    console.error(error);
    alert("No se ha podido crear la lección.\n\n" + error.message);
    button.disabled = false;
    button.textContent = "Generar lección con IA";
  }
}

function showPlaceholder(title) {
  main.innerHTML = `
    <section class="hero">
      <small>MY ENGLISH ACADEMY</small>
      <h1>${escapeHtml(title)}</h1>
      <p>Esta sección se desarrollará en una fase posterior.</p>
      <button id="back-home">Volver al inicio</button>
    </section>
  `;
}

/* AÑADIR PDF */

const addButton = document.getElementById("add");
if (addButton) {
  addButton.onclick = () => pdfInput.click();
}

if (pdfInput) {
  pdfInput.onchange = async () => {
    const file = pdfInput.files[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      alert("Selecciona un PDF.");
      pdfInput.value = "";
      return;
    }

    addButton.disabled = true;
    addButton.textContent = "Leyendo y subiendo PDF…";

    try {
      const result = await extractPdfText(file);
      if (!result.text.trim()) {
        throw new Error("El PDF no contiene texto seleccionable.");
      }

      // Enviar el documento nuevo a Google Sheets a través del servidor
      const saveResp = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_doc",
          name: file.name.replace(/\.pdf$/i, ""),
          date: Date.now(),
          pages: result.pages,
          text: result.text
        })
      });

      const saveResult = await saveResp.json();
      if (saveResult.status !== "ok") {
        throw new Error("No se pudo guardar el documento en la nube.");
      }

      await drawDocuments();
      alert("¡PDF leído y guardado en la nube correctamente!");

    } catch (error) {
      alert("No se ha podido leer el PDF: " + error.message);
    } finally {
      addButton.disabled = false;
      addButton.textContent = "＋ Añadir nueva clase PDF";
      pdfInput.value = "";
    }
  };
}

/* BOTONES Y NAVEGACIÓN */

document.addEventListener("click", async event => {
  const generateButton = event.target.closest("[data-generate]");
  if (generateButton) {
    await generateLesson(generateButton.dataset.generate, generateButton);
    return;
  }

  const openButton = event.target.closest("[data-open-document]");
  if (openButton) {
    await showDocument(openButton.dataset.openDocument);
    return;
  }

  const lessonButton = event.target.closest("[data-show-lesson]");
  if (lessonButton) {
    await showLesson(lessonButton.dataset.showLesson);
    return;
  }

  if (event.target.id === "back-home") {
    location.reload();
  }
});

document.querySelectorAll("[data-view]").forEach(button => {
  button.onclick = async () => {
    document.querySelectorAll("aside button").forEach(item => item.classList.remove("active"));
    button.classList.add("active");

    if (button.dataset.view === "Inicio") {
      location.reload();
    } else if (button.dataset.view === "Mis clases") {
      await showAllClasses();
    } else {
      showPlaceholder(button.dataset.view);
    }
  };
});

/* INICIAR APLICACIÓN */

(async function start() {
  try {
    await drawDocuments();
  } catch (error) {
    console.error(error);
    alert("Error al conectar con la base de datos en la nube: " + error.message);
  }
})();