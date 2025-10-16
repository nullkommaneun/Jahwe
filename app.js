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

// Event-Listener für Drag & Drop und Klick
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('hover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('hover'));
dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('hover'); handleFile(e.dataTransfer.files[0]); });

async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') {
        alert("Bitte wähle eine gültige PDF-Datei aus.");
        return;
    }

    statusEl.textContent = 'Lade und verarbeite PDF... Dies kann einen Moment dauern.';
    resultsEl.innerHTML = ''; // Leere den Ergebnis-Container
    copyButton.style.display = 'none';

    try {
        const fileReader = new FileReader();
        fileReader.onload = async function() {
            const typedarray = new Uint8Array(this.result);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            let fullText = '';

            for (let i = 1; i <= pdf.numPages; i++) {
                statusEl.textContent = `Verarbeite Seite ${i} von ${pdf.numPages}...`;
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }
            
            statusEl.textContent = 'Text extrahiert. Starte das Parsen der Verse...';
            const verses = parseBibleText(fullText);
            
            // Speichere die Rohdaten und zeige sie strukturiert an
            parsedDataCache = verses; 
            displayDataAsHtml(verses);

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
    // Diese Regex ist das Herzstück. Sie muss eventuell für deine PDF angepasst werden.
    const verseRegex = /((\d\.\s)?[A-Za-z]+)\s+(\d+):(\d+)\s+([\s\S]+?)(?=((\d\.\s)?[A-Za-z]+)\s+\d+:\d+|$)/g;
    const verses = [];
    let match;
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

/**
 * NEUE FUNKTION: Baut eine interaktive HTML-Ansicht aus den Vers-Daten.
 */
function displayDataAsHtml(verses) {
    // 1. Daten restrukturieren: Von einer flachen Liste zu Buch -> Kapitel -> Verse
    const bibleData = verses.reduce((acc, verse) => {
        const { book, chapter, text, verse: verseNum } = verse;
        if (!acc[book]) {
            acc[book] = {};
        }
        if (!acc[book][chapter]) {
            acc[book][chapter] = [];
        }
        acc[book][chapter].push({ verse: verseNum, text });
        return acc;
    }, {});

    // 2. HTML-Struktur generieren
    resultsEl.innerHTML = ''; // Sicherstellen, dass der Bereich leer ist
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
 * Kopiert die *originalen* Rohdaten als JSON in die Zwischenablage.
 */
function copyResults() {
    if (parsedDataCache.length === 0) return;
    navigator.clipboard.writeText(JSON.stringify(parsedDataCache, null, 2)).then(() => {
        alert("Die originalen JSON-Rohdaten wurden in die Zwischenablage kopiert!");
    }).catch(err => {
        console.error('Fehler beim Kopieren:', err);
    });
}
 
