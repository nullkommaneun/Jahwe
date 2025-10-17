// Globale Variablen, um den Zustand der App zu speichern
let EPUB_FILES_CACHE = [];
let PARSED_DATA_CACHE = [];

// UI-Elemente holen
const fileInput = document.getElementById('epubFile');
const statusEl = document.getElementById('status');
const errorContainer = document.getElementById('error-container');
const rawHtmlView = document.getElementById('raw-html-view');
const resultsEl = document.getElementById('results');

// Event-Listener für den Datei-Upload
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

/**
 * Lädt, entpackt und speichert die EPUB-Dateien im Cache.
 */
async function handleFile(file) {
    if (!file || !file.name.endsWith('.epub')) {
        alert("Bitte wähle eine gültige EPUB-Datei aus.");
        return;
    }
    try {
        statusEl.textContent = 'Lade und entpacke EPUB...';
        errorContainer.style.display = 'none';
        EPUB_FILES_CACHE = []; // Cache leeren

        const zip = await JSZip.loadAsync(file);
        const contentFiles = Object.keys(zip.files).filter(name => name.endsWith('.xhtml') && name.startsWith('OEBPS/'));
        contentFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        for (const filename of contentFiles) {
            const content = await zip.files[filename].async('string');
            EPUB_FILES_CACHE.push({ name: filename, content: content });
        }

        if (EPUB_FILES_CACHE.length === 0) {
            throw new Error("Keine XHTML-Inhaltsdateien im OEBPS-Ordner gefunden.");
        }

        statusEl.textContent = `EPUB geladen! ${EPUB_FILES_CACHE.length} Inhaltsdateien gefunden.`;
        // Zeige den HTML-Code der ersten relevanten Datei als Starthilfe an
        const firstRealContent = EPUB_FILES_CACHE.find(f => !f.name.includes("toc") && !f.name.includes("Title"));
        rawHtmlView.textContent = firstRealContent ? firstRealContent.content : "Keine passende Inhaltsdatei für die Vorschau gefunden.";

    } catch (error) {
        displayError(error);
    }
}

/**
 * Wird durch den Button ausgelöst. Führt den Parser mit den aktuellen Selektoren aus.
 */
function runCustomParser() {
    if (EPUB_FILES_CACHE.length === 0) {
        alert("Bitte laden Sie zuerst eine EPUB-Datei hoch.");
        return;
    }

    try {
        // 1. Lese die benutzerdefinierten Selektoren aus den Input-Feldern
        const bookSelector = document.getElementById('book-selector').value;
        const chapterSelector = document.getElementById('chapter-selector').value;
        const verseContainerSelector = document.getElementById('verse-container-selector').value;
        const verseNumberSelector = document.getElementById('verse-number-selector').value;
        const verseTextSelector = document.getElementById('verse-text-selector').value;

        // 2. Führe den Parser mit diesen Selektoren aus
        const verses = parseWithCustomSelectors({
            bookSelector, chapterSelector, verseContainerSelector, verseNumberSelector, verseTextSelector
        });

        if (verses.length === 0) {
            resultsEl.innerHTML = "<h2>Keine Verse gefunden!</h2><p>Bitte überprüfen Sie Ihre Selektoren und den Raw-HTML-Code.</p>";
            return;
        }
        
        PARSED_DATA_CACHE = verses;
        displayDataAsHtml(verses);

    } catch (error) {
        displayError(error);
    }
}

/**
 * Der eigentliche Parser, der die benutzerdefinierten Selektoren verwendet.
 */
function parseWithCustomSelectors(selectors) {
    const verses = [];
    let currentBook = "";
    let currentChapter = 0;

    for (const file of EPUB_FILES_CACHE) {
        if (file.name.includes("toc") || file.name.includes("Title")) continue;

        const parser = new DOMParser();
        const doc = parser.parseFromString(file.content, "text/html");

        const bookTitleElement = doc.querySelector(selectors.bookSelector);
        if (bookTitleElement) currentBook = bookTitleElement.textContent.trim();

        const chapterElement = doc.querySelector(selectors.chapterSelector);
        if (chapterElement) {
            const chapterNum = parseInt(chapterElement.textContent.trim(), 10);
            if (!isNaN(chapterNum)) currentChapter = chapterNum;
        }
        if (currentBook && currentChapter === 0) currentChapter = 1;

        const verseContainers = doc.querySelectorAll(selectors.verseContainerSelector);
        for (const container of verseContainers) {
            const verseNumberElement = container.querySelector(selectors.verseNumberSelector);
            const verseTextElement = container.querySelector(selectors.verseTextSelector);
            
            if (verseNumberElement && verseTextElement) {
                const verseNum = parseInt(verseNumberElement.textContent.trim(), 10);
                const verseText = verseTextElement.textContent.trim();
                if (currentBook && currentChapter > 0 && !isNaN(verseNum) && verseText) {
                    verses.push({ book: currentBook, chapter: currentChapter, verse: verseNum, text: verseText });
                }
            }
        }
    }
    return verses;
}

/**
 * Zeigt die geparsten Daten in der Ergebnis-Ansicht an.
 */
function displayDataAsHtml(verses) {
    // Diese Funktion bleibt dieselbe wie zuvor, um die Daten schön anzuzeigen.
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
        const chapterKeys = Object.keys(bibleData[bookName]).sort((a, b) => parseInt(a) - parseInt(b));
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

function displayError(error) {
    errorContainer.style.display = 'block';
    errorContainer.textContent = `FEHLER: ${error.message}`;
}
