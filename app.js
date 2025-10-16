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
const errorContainer = document.getElementById('error-container');

// Event-Listener für Interaktionen
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('hover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('hover'));
dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('hover'); handleFile(e.dataTransfer.files[0]); });

/**
 * Hauptfunktion zur Verarbeitung der PDF-Datei.
 */
async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') {
        alert("Bitte wähle eine gültige PDF-Datei aus.");
        return;
    }

    try {
        // Benutzeroberfläche zurücksetzen
        statusEl.textContent = 'Lade und verarbeite PDF...';
        resultsEl.innerHTML = '';
        errorContainer.style.display = 'none';
        copyButton.style.display = 'none';

        const fileReader = new FileReader();
        fileReader.readAsArrayBuffer(file);

        fileReader.onload = async function() {
            try {
                const typedarray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let fullText = '';

                // Extrahiere Text von jeder Seite
                for (let i = 1; i <= pdf.numPages; i++) {
                    statusEl.textContent = `Analysiere Seite ${i} von ${pdf.numPages}...`;
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    // Fügt nach jedem Textelement ein Leerzeichen hinzu, um Wörter zu trennen
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n';
                }
                
                statusEl.textContent = 'Text extrahiert. Starte das Parsen der Verse...';
                const verses = parseBibleText(fullText);
                
                if (verses.length === 0) {
                    throw new Error("Parser hat keine Verse gefunden. Dies deutet auf ein Problem mit der neuen Regex-Logik oder einem unerwarteten PDF-Format hin.");
                }

                // Speichere Rohdaten und zeige sie an
                parsedDataCache = verses; 
                displayDataAsHtml(verses);

                statusEl.textContent = `Erfolg! ${verses.length} Verse wurden gefunden.`;
                copyButton.style.display = 'inline-block';

            } catch (innerError) {
                displayError(innerError);
            }
        };

        fileReader.onerror = function() {
            throw new Error("Kritischer Fehler: Die Datei konnte nicht gelesen werden.");
        };

    } catch (outerError) {
        displayError(outerError);
    }
}

/**
 * NEUE, VERBESSERTE PARSER-FUNKTION
 * Speziell für die "Neue-Welt-Übersetzung" PDF angepasst.
 */
