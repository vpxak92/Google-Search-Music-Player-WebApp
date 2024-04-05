window.addEventListener("DOMContentLoaded", () => {
    // Handling search form submission
    document.getElementById("searchForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const userQuery = document.getElementById("searchInput").value;
        try {
            // Sending search query to server
            const response = await fetch('/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: userQuery })
            });
            const data = await response.json();
            // Displaying search results
            displaySearchResults(data);
        } catch (error) {
            console.error('Error while fetching search results:', error);
        }
    });   

    // Handling file upload form submission
    document.getElementById("uploadFile").addEventListener("submit", async (event) => {
        event.preventDefault();
        const file = document.getElementById("mp3file").files[0];
        try {
            // Validating uploaded file
            if (validateFile(file) === true) {
                // Uploading file to server
                const formData = new FormData();
                formData.append('mp3file', file);
                const response = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                // Updating audio player with uploaded file
                updateAudioPlayer(data.filePath);
            }
        } catch (error) {
            console.error('Error while uploading file:', error);
        }
    });
});

// Function to display search results on the webpage
function displaySearchResults(data) {
    const resultList = document.getElementById('searchResults');
    resultList.innerHTML = "";

    if (data.items && data.items.length > 0) {
        data.items.forEach(item => {
            const resultItem = document.createElement("div");
            resultItem.innerHTML = `
                <h3 id="pageTitle"><a href="${item.link}" target="_blank">${item.htmlTitle}</a></h3>
                <p id="pageLink">${item.link}</p>
                <p id="pageSnippet">${item.htmlSnippet}</p>
            `;
            resultList.appendChild(resultItem);
        });
    } else {
        resultList.innerHTML = "<p>No results found.</p>";
    }
}

// Function to validate the uploaded file (name, size, name length, mime type)
function validateFile(file) {
    const regexName = /^[a-zA-Z0-9-_(). ]+\.mp3$/;
    
    if (file.type !== "audio/mpeg") {
        console.error("Error while trying to validate the file type, ensure that you submitted an MP3 file.");
        return false;
    } else if (file.size >= 7000000) {
        console.error("Error while trying to validate file size, ensure that the size is less than 7MB.");
        return false;
    } else if (!regexName.test(file.name) || file.name.length > 70) {
        console.error("Error while trying to validate the name, ensure that it does not contain special characters and is less than 70 characters.");
        return false;
    }
    return true;
}

// Function to update audio player source with uploaded file
function updateAudioPlayer(filePath) {
    const audioPlayer = document.getElementById('audioPlayer');
    const source = document.getElementById('evian');
    source.src = filePath;
    audioPlayer.load();
}
