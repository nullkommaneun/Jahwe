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
 * KOMPLETT NEUE HAUPTFUNKTION ZUR VERARBEITUNG VON EPUB-DATEIEN
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
                let htmlContents = [];

                // Finde alle HTML/XHTML-Dateien im EPUB
                const contentFiles = Object.keys(zip.files).filter(name => name.endsWith('.xhtml') || name.endsWith('.html'));
                
                for (const filename of contentFiles) {
                    statusEl.textContent = `Lese Inhalt: ${filename}...`;
                    const content = await zip.files[filename].async('string');
                    htmlContents.push(content);
                }

                if (htmlContents.length === 0) {
                    throw new Error("Keine Inhaltsdateien (XHTML/HTML) in der EPUB gefunden.");
                }

                statusEl.textContent = 'Inhalt extrahiert. Starte das Parsen der Verse...';
                const verses = parseEpubHtml(htmlContents.join(' '));
                
                if (verses.length === 0) {
                    throw new Error("Parser hat keine Verse gefunden. Die HTML-Struktur der EPUB ist möglicherweise unerwartet.");
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
 * NEUER PARSER, DER HTML-STRUKTUREN ANSTELLE VON TEXTMUSTERN VERWENDET
 */
function parseEpubHtml(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    
    const verses = [];
    let currentBook = "";
    let currentChapter = 0;

    // Annahme: Die Bibel-EPUB verwendet semantische Elemente. Wir suchen nach allen relevanten Elementen.
    // Diese Selektoren müssen eventuell an die spezifische EPUB-Struktur angepasst werden.
    const elements = doc.querySelectorAll('h1, h2, h3, p');

    for (const el of elements) {
        const text = el.textContent.trim();
        
        // Annahme: Buchtitel sind in <h1> oder <h2> Tags
        if ((el.tagName === 'H1' || el.tagName === 'H2') && isNaN(parseInt(text))) {
            currentBook = text;
            currentChapter = 0; // Setze das Kapitel zurück, wenn ein neues Buch beginnt
            continue;
        }

        // Annahme: Kapitel sind in <h3> oder als alleinstehende Zahl in <p>
        if (el.tagName === 'H3' || (el.tagName === 'P' && /^\d+$/.test(text))) {
            const chapterNum = parseInt(text);
            if (!isNaN(chapterNum)) {
                currentChapter = chapterNum;
                continue;
            }
        }

        // Annahme: Verse sind in <p>-Tags mit einer Versnummer am Anfang.
        if (el.tagName === 'P' && currentBook && currentChapter > 0) {
            // Finde eine Versnummer (oft in <sup> oder <strong>) und den Text danach
            const verseNumberMatch = text.match(/^(\d+)\s*/);
            if (verseNumberMatch) {
                const verseNum = parseInt(verseNumberMatch[1]);
                const verseText = text.substring(verseNumberMatch[0].length).trim();
                
                if(verseText) {
                    verses.push({
                        book: currentBook,
                        chapter: currentChapter,
                        verse: verseNum,
                        text: verseText
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
 
