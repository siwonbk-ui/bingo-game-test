document.addEventListener('DOMContentLoaded', () => {
    // --- Login Elements ---
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const userIdInput = document.getElementById('user-id-input');
    const userPasswordInput = document.getElementById('user-password-input');
    const btnLogin = document.getElementById('btn-login');
    const loginError = document.getElementById('login-error');

    // --- Admin Elements ---
    const adminContainer = document.getElementById('admin-container');
    const btnAdminPanel = document.getElementById('btn-admin-panel');
    const btnDownloadReport = document.getElementById('btn-download-report');
    const btnBackGame = document.getElementById('btn-back-game');
    const userListEl = document.getElementById('user-list');
    const newUserInput = document.getElementById('new-user-id');
    const newUserPasswordInput = document.getElementById('new-user-password');
    const newUserNameInput = document.getElementById('new-user-name');
    const newUserRoleSelect = document.getElementById('new-user-role');
    const btnAddUser = document.getElementById('btn-add-user');
    const userRoleDisplay = document.getElementById('user-role-display');

    // --- Game Elements ---
    const gridContainer = document.getElementById('grid-container');
    const btnNewGame = document.getElementById('btn-new-game');
    const btnReset = document.getElementById('btn-reset');
    const btnSave = document.getElementById('btn-save');
    const winOverlay = document.getElementById('win-overlay');
    const winTitle = document.getElementById('win-title');

    const btnContinueGame = document.getElementById('btn-continue-game');
    const toast = document.getElementById('toast');
    const controlsDiv = document.querySelector('.controls');

    // --- Modal Elements ---
    const uploadModal = document.getElementById('upload-modal');
    const fileInput = document.getElementById('file-input');
    const imagePreview = document.getElementById('image-preview');
    const btnCancelUpload = document.getElementById('btn-cancel-upload');
    const btnConfirmUpload = document.getElementById('btn-confirm-upload');
    const btnDeleteUpload = document.getElementById('btn-delete-upload');

    const TOTAL_CELLS = 81;
    const GRID_SIZE = 9;
    let isGameOver = false;
    let currentUploadedImage = null;
    let currentUser = null; // { id, name, role }
    let cellImages = {}; // Map: cellIndex -> base64Image
    let numbers = [];
    let users = []; // Array of User Objects (Fetched from server)
    let acknowledgedWinCount = 0;
    let isBlackoutCelebrated = false;
    let currentSelectedCell = null;

    // --- Init ---
    // No local init needed anymore.

    // Create Logout Button dynamically
    const logoutBtn = document.createElement('button');
    logoutBtn.textContent = 'Logout';
    logoutBtn.className = 'btn';
    logoutBtn.style.marginLeft = '10px';
    logoutBtn.style.backgroundColor = '#f44336'; // Red
    logoutBtn.onclick = (e) => {
        e.preventDefault();
        logout();
    };

    if (userRoleDisplay && userRoleDisplay.parentNode) {
        userRoleDisplay.parentNode.appendChild(logoutBtn);
    }

    // --- Login Logic ---
    btnLogin.addEventListener('click', handleLogin);
    userIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') userPasswordInput.focus();
    });
    userPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // Check session on load
    checkSession();

    function checkSession() {
        const storedId = localStorage.getItem('bingo_user_id');
        const lastActive = localStorage.getItem('bingo_last_active');

        if (storedId && lastActive) {
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;

            if (now - parseInt(lastActive) < fiveMinutes) {
                // Session valid, restore user
                // We need to fetch user details to get role and name
                restoreUserSession(storedId);
            } else {
                // Session expired
                logout();
            }
        }
    }

    async function restoreUserSession(id) {
        try {
            const res = await fetch('/api/users');
            const users = await res.json();
            const user = users.find(u => u.id === id);

            if (user) {
                currentUser = user;
                loginContainer.classList.add('hidden');
                updateLastActive(); // Refresh timestamp

                applyRBAC(currentUser.role);
                userRoleDisplay.textContent = `${currentUser.name} (${currentUser.role.toUpperCase()})`;
                appContainer.classList.remove('hidden');

                loadState(currentUser.id);
                startActivityHeartbeat();
            } else {
                logout(); // User not found (deleted?)
            }
        } catch (e) {
            console.error("Session restore failed", e);
        }
    }

    function updateLastActive() {
        localStorage.setItem('bingo_last_active', Date.now());
    }

    function startActivityHeartbeat() {
        // Update activity timestamp on clicks
        document.addEventListener('click', updateLastActive);
        document.addEventListener('keydown', updateLastActive);
    }

    function logout() {
        currentUser = null;
        localStorage.removeItem('bingo_user_id');
        localStorage.removeItem('bingo_last_active');

        loginContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');

        // Reset inputs
        userIdInput.value = '';
        userPasswordInput.value = '';

        // Remove listeners
        document.removeEventListener('click', updateLastActive);
        document.removeEventListener('keydown', updateLastActive);
    }

    // --- Setup Password Elements ---
    const setupModal = document.getElementById('setup-password-modal');
    const setupPasswordInput = document.getElementById('setup-new-password');
    const btnConfirmSetup = document.getElementById('btn-confirm-setup');
    let setupUserId = null; // Store temporarily

    // --- Setup Logic ---
    btnConfirmSetup.addEventListener('click', async () => {
        const newPassword = setupPasswordInput.value.trim();
        if (!/^\d{6}$/.test(newPassword)) {
            alert("Password must be 6 digits (0-9).");
            return;
        }

        try {
            const res = await fetch('/api/set-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: setupUserId, password: newPassword })
            });
            const data = await res.json();

            if (data.success) {
                // Auto login after setup
                userIdInput.value = setupUserId;
                userPasswordInput.value = newPassword;
                setupModal.classList.add('hidden');
                handleLogin(); // Retry login with new credentials
            } else {
                alert("Setup Failed: " + data.message);
            }
        } catch (e) {
            console.error("Setup error", e);
            alert("Connection error during setup.");
        }
    });


    async function handleLogin() {
        const inputId = userIdInput.value.trim();
        const inputPassword = userPasswordInput.value.trim();

        // Allow empty password if it's potentially a first-time login check
        // but generally backend handles matching. If user leaves UI blank, maybe they think...
        // Actually, for first time, they might try to login with JUST ID?
        // User said: "User ID but Pass... User set Pass themselves".
        // Let's assume they might enter just ID or ID + dummy pass. 
        // But backend `login` needs user match.
        // Wait, if password IS empty on server, `login` checks:
        // if (user.password === "") -> return requireSetup.
        // So frontend MUST send ID. Password sent doesn't matter much IF backend ignores it for the check?
        // logic in backend was: `if (user.password === "") return requireSetup`.
        // So we just need to send the ID.

        if (!inputId) {
            loginError.textContent = "Please enter ID.";
            return;
        }

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: inputId, password: inputPassword })
            });

            const data = await response.json();

            if (data.requireSetup) {
                setupUserId = inputId;
                setupModal.classList.remove('hidden');
                setupPasswordInput.value = '';
                setupPasswordInput.focus();
                return;
            }

            if (data.success) {
                currentUser = data.user;

                // Save Session
                localStorage.setItem('bingo_user_id', currentUser.id);
                updateLastActive();
                startActivityHeartbeat();

                loginContainer.classList.add('hidden');

                applyRBAC(currentUser.role);
                userRoleDisplay.textContent = `${currentUser.name} (${currentUser.role.toUpperCase()})`;
                appContainer.classList.remove('hidden');

                loadState(currentUser.id);
            } else {
                loginError.textContent = data.message || "Login failed.";
                userIdInput.classList.add('shake');
                setTimeout(() => userIdInput.classList.remove('shake'), 300);
            }
        } catch (e) {
            console.error("Login Error", e);
            loginError.textContent = "Server connection error.";
        }
    }

    function applyRBAC(role) {
        if (role === 'admin') {
            btnAdminPanel.classList.remove('hidden');
            // Inject Gallery Button if not exists
            if (!document.getElementById('btn-view-gallery')) {
                const galleryBtn = document.createElement('button');
                galleryBtn.id = 'btn-view-gallery';
                galleryBtn.textContent = 'View Gallery 📸';
                galleryBtn.className = 'btn btn-secondary';
                galleryBtn.style.marginLeft = '10px';
                galleryBtn.onclick = loadGallery;
                // Append to controls
                controlsDiv.appendChild(galleryBtn);
            }
        } else {
            // Remove if exists
            const btn = document.getElementById('btn-view-gallery');
            if (btn) btn.remove();
        }
        btnDownloadReport.classList.add('hidden');

        if (role === 'admin') {
            btnNewGame.classList.remove('hidden');
            btnReset.classList.remove('hidden');
        } else {
            btnNewGame.classList.add('hidden');
            btnReset.classList.add('hidden');
        }

        if (role === 'viewer') {
            controlsDiv.classList.add('hidden');
        }

        if (currentUser.id === '000000' || currentUser.id === '600996') {
            btnAdminPanel.classList.remove('hidden');
            btnDownloadReport.classList.remove('hidden');
        }
    }

    // --- CSV Export Logic ---
    btnDownloadReport.addEventListener('click', async () => {
        if (!confirm("Download User Progress Report (CSV)?")) return;

        try {
            // Fetch latest Users and GameStates
            const [usersRes, gamesRes] = await Promise.all([
                fetch('/api/users'),
                fetch('/api/all-gamestates')
            ]);

            const usersList = await usersRes.json();
            const allGames = await gamesRes.json();

            const headers = ["User ID", "Name", "Role", "Game Started", "Images Uploaded", "Bingo Status"];
            const rows = [headers];

            usersList.forEach(user => {
                const state = allGames[user.id];
                let gameStarted = "No";
                let imagesCount = 0;
                let bingoStatus = "Playing";
                let winTitle = "-";

                if (state) {
                    gameStarted = "Yes";
                    // Count uploaded images
                    const uploadedIndices = state.cellImages ? Object.keys(state.cellImages).map(Number) : [];
                    imagesCount = uploadedIndices.length;

                    // --- Calculate Win Lines ---
                    const GRID_SIZE = 9;
                    const TOTAL_CELLS = 81;
                    const FREE_CELL_INDEX = 40; // Center of 9x9 (Index 40)
                    let lineCount = 0;

                    const isWin = (indices) => indices.every(idx =>
                        idx === FREE_CELL_INDEX || uploadedIndices.includes(idx)
                    );

                    // Rows
                    for (let r = 0; r < GRID_SIZE; r++) {
                        const rowIndices = [];
                        for (let c = 0; c < GRID_SIZE; c++) rowIndices.push(r * GRID_SIZE + c);
                        if (isWin(rowIndices)) lineCount++;
                    }
                    // Cols
                    for (let c = 0; c < GRID_SIZE; c++) {
                        const colIndices = [];
                        for (let r = 0; r < GRID_SIZE; r++) colIndices.push(r * GRID_SIZE + c);
                        if (isWin(colIndices)) lineCount++;
                    }
                    // Diagonals
                    const d1 = [], d2 = [];
                    for (let i = 0; i < GRID_SIZE; i++) {
                        d1.push(i * GRID_SIZE + i);
                        d2.push(i * GRID_SIZE + (GRID_SIZE - 1 - i));
                    }
                    if (isWin(d1)) lineCount++;
                    if (isWin(d2)) lineCount++;

                    // Determine Title based on Line Count
                    if (imagesCount === TOTAL_CELLS) {
                        winTitle = "SUSTAIN CHAMPION (Full)";
                    } else if (lineCount >= 6) {
                        winTitle = `Advanced Sustain (${lineCount} Lines)`;
                    } else if (lineCount >= 3) {
                        winTitle = `Bingo (${lineCount} Lines)`;
                    } else if (lineCount >= 1) {
                        winTitle = `Sustain Start (${lineCount} Line)`;
                    } else {
                        winTitle = "Playing";
                    }

                    bingoStatus = winTitle;
                }

                rows.push([
                    `"${user.id}"`,
                    `"${user.name}"`,
                    user.role,
                    gameStarted,
                    imagesCount,
                    bingoStatus
                ]);
            });

            const csvContent = "data:text/csv;charset=utf-8,"
                + rows.map(e => e.join(",")).join("\n");

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `bingo_report_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (e) {
            console.error("Export failed", e);
            alert("Failed to download report.");
        }
    });

    // --- Gallery Logic ---
    function loadGallery() {
        fetch('/api/admin/uploads')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const grid = document.getElementById('gallery-grid');
                    grid.innerHTML = '';

                    if (data.files.length === 0) {
                        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #555;">No images found.</p>';
                    } else {
                        data.files.forEach(file => {
                            const item = document.createElement('div');
                            item.className = 'gallery-item';
                            item.innerHTML = `
                                <a href="${file.url}" target="_blank">
                                    <img src="${file.url}" alt="${file.filename}">
                                </a>
                                <p><strong>${file.userName}</strong></p>
                                <p style="font-size:0.7rem;">${file.userId}</p>
                            `;
                            grid.appendChild(item);
                        });
                    }
                    document.getElementById('gallery-modal').classList.remove('hidden');
                } else {
                    alert('Failed to load gallery: ' + data.message);
                }
            })
            .catch(err => console.error(err));
    }

    // --- Export User List (Credentials) ---
    const btnExportUsers = document.getElementById('btn-export-users');
    if (btnExportUsers) {
        btnExportUsers.addEventListener('click', async () => {
            if (!confirm("Download User List with Passwords (CSV)?")) return;

            try {
                const res = await fetch('/api/users');
                const usersList = await res.json();

                const headers = ["User ID", "Password", "Name", "Role"];
                const rows = [headers];

                usersList.forEach(user => {
                    rows.push([
                        `"${user.id}"`,
                        `"${user.password}"`,
                        `"${user.name}"`,
                        user.role
                    ]);
                });

                const csvContent = "data:text/csv;charset=utf-8,"
                    + rows.map(e => e.join(",")).join("\n");

                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", `bingo_users_credentials_${new Date().toISOString().slice(0, 10)}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

            } catch (e) {
                console.error("Export users failed", e);
                alert("Failed to export users.");
            }
        });
    }

    // --- Import User List (CSV) ---
    const btnImportUsers = document.getElementById('btn-import-users');
    const importModal = document.getElementById('import-modal');
    const btnCancelImport = document.getElementById('btn-cancel-import');
    const btnConfirmImport = document.getElementById('btn-confirm-import');
    const importCsvData = document.getElementById('import-csv-data');

    if (btnImportUsers) {
        btnImportUsers.addEventListener('click', () => {
            importModal.classList.remove('hidden');
            importCsvData.value = ''; // Reset
            importCsvData.focus();
        });

        btnCancelImport.addEventListener('click', () => {
            importModal.classList.add('hidden');
        });

        btnConfirmImport.addEventListener('click', async () => {
            const csvRaw = importCsvData.value.trim();
            if (!csvRaw) return alert("Please paste CSV data.");

            const rows = csvRaw.split('\n').filter(r => r.trim() !== '');
            const usersToImport = [];

            rows.forEach(row => {
                // Simple split by comma (doesn't handle quoted commas, but good enough for simple ID/Name)
                const parts = row.split(',').map(p => p.trim());
                if (parts.length >= 2) {
                    const [id, name, role = 'viewer', password = ''] = parts;
                    usersToImport.push({ id, name, role, password });
                }
            });

            if (usersToImport.length === 0) {
                return alert("No valid rows found.");
            }

            btnConfirmImport.innerText = "Importing...";
            btnConfirmImport.disabled = true;

            try {
                const res = await fetch('/api/users/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(usersToImport)
                });
                const data = await res.json();

                if (data.success) {
                    let msg = `Originally Imported: ${data.added} users.`;
                    if (data.errors && data.errors.length > 0) {
                        msg += `\n\nWarnings:\n${data.errors.slice(0, 5).join('\n')}${data.errors.length > 5 ? '\n...' : ''}`;
                    }
                    alert(msg);
                    importModal.classList.add('hidden');
                    fetchUserList();
                } else {
                    alert("Import Failed: " + data.message);
                }
            } catch (e) {
                console.error("Import error", e);
                alert("Server connection failed.");
            } finally {
                btnConfirmImport.innerText = "Import Users";
                btnConfirmImport.disabled = false;
            }
        });
    }

    // --- Admin Logic ---
    btnAdminPanel.addEventListener('click', () => {
        appContainer.classList.add('hidden');
        adminContainer.classList.remove('hidden');
        fetchUserList();
    });

    btnBackGame.addEventListener('click', () => {
        adminContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
    });

    async function fetchUserList() {
        try {
            const res = await fetch('/api/users');
            users = await res.json();
            renderUserList();
        } catch (e) {
            console.error("Fetch users failed", e);
        }
    }

    btnAddUser.addEventListener('click', async () => {
        const id = newUserInput.value.trim();
        const password = newUserPasswordInput.value.trim();
        const name = newUserNameInput.value.trim();
        const role = newUserRoleSelect.value;

        if (!/^\d{6}$/.test(id)) return alert('ID must be 6 digits');
        // Removed Password check to allow empty (setup later)
        if (!name) return alert('Please enter a name');

        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name, role, password })
            });
            const data = await res.json();

            if (data.success) {
                newUserInput.value = '';
                newUserPasswordInput.value = '';
                newUserNameInput.value = '';
                showToast('User Added!');
                fetchUserList();
            } else {
                alert(data.message);
            }
        } catch (e) {
            alert("Failed to add user");
        }
    });

    function renderUserList() {
        userListEl.innerHTML = '';
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'user-item';

            const deleteBtn = user.id === currentUser.id ?
                '' : `<button class="btn danger icon" onclick="deleteUser('${user.id}')">X</button>`;

            div.innerHTML = `
                <span>${user.id}</span>
                <span>${user.password}</span>
                <span>${user.name}</span>
                <span>${user.role}</span>
                <span>${deleteBtn}</span>
            `;
            userListEl.appendChild(div);
        });
    }

    window.deleteUser = async function (id) {
        if (confirm(`Delete user ${id}?`)) {
            try {
                const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    fetchUserList();
                } else {
                    alert('Delete failed');
                }
            } catch (e) {
                alert('Server error during delete');
            }
        }
    };

    // --- Persistence ---
    async function saveState(manual = false) {
        if (!currentUser) return;
        try {
            const state = {
                numbers: numbers,
                cellImages: cellImages,
                isGameOver: isGameOver
            };

            // Optimistic UI update (optional, but checking return is good)
            await fetch(`/api/game/${currentUser.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state)
            });

            if (manual) showToast('Game Saved! 💾');
        } catch (e) {
            console.error("Save failed", e);
            if (manual) alert("Save Failed!");
        }
    }

    async function loadState(userId) {
        try {
            const res = await fetch(`/api/game/${userId}`);
            const data = await res.json();

            if (data.success && data.state) {
                const state = data.state;
                numbers = state.numbers || [];
                cellImages = state.cellImages || {};
                isGameOver = state.isGameOver || false;

                // Static Board Definition (Must match startNewGame)
                const STATIC_NUMBERS = [17, 2, 1, 2, 7, 13, 16, 3, 17, 7, 18, 16, 20, 11, 16, 13, 12, 12, 5, 6, 7, 5, 15, 20, 11, 1, 9, 10, 16, 1, 14, 19, 5, 17, 4, 10, 3, 2, 6, 9, "FREE", 18, 7, 5, 14, 20, 2, 12, 20, 19, 4, 10, 1, 14, 11, 19, 17, 15, 12, 4, 8, 18, 9, 10, 19, 13, 14, 8, 8, 11, 6, 9, 8, 15, 3, 15, 4, 13, 6, 18, 3];

                // Check if the loaded board matches our new static board
                const currentBoardStr = JSON.stringify(numbers);
                const staticBoardStr = JSON.stringify(STATIC_NUMBERS);

                if (!numbers || numbers.length !== TOTAL_CELLS || currentBoardStr !== staticBoardStr) {
                    // Board mismatch (old user data) -> Force Reset to new board
                    console.log("Board mismatch detected. Resetting to global static board.");
                    startNewGame(true);
                } else {
                    renderGrid();
                    checkWinCondition(true);
                }
            } else {
                startNewGame(true);
            }
        } catch (e) {
            console.error("Load state failed", e);
            startNewGame(true); // Fallback
        }
    }

    function showToast(msg = 'Game Saved! 💾') {
        toast.textContent = msg;
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 2000);
    }

    // --- Game Logic ---
    if (btnSave) {
        btnSave.addEventListener('click', () => {
            saveState(true);
        });
    }

    btnNewGame.addEventListener('click', () => {
        if (confirm("Start a new game? This will clear your current progress.")) {
            startNewGame(true);
        }
    });

    btnReset.addEventListener('click', () => {
        if (confirm("Reset this board? This will clear all your images.")) {
            resetBoard();
        }
    });



    btnContinueGame.addEventListener('click', () => {
        closeWinOverlay();
        isGameOver = false;
    });

    // Modal Events
    btnCancelUpload.addEventListener('click', closeUploadModal);
    fileInput.addEventListener('change', handleFileSelect);

    btnConfirmUpload.addEventListener('click', async () => {
        if (currentSelectedCell && currentUploadedImage && currentUser) {
            btnConfirmUpload.disabled = true;
            btnConfirmUpload.innerText = "Uploading...";

            try {
                const index = currentSelectedCell.dataset.index;
                // Upload to Server
                const res = await fetch('/api/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: currentUser.id,
                        image: currentUploadedImage,
                        publicId: index
                    })
                });

                const data = await res.json();

                if (data.success) {
                    const index = currentSelectedCell.dataset.index;
                    // Store the URL now, not base64
                    cellImages[index] = data.url;
                    markCellWithImage(currentSelectedCell, data.url);
                    closeUploadModal();
                    saveState(true);
                    checkWinCondition();
                } else {
                    alert('Upload failed: ' + data.message);
                }
            } catch (e) {
                console.error("Upload error", e);
                alert("Server Error during upload.");
            } finally {
                btnConfirmUpload.disabled = false;
                btnConfirmUpload.innerText = "Save Photo";
            }
        } else {
            alert('Please select an image to upload.');
        }
    });

    btnDeleteUpload.addEventListener('click', async () => {
        if (currentSelectedCell) {
            if (confirm("Are you sure you want to delete this photo?")) {
                const index = currentSelectedCell.dataset.index;
                const imageUrl = cellImages[index];

                // Delete from Server
                if (imageUrl && currentUser) {
                    try {
                        await fetch('/api/upload', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: currentUser.id, url: imageUrl })
                        });
                    } catch (e) {
                        console.error("Failed to delete file on server", e);
                    }
                }

                // Delete from Local State
                delete cellImages[index];

                currentSelectedCell.classList.remove('active', 'win-cell');
                currentSelectedCell.style.backgroundImage = 'none';
                currentSelectedCell.style.color = '';

                closeUploadModal();
                saveState(true);
            }
        }
    });

    function startNewGame(regenerateNumbers = true) {
        isGameOver = false;
        cellImages = {};
        acknowledgedWinCount = 0;
        isBlackoutCelebrated = false;

        if (regenerateNumbers) {
            // Static Board Configuration (1-20 balanced, same for all users)
            numbers = [17, 2, 1, 2, 7, 13, 16, 3, 17, 7, 18, 16, 20, 11, 16, 13, 12, 12, 5, 6, 7, 5, 15, 20, 11, 1, 9, 10, 16, 1, 14, 19, 5, 17, 4, 10, 3, 2, 6, 9, "FREE", 18, 7, 5, 14, 20, 2, 12, 20, 19, 4, 10, 1, 14, 11, 19, 17, 15, 12, 4, 8, 18, 9, 10, 19, 13, 14, 8, 8, 11, 6, 9, 8, 15, 3, 15, 4, 13, 6, 18, 3];
        }

        renderGrid();
        animateGridEntry();
        closeWinOverlay();
        closeUploadModal();
        saveState();
        checkWinCondition();
    }

    function resetBoard() {
        isGameOver = false;
        cellImages = {};

        const cells = document.querySelectorAll('.bingo-cell');
        cells.forEach(cell => {
            const index = cell.dataset.index;
            if (numbers[index] === "FREE") return;
            cell.classList.remove('active', 'win-cell');
            cell.style.backgroundImage = 'none';
            cell.style.color = '';
        });
        closeWinOverlay();
        saveState();
    }

    function renderGrid() {
        gridContainer.innerHTML = '';
        numbers.forEach((num, index) => {
            const cell = document.createElement('div');
            cell.classList.add('bingo-cell');
            cell.textContent = num;
            cell.dataset.index = index;

            if (num === "FREE") {
                cell.classList.add('active', 'free-cell');
            }

            if (cellImages[index]) {
                markCellWithImage(cell, cellImages[index]);
            }

            cell.addEventListener('click', (e) => handleCellClick(e, cell));
            gridContainer.appendChild(cell);
        });
    }

    function handleCellClick(e, cell) {
        if (isGameOver) return;
        if (cell.textContent === "FREE") return;

        if (!currentUser || currentUser.role === 'viewer') {
            showToast('View Only Mode 🔒');
            return;
        }

        currentSelectedCell = cell;
        const index = cell.dataset.index;
        const existingImage = cellImages[index];
        openUploadModal(!!existingImage, existingImage);
    }

    function openUploadModal(isEditMode, imageUrl = null) {
        fileInput.value = '';
        currentUploadedImage = null;

        if (isEditMode) {
            imagePreview.style.backgroundImage = `url(${imageUrl})`;
            imagePreview.classList.remove('hidden');
            btnDeleteUpload.classList.remove('hidden');
            btnConfirmUpload.innerText = "Replace Photo";
            btnConfirmUpload.disabled = true;
        } else {
            imagePreview.style.backgroundImage = 'none';
            imagePreview.classList.add('hidden');
            btnDeleteUpload.classList.add('hidden');
            btnConfirmUpload.innerText = "Save Photo";
            btnConfirmUpload.disabled = true;
        }
        uploadModal.classList.remove('hidden');
    }

    function closeUploadModal() {
        uploadModal.classList.add('hidden');
        currentSelectedCell = null;
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
                const img = new Image();
                img.onload = function () {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 300;
                    const scaleSize = MAX_WIDTH / img.width;
                    const newWidth = MAX_WIDTH;
                    const newHeight = img.height * scaleSize;

                    canvas.width = newWidth;
                    canvas.height = newHeight;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, newWidth, newHeight);

                    currentUploadedImage = canvas.toDataURL('image/jpeg', 0.7);

                    imagePreview.style.backgroundImage = `url(${currentUploadedImage})`;
                    imagePreview.classList.remove('hidden');
                    btnConfirmUpload.disabled = false;
                }
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            btnConfirmUpload.disabled = true;
        }
    }

    function markCellWithImage(cell, imageUrl) {
        cell.classList.add('active');
        cell.style.backgroundImage = `url(${imageUrl})`;
        cell.style.color = 'transparent';
    }

    function checkWinCondition(silent = false) {
        if (!numbers || numbers.length === 0) return;

        const cells = Array.from(document.querySelectorAll('.bingo-cell'));
        const activeIndices = cells
            .map((cell, index) => cell.classList.contains('active') ? index : -1)
            .filter(index => index !== -1);

        const isWin = (indices) => indices.every(index => activeIndices.includes(index));
        let winningCells = new Set();
        let currentWinLineCount = 0;

        for (let row = 0; row < GRID_SIZE; row++) {
            const rowIndices = [];
            for (let col = 0; col < GRID_SIZE; col++) {
                rowIndices.push(row * GRID_SIZE + col);
            }
            if (isWin(rowIndices)) {
                currentWinLineCount++;
                rowIndices.forEach(idx => winningCells.add(idx));
            }
        }

        for (let col = 0; col < GRID_SIZE; col++) {
            const colIndices = [];
            for (let row = 0; row < GRID_SIZE; row++) {
                colIndices.push(row * GRID_SIZE + col);
            }
            if (isWin(colIndices)) {
                currentWinLineCount++;
                colIndices.forEach(idx => winningCells.add(idx));
            }
        }

        const d1 = [], d2 = [];
        for (let i = 0; i < GRID_SIZE; i++) {
            d1.push(i * GRID_SIZE + i);
            d2.push(i * GRID_SIZE + (GRID_SIZE - 1 - i));
        }
        if (isWin(d1)) {
            currentWinLineCount++;
            d1.forEach(idx => winningCells.add(idx));
        }
        if (isWin(d2)) {
            currentWinLineCount++;
            d2.forEach(idx => winningCells.add(idx));
        }

        const allCells = document.querySelectorAll('.bingo-cell');
        allCells.forEach(c => c.classList.remove('win-cell'));
        winningCells.forEach(index => {
            allCells[index].classList.add('win-cell');
        });

        const isBlackout = activeIndices.length === TOTAL_CELLS; // Ensure TOTAL_CELLS is 81 for 9x9

        if (silent) {
            acknowledgedWinCount = currentWinLineCount;
            // Exception: If it's a blackout (Champion), show it even on reload so the user sees their victory!
            if (isBlackout) {
                isBlackoutCelebrated = true;
                triggerWin(winningCells, "SUSTAIN CHAMPION!!!");
            } else if (isBlackoutCelebrated) {
                // Already celebrated?
            }
            return;
        }

        if (isBlackout && !isBlackoutCelebrated) {
            isBlackoutCelebrated = true;
            triggerWin(winningCells, "SUSTAIN CHAMPION!!!");
        } else if (currentWinLineCount > acknowledgedWinCount) {

            let title = null;

            // Priority: Check higher milestones first
            if (currentWinLineCount >= 6 && acknowledgedWinCount < 6) {
                title = "Advanced Sustain!!!";
            } else if (currentWinLineCount >= 3 && acknowledgedWinCount < 3) {
                title = "Bingo!!!";
            } else if (currentWinLineCount >= 1 && acknowledgedWinCount < 1) {
                title = "Sustain Start!!!";
            }

            acknowledgedWinCount = currentWinLineCount;

            if (title) {
                triggerWin(winningCells, title);
            } else {
                saveState();
            }
        }
    }

    function closeWinOverlay() {
        winOverlay.classList.add('hidden');
    }

    function triggerWin(winningIndices, titleText = "BINGO!") {
        if (!currentUser) return;
        saveState();

        winTitle.textContent = titleText;
        if (titleText === "SUSTAIN CHAMPION!!!") {
            // Special gradient for Champion
            winTitle.style.background = "linear-gradient(to right, #ff00cc, #333399)";
            winTitle.style.webkitBackgroundClip = "text";
        } else {
            // Default (Amber/Gold gradient from CSS handles this if we remove inline style, but let's reset to allow CSS class to work or set dynamic)
            // Actually CSS .bingo-text has a default gradient. 
            // If we want different colors for levels, we can set them here.
            // For now, let's reset inline style so CSS takes over for "Bingo" etc, OR set specific ones.
            // User didn't ask for specific colors, but "Splendid" had one.
            // Let's reset to allow CSS default (Amber) for others.
            winTitle.style.background = "";
            winTitle.style.webkitBackgroundClip = "text";
        }

        triggerFireworks();
        setTimeout(() => { winOverlay.classList.remove('hidden'); }, 300);
    }

    function triggerFireworks() {
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        // zIndex 9999 is fine if we disable pointer events in CSS
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
        const random = (min, max) => Math.random() * (max - min) + min;

        const interval = setInterval(function () {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) return clearInterval(interval);
            const particleCount = 50 * (timeLeft / duration);
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: random(0.1, 0.3), y: Math.random() - 0.2 } }));
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: random(0.7, 0.9), y: Math.random() - 0.2 } }));
        }, 250);
    }

    function animateGridEntry() {
        const cells = document.querySelectorAll('.bingo-cell');
        cells.forEach((cell, i) => {
            cell.style.opacity = '0';
            cell.style.transform = 'translateY(20px)';
            setTimeout(() => {
                cell.style.transition = 'all 0.3s ease';
                cell.style.opacity = '1';
                cell.style.transform = 'translateY(0)';
            }, i * 5);
        });
    }
});
