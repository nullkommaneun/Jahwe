// Konfiguration für pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

// Elemente aus der HTML-Seite holen
const fileInput = document.getElementById('pdfFile');
const dropzone = document.getElementById('dropzone');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const copyButton = document.getElementById('copyButton');

// Event-Listener für Drag & Drop und Klick
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('hover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('hover'));
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('hover');
    handleFile(e.dataTransfer.files[0]);
});

async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') {
        alert("Bitte wähle eine gültige PDF-Datei aus.");
        return;
    }

    statusEl.textContent = 'Lade und verarbeite PDF... Dies kann einen Moment dauern.';
    resultsEl.textContent = '';
    copyButton.style.display = 'none';

    try {
        const fileReader = new FileReader();
        fileReader.onload = async function() {
            const typedarray = new Uint8Array(this.result);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            let fullText = '';

            // Gehe durch jede Seite der PDF
            for (let i = 1; i <= pdf.numPages; i++) {
                statusEl.textContent = `Verarbeite Seite ${i} von ${pdf.numPages}...`;
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }
            
            // Jetzt parsen wir den gesamten extrahierten Text
            statusEl.textContent = 'Text extrahiert. Starte das Parsen der Verse...';
            const verses = parseBibleText(fullText);

            // Ergebnisse anzeigen
            resultsEl.textContent = JSON.stringify(verses, null, 2);
            statusEl.textContent = `Verarbeitung abgeschlossen! ${verses.length} Verse wurden gefunden.`;
            copyButton.style.display = 'inline-block';
        };
        fileReader.readAsArrayBuffer(file);
    } catch (error) {
        console.error("Fehler bei der PDF-Verarbeitung:", error);
        statusEl.textContent = `Ein Fehler ist aufgetreten: ${error.message}`;
    }
}

function parseBibleText(text) {
    // WICHTIG: Diese Regulären Ausdrücke sind der entscheidende Teil und
    // müssen eventuell an das Format DEINER Bibel-PDF angepasst werden!
    // Dieses Beispiel geht von einem Format wie "1. Mose 1:1 Text..." aus.
    const verseRegex = /((\d\.\s)?[A-Za-z]+)\s+(\d+):(\d+)\s+([\s\S]+?)(?=((\d\.\s)?[A-Za-z]+)\s+\d+:\d+|$)/g;
    
    const verses = [];
    let match;
    
    // Bereinige den Text von überflüssigen Zeilenumbrüchen und Seitenzahlen
    const cleanText = text.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s\d+\s/g, ' ');

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

function copyResults() {
    navigator.clipboard.writeText(resultsEl.textContent).then(() => {
        alert("JSON-Daten wurden in die Zwischenablage kopiert!");
    }).catch(err => {
        console.error('Fehler beim Kopieren:', err);
    });
}
 