function parseBibleText(text) {
    // Liste der Bücher, um den Start eines neuen Buches zu erkennen
    const bookNames = [
        "1. MOSE", "2. MOSE", "3. MOSE", "4. MOSE", "5. MOSE", "JOSUA", "RICHTER", "RUTH",
        "1. SAMUEL", "2. SAMUEL", "1. KÖNIGE", "2. KÖNIGE", "1. CHRONIKA", "2. CHRONIKA", "ESRA", "NEHEMIA", "ESTHER",
        "HIOB", "DIE PSALMEN", "SPRÜCHE", "PREDIGER", "DAS HOHE LIED", "JESAJA", "JEREMIA", "KLAGELIEDER", "HESEKIEL", "DANIEL",
        "HOSEA", "JOEL", "AMOS", "OBADJA", "JONA", "MICHA", "NAHUM", "HABAKUK", "ZEPHANJA", "HAGGAI", "SACHARJA", "MALEACHI",
        "MATTHÄUS", "MARKUS", "LUKAS", "JOHANNES", "APOSTELGESCHICHTE", "RÖMER", "1. KORINTHER", "2. KORINTHER", "GALATER",
        "EPHESER", "PHILIPPER", "KOLOSSER", "1. THESSALONICHER", "2. THESSALONICHER", "1. TIMOTHEUS", "2. TIMOTHEUS",
        "TITUS", "PHILEMON", "HEBRÄER", "JAKOBUS", "1. PETRUS", "2. PETRUS", "1. JOHANNES", "2. JOHANNES", "3. JOHANNES",
        "JUDAS", "OFFENBARUNG"
    ];

    // Vorverarbeitung des Textes
    let cleanText = text.replace(/(\r\n|\n|\r)/gm, " ") // Alle Zeilenumbrüche entfernen
                         .replace(/-\s+/g, '') // Zusammenfügen von Wörtern mit Trennstrich
                         .replace(/\s\s+/g, ' '); // Mehrfache Leerzeichen reduzieren

    const verses = [];
    let currentBook = "Unbekannt";
    let currentChapter = 0;
    let lastVerse = 0;

    // Text anhand der Buch-Überschriften aufteilen (z.B. "DAS ERSTE BUCH MOSE (GENESIS)")
    const bookRegex = new RegExp(`(DAS (?:ERSTE|ZWEITE|DRITTE|VIERTE|FÜNFTE) BUCH (?:[A-ZÄÖÜ]+)|${bookNames.slice(5).join('|')})`, 'g');
    const bookParts = cleanText.split(bookRegex);
    
    for (let i = 1; i < bookParts.length; i += 2) {
        currentBook = bookParts[i].replace("DAS ERSTE BUCH ", "1. ").replace("DAS ZWEITE BUCH ", "2. ").replace("DAS DRITTE BUCH ", "3. ").replace("DAS VIERTE BUCH ", "4. ").replace("DAS FÜNFTE BUCH ", "5. ").trim();
        let bookText = bookParts[i+1];
        currentChapter = 0;
        lastVerse = 0;

        // Split by what looks like a verse number. This is the core logic.
        const verseParts = bookText.split(/\s(\d+)\s/);

        for (let j = 1; j < verseParts.length; j+=2) {
            const num = parseInt(verseParts[j]);
            const textPart = verseParts[j+1] || '';

            // Heuristik zur Erkennung eines neuen Kapitels:
            // Wenn die Versnummer 1 ist und der letzte Vers > 1 war, ODER
            // wenn die neue Nummer viel größer ist als die letzte (deutet auf einen neuen Kapitelanfang hin, z.B. 33 nach Vers 32).
            if ((num === 1 && lastVerse > 1) || (num > lastVerse + 2 && lastVerse !== 0)) {
                currentChapter = (num === 1) ? currentChapter + 1 : num;
                // If chapter number is part of the text, use verse 1
                if (num > 1) {
                     verses.push({ book: currentBook, chapter: currentChapter, verse: 1, text: textPart.trim() });
                     lastVerse = 1;
                } else { // if the number is actually verse 1
                     verses.push({ book: currentBook, chapter: currentChapter, verse: num, text: textPart.trim() });
                     lastVerse = num;
                }
            } else {
                if (currentChapter === 0) currentChapter = 1; // Start with chapter 1 if not set
                verses.push({ book: currentBook, chapter: currentChapter, verse: num, text: textPart.trim() });
                lastVerse = num;
            }
        }
    }
    return verses;
}


/**
 * Baut eine interaktive HTML-Ansicht aus den Vers-Daten.
 */
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

        // Kapitelnummern numerisch sortieren
        const chapterKeys = Object.keys(bibleData[bookName]).sort((a, b) => a - b);

        for (const chapterNum of chapterKeys) {
            const chapterDetails = document.createElement('details');
            const chapterSummary = document.createElement('summary');
            chapterSummary.textContent = `Kapitel ${chapterNum}`;
            chapterDetails.appendChild(chapterSummary);

            const verseList = document.createElement('ul');
            // Verse numerisch sortieren
            const sortedVerses = bibleData[bookName][chapterNum].sort((a, b) => a.verse - b.verse);

            for (const verse of sortedVerses) {
                const verseItem = document.createElement('li');
                verseItem.innerHTML = `<strong>${verse.verse}</strong> ${verse.text}`;
                verseList.appendChild(verseItem);
            }

            chapterDetails.appendChild(verseList);
            bookDetails.appendChild(chapterDetails);
        }
        resultsEl.appendChild(bookDetails);
    }
}

/**
 * Zeigt einen Fehler detailliert auf der Webseite an.
 */
function displayError(error) {
    console.error("DIAGNOSE-TOOL HAT EINEN FEHLER GEFUNDEN:", error);
    statusEl.textContent = 'Ein Fehler ist aufgetreten! Details siehe unten.';
    errorContainer.style.display = 'block';
    errorContainer.textContent = `--- FEHLERBERICHT ---\nFehlertyp: ${error.name}\nMeldung: ${error.message}\n\n--- Technische Details (Stack Trace) ---\n${error.stack}`;
}

/**
 * Kopiert die originalen Rohdaten als JSON in die Zwischenablage.
 */
function copyResults() {
    if (parsedDataCache.length === 0) return;
    navigator.clipboard.writeText(JSON.stringify(parsedDataCache, null, 2)).then(() => {
        alert("Die originalen JSON-Rohdaten wurden in die Zwischenablage kopiert!");
    }).catch(err => {
        displayError(err);
    });
}
 
