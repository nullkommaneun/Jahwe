// Konfiguration für pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

// Globale Variable, um die geparsten Daten zu speichern
let parsedDataCache = [];

// Elemente aus der HTML-Seite holen
const fileInput = document.getElementById('pdfFile');
const dropzone = document.getElementById('dropzone');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const copyButton = document.getElementById('copyButton');
const errorContainer = document.getElementById('error-container'); // Der neue Fehler-Container

// Event-Listener für Interaktionen
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('hover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('hover'));
dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('hover'); handleFile(e.dataTransfer.files[0]); });

/**
 * Hauptfunktion zur Verarbeitung der PDF-Datei.
 * Enthält jetzt das Diagnose-Modul (try...catch).
 */
async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') {
        alert("Bitte wähle eine gültige PDF-Datei aus.");
        return;
    }

    // --- DIAGNOSE-MODUL START ---
    try {
        // 1. Setze die Benutzeroberfläche zurück
        statusEl.textContent = 'Initialisiere Verarbeitung...';
        resultsEl.innerHTML = '';
        errorContainer.style.display = 'none'; // Fehleranzeige immer zuerst ausblenden
        copyButton.style.display = 'none';

        // 2. Lese die Datei als Array von Bytes
        const fileReader = new FileReader();
        fileReader.readAsArrayBuffer(file);

        // 3. Warte, bis die Datei geladen ist, und starte die Verarbeitung
        fileReader.onload = async function() {
            // Ein zweites Sicherheitsnetz für den asynchronen Verarbeitungsteil
            try {
                const typedarray = new Uint8Array(this.result);
                statusEl.textContent = 'Lade PDF-Struktur...';
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let fullText = '';

                // Extrahiere Text von jeder Seite
                for (let i = 1; i <= pdf.numPages; i++) {
                    statusEl.textContent = `Analysiere Seite ${i} von ${pdf.numPages}...`;
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str || '').join(' ');
                    fullText += pageText + '\n';
                }
                
                statusEl.textContent = 'Text extrahiert. Suche nach Versen...';
                const verses = parseBibleText(fullText);
                
                // Wichtige Überprüfung: Hat der Parser etwas gefunden?
                if (verses.length === 0) {
                    throw new Error("Parser hat keine Verse gefunden. \nMögliche Ursachen:\n1. Die Regex in 'parseBibleText' passt nicht zum PDF-Format.\n2. Die PDF enthält Bilder statt Text.\n3. Das PDF-Format ist sehr komplex.");
                }

                // Speichere die Rohdaten und zeige sie an
                parsedDataCache = verses; 
                displayDataAsHtml(verses);

                statusEl.textContent = `Erfolg! ${verses.length} Verse wurden gefunden.`;
                copyButton.style.display = 'inline-block';

            } catch (innerError) {
                // Fange Fehler innerhalb des Ladevorgangs ab
                displayError(innerError);
            }
        };

        // Fange Fehler ab, die beim Lesen der Datei selbst auftreten
        fileReader.onerror = function() {
            throw new Error("Kritischer Fehler: Die Datei konnte nicht gelesen werden.");
        };

    } catch (outerError) {
        // Fange allgemeine Fehler ab (z.B. wenn fileReader selbst fehlschlägt)
        displayError(outerError);
    }
    // --- DIAGNOSE-MODUL ENDE ---
}

function parseBibleText(text) {
    // Diese Regex ist das Herzstück. Sie muss eventuell für deine PDF angepasst werden.
    const verseRegex = /((\d\.\s)?[A-Za-z\u00C0-\u017F]+)\s+(\d+):(\d+)\s+([\s\S]+?)(?=((\d\.\s)?[A-Za-z\u00C0-\u017F]+)\s+\d+:\d+|$)/g;
    const verses = [];
    let match;
    const cleanText = text.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s\s+/g, ' ');

    while ((match = verseRegex.exec(cleanText)) !== null) {
        verses.push({
            book: match[1].trim(),
            chapter: parseInt(match[3], 10),
            verse: parseInt(match[4], 10),
            text: match[5].trim()
        });
    }
    return verses;
}

function displayDataAsHtml(verses) {
    const bibleData = verses.reduce((acc, verse) => {
        const { book, chapter, text, verse: verseNum } = verse;
        if (!acc[book]) acc[book] = {};
        if (!acc[book][chapter]) acc[book][chapter] = [];
        acc[book][chapter].push({ verse: verseNum, text });
        return acc;
    }, {});

    resultsEl.innerHTML = '';
    for (const bookName in bibleData) {
        const bookDetails = document.createElement('details');
        const bookSummary = document.createElement('summary');
        bookSummary.textContent = bookName;
        bookDetails.appendChild(bookSummary);
        for (const chapterNum in bibleData[bookName]) {
            const chapterDetails = document.createElement('details');
            const chapterSummary = document.createElement('summary');
            chapterSummary.textContent = `Kapitel ${chapterNum}`;
            chapterDetails.appendChild(chapterSummary);
            const verseList = document.createElement('ul');
            bibleData[bookName][chapterNum].forEach(verse => {
                const verseItem = document.createElement('li');
                verseItem.innerHTML = `<strong>${verse.verse}</strong> ${verse.text}`;
                verseList.appendChild(verseItem);
            });
            chapterDetails.appendChild(verseList);
            bookDetails.appendChild(chapterDetails);
        }
        resultsEl.appendChild(bookDetails);
    }
}

/**
 * NEUE FUNKTION: Zeigt einen Fehler detailliert im roten Kasten auf der Webseite an.
 */
function displayError(error) {
    statusEl.textContent = 'Ein Fehler ist aufgetreten! Details siehe unten.';
    errorContainer.style.display = 'block'; // Macht den Fehler-Container sichtbar
    // Zeigt die klare Fehlermeldung und die technischen Details an
    errorContainer.textContent = `--- FEHLERBERICHT ---
Fehlertyp: ${error.name}
Meldung: ${error.message}

--- Technische Details (Stack Trace) ---
${error.stack}
    `;
}

function copyResults() {
    if (parsedDataCache.length === 0) return;
    navigator.clipboard.writeText(JSON.stringify(parsedDataCache, null, 2)).then(() => {
        alert("Die originalen JSON-Rohdaten wurden in die Zwischenablage kopiert!");
    }).catch(err => {
        displayError(err);
    });
}
