// Globale Variable, um die geparsten Daten zu speichern
let parsedDataCache = [];

// Elemente aus der HTML-Seite holen
const fileInput = document.getElementById('epubFile');
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
 * HAUPTFUNKTION ZUR VERARBEITUNG VON EPUB-DATEIEN
 */
async function handleFile(file) {
    if (!file || !file.name.endsWith('.epub')) {
        alert("Bitte wähle eine gültige EPUB-Datei aus.");
        return;
    }
    try {
        statusEl.textContent = 'Lade und entpacke EPUB...';
        resultsEl.innerHTML = '';
        errorContainer.style.display = 'none';
        copyButton.style.display = 'none';
        const fileReader = new FileReader();
        fileReader.readAsArrayBuffer(file);
        fileReader.onload = async function(event) {
            try {
                const epubData = event.target.result;
                const zip = await JSZip.loadAsync(epubData);
                const contentFiles = Object.keys(zip.files)
                    .filter(name => name.endsWith('.xhtml') && name.startsWith('OEBPS/'));
                
                let htmlContents = [];
                for (const filename of contentFiles) {
                    const content = await zip.files[filename].async('string');
                    htmlContents.push({ name: filename, content: content });
                }

                if (htmlContents.length === 0) {
                    throw new Error("Keine XHTML-Inhaltsdateien im OEBPS-Ordner gefunden.");
                }

                statusEl.textContent = 'Inhalt extrahiert. Starte das Parsen der Verse...';
                htmlContents.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

                const verses = parseEpubHtml(htmlContents);
                if (verses.length === 0) {
                    throw new Error("Parser hat keine Verse gefunden. Die HTML-Struktur der EPUB hat sich möglicherweise geändert oder die Selektoren sind falsch.");
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
            throw new Error("Kritischer Fehler: Die EPUB-Datei konnte nicht gelesen werden.");
        };
    } catch (outerError) {
        displayError(outerError);
    }
}

/**
 * FINALER, CHIRURGISCHER PARSER (Version 6)
 * Basiert auf der exakten Analyse der 'bi12_X.epub'-Struktur.
 */
function parseEpubHtml(htmlFiles) {
    const verses = [];
    let currentBook = "";
    let currentChapter = 0;

    for (const file of htmlFiles) {
        // Überspringe Inhaltsverzeichnis- und andere Meta-Dateien rigoros
        if (file.name.includes("toc") || file.name.includes("Title") || file.name.includes("Foreword")) {
            continue;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(file.content, "text/html");

        // MUSTER 1: Finde den Buchtitel. Er ist im <h1> in einem <header>.
        const bookTitleElement = doc.querySelector('header h1');
        if (bookTitleElement) {
            currentBook = bookTitleElement.textContent.trim();
        }

        // MUSTER 2: Finde die Kapitelnummer. Sie ist in einem <a>-Tag mit der ID "chapter".
        const chapterElement = doc.querySelector('a#chapter');
        if (chapterElement) {
            const chapterNum = parseInt(chapterElement.textContent.trim(), 10);
            if (!isNaN(chapterNum)) {
                currentChapter = chapterNum;
            }
        }
        
        // Fange den Fall ab, dass ein Buch nur ein Kapitel hat (z.B. Judas)
        if (currentBook && currentChapter === 0) {
            currentChapter = 1;
        }

        // MUSTER 3: Finde alle Verse. Die Struktur ist ein <p> mit einer ID, die mit 'v' beginnt.
        const verseElements = doc.querySelectorAll('p[id^="v"]');
        for (const p of verseElements) {
            // Die Versnummer ist in einem <a>-Tag mit der Klasse 'verse-number'.
            const verseNumberElement = p.querySelector('a.verse-number');
            // Der Text ist in einem oder mehreren <span>-Tags mit der Klasse 'verse-text'.
            const verseTextSpans = p.querySelectorAll('span.verse-text');
            
            let verseText = "";
            verseTextSpans.forEach(span => {
                verseText += span.textContent;
            });

            if (verseNumberElement && verseText) {
                const verseNum = parseInt(verseNumberElement.textContent.trim(), 10);

                if (currentBook && currentChapter > 0 && !isNaN(verseNum)) {
                    verses.push({
                        book: currentBook,
                        chapter: currentChapter,
                        verse: verseNum,
                        text: verseText.trim()
                    });
                }
            }
        }
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
    statusEl.textContent = 'Ein Fehler ist aufgetreten! Details siehe unten.';
    errorContainer.style.display = 'block';
    errorContainer.textContent = `--- FEHLERBERICHT ---\nFehlertyp: ${error.name}\nMeldung: ${error.message}\n\n--- Technische Details (Stack Trace) ---\n${error.stack}`;
}

function copyResults() {
    if (parsedDataCache.length === 0) return;
    navigator.clipboard.writeText(JSON.stringify(parsedDataCache, null, 2)).then(() => {
        alert("Die originalen JSON-Rohdaten wurden in die Zwischenablage kopiert!");
    }).catch(err => {
        displayError(err);
    });
}
