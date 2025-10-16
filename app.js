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
                for (let i = 1; i <= pdf.numPages; i++) {
                    statusEl.textContent = `Analysiere Seite ${i} von ${pdf.numPages}...`;
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n';
                }
                statusEl.textContent = 'Text extrahiert. Starte das Parsen der Verse...';
                const verses = parseBibleText(fullText);
                if (verses.length === 0) {
                    throw new Error("Parser hat keine Verse gefunden. Überprüfen Sie, ob das PDF-Format Text enthält und nicht nur Bilder.");
                }
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
 * KOMPLETT NEUER, ZUSTANDSBASIERTER PARSER (Version 3)
 * Analysiert den Textfluss, um Kapitel und Verse intelligent zu erkennen.
 */
function parseBibleText(text) {
    // 1. Umfassende Liste aller Buchtitel, wie sie in der PDF erscheinen
    const bookNames = [
        "DAS ERSTE BUCH MOSE", "DAS ZWEITE BUCH MOSE", "DAS DRITTE BUCH MOSE", "DAS VIERTE BUCH MOSE", "DAS FÜNFTE BUCH MOSE", "JOSUA", "RICHTER", "RUTH",
        "DAS ERSTE BUCH SAMUEL", "DAS ZWEITE BUCH SAMUEL", "DAS ERSTE BUCH KÖNIGE", "DAS ZWEITE BUCH KÖNIGE", "DAS ERSTE BUCH CHRONIKA", "DAS ZWEITE BUCH CHRONIKA", "ESRA", "NEHEMIA", "ESTHER",
        "HIOB", "DIE PSALMEN", "SPRÜCHE", "PREDIGER", "DAS HOHE LIED", "JESAJA", "JEREMIA", "KLAGELIEDER", "HESEKIEL", "DANIEL",
        "HOSEA", "JOEL", "AMOS", "OBADJA", "JONA", "MICHA", "NAHUM", "HABAKUK", "ZEPHANJA", "HAGGAI", "SACHARJA", "MALEACHI",
        "MATTHÄUS", "MARKUS", "LUKAS", "JOHANNES", "APOSTELGESCHICHTE", "RÖMER", "ERSTER BRIEF AN DIE KORINTHER", "ZWEITER BRIEF AN DIE KORINTHER", "GALATER",
        "EPHESER", "PHILIPPER", "KOLOSSER", "ERSTER BRIEF AN DIE THESSALONICHER", "ZWEITER BRIEF AN DIE THESSALONICHER", "ERSTER BRIEF AN TIMOTHEUS", "ZWEITER BRIEF AN TIMOTHEUS",
        "TITUS", "PHILEMON", "HEBRÄER", "JAKOBUS", "ERSTER BRIEF VON PETRUS", "ZWEITER BRIEF VON PETRUS", "ERSTER BRIEF VON JOHANNES", "ZWEITER BRIEF VON JOHANNES", "DRITTER BRIEF VON JOHANNES",
        "JUDAS", "OFFENBARUNG"
    ];
    
    // 2. Textvorverarbeitung
    let cleanText = text.replace(/(\r\n|\n|\r)/gm, " ") // Zeilenumbrüche entfernen
                         .replace(/-\s+/g, '') // Getrennte Wörter zusammenfügen
                         .replace(/Fußnoten/g, '') // Das Wort "Fußnoten" entfernen
                         .replace(/\s\s+/g, ' '); // Mehrfache Leerzeichen reduzieren

    const verses = [];
    let currentBook = "";
    let currentChapter = 0;
    let lastVerse = 0;

    // 3. Den gesamten Text anhand der Buchtitel aufteilen. Das ist die Basis.
    const bookPattern = `(${bookNames.join('|')})`;
    const textParts = cleanText.split(new RegExp(bookPattern, 'g'));
    
    // 4. Jeden Teil (Buch) einzeln verarbeiten
    for (let i = 1; i < textParts.length; i += 2) {
        // Buchtitel formatieren (z.B. "DAS ERSTE BUCH MOSE" -> "1. Mose")
        currentBook = textParts[i]
            .replace("DAS ERSTE BUCH ", "1. ")
            .replace("DAS ZWEITE BUCH ", "2. ")
            .replace("DAS DRITTE BUCH ", "3. ")
            .replace("DAS VIERTE BUCH ", "4. ")
            .replace("DAS FÜNFTE BUCH ", "5. ")
            .replace("ERSTER BRIEF AN DIE ", "1. ")
            .replace("ZWEITER BRIEF AN DIE ", "2. ")
            .replace("ERSTER BRIEF AN ", "1. ")
            .replace("ZWEITER BRIEF AN ", "2. ")
            .replace("ERSTER BRIEF VON ", "1. ")
            .replace("ZWEITER BRIEF VON ", "2. ")
            .replace("DRITTER BRIEF VON ", "3. ")
            .toLowerCase().replace(/\b\w/g, l => l.toUpperCase());

        let bookContent = textParts[i + 1];
        currentChapter = 0;
        lastVerse = 0;

        // 5. Den Inhalt eines Buches nach Zahlen und Text aufteilen
        const contentParts = bookContent.trim().split(/(\d+)/);

        for (let j = 0; j < contentParts.length; j++) {
            const part = contentParts[j].trim();
            if (/^\d+$/.test(part)) { // Wenn der Teil eine Zahl ist
                const num = parseInt(part, 10);
                const followingText = (contentParts[j + 1] || "").trim();

                // 6. Intelligente Logik zur Unterscheidung von Kapiteln und Versen
                if (currentChapter === 0) { // Das erste große Zahl ist das erste Kapitel
                    currentChapter = num;
                    lastVerse = 0; // Kapitel wurde gesetzt, warte auf Vers 1
                } else if (num === 1 && lastVerse > 1) { // Ein klares Zeichen für ein neues Kapitel
                    currentChapter++;
                    lastVerse = num;
                    if (followingText) verses.push({ book: currentBook, chapter: currentChapter, verse: num, text: followingText });
                    j++; // Überspringe den Text, da er bereits verarbeitet wurde
                } else if (num > lastVerse) { // Ein regulärer, fortlaufender Vers
                    lastVerse = num;
                    if (followingText) verses.push({ book: currentBook, chapter: currentChapter, verse: num, text: followingText });
                    j++; // Überspringe den Text
                } else { 
                    // Dies ist wahrscheinlich eine große, alleinstehende Kapitelnummer
                    currentChapter = num;
                    lastVerse = 0;
                }
            }
        }
    }
    return verses;
}

/**
 * Baut eine interaktive HTML-Ansicht aus den Vers-Daten. (Unverändert)
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
        const chapterKeys = Object.keys(bibleData[bookName]).sort((a, b) => a - b);
        for (const chapterNum of chapterKeys) {
            const chapterDetails = document.createElement('details');
            const chapterSummary = document.createElement('summary');
            chapterSummary.textContent = `Kapitel ${chapterNum}`;
            chapterDetails.appendChild(chapterSummary);
            const verseList = document.createElement('ul');
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
 * Zeigt einen Fehler detailliert auf der Webseite an. (Unverändert)
 */
function displayError(error) {
    statusEl.textContent = 'Ein Fehler ist aufgetreten! Details siehe unten.';
    errorContainer.style.display = 'block';
    errorContainer.textContent = `--- FEHLERBERICHT ---\nFehlertyp: ${error.name}\nMeldung: ${error.message}\n\n--- Technische Details (Stack Trace) ---\n${error.stack}`;
}

/**
 * Kopiert die originalen Rohdaten als JSON in die Zwischenablage. (Unverändert)
 */
function copyResults() {
    if (parsedDataCache.length === 0) return;
    navigator.clipboard.writeText(JSON.stringify(parsedDataCache, null, 2)).then(() => {
        alert("Die originalen JSON-Rohdaten wurden in die Zwischenablage kopiert!");
    }).catch(err => {
        displayError(err);
    });
}
 
