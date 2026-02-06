const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GAMESTATES_FILE = path.join(DATA_DIR, 'gamestates.json');

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Increased limit for images
app.use(express.static(path.join(__dirname, 'public')));
// Serve uploaded images
const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
// Note: '/uploads' URL path maps to 'data/uploads' directory
app.use('/uploads', express.static(UPLOAD_DIR));

// Helper to read JSON
function readJSON(file, defaultValue = []) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2));
        return defaultValue;
    }
    try {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error(`Error reading ${file}:`, e);
        return defaultValue;
    }
}

// Helper to write JSON
function writeJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        console.error(`Error writing ${file}:`, e);
        return false;
    }
}

// --- Routes ---

// Upload Image Endpoint (Local File System)
app.post('/api/upload', (req, res) => {
    const { userId, image, publicId } = req.body;

    if (!userId || !image) {
        return res.status(400).json({ success: false, message: 'Missing userId or image' });
    }

    try {
        // Decode Base64
        // Format: "data:image/png;base64,iVBORw0KG..."
        const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

        if (!matches || matches.length !== 3) {
            return res.status(400).json({ success: false, message: 'Invalid image format' });
        }

        const type = matches[1]; // e.g., image/png
        const buffer = Buffer.from(matches[2], 'base64');
        const extension = type.split('/')[1] || 'png';

        // Generate Query-safe and File-system safe name
        // Use userId and index (publicId) if available, else timestamp
        const safeIndex = publicId ? publicId : Date.now();
        const fileName = `${userId}_${safeIndex}.${extension}`;
        const filePath = path.join(UPLOAD_DIR, fileName);

        fs.writeFileSync(filePath, buffer);
        console.log(`Saved image to ${filePath}`);

        // Return the local static URL
        const fileUrl = `/uploads/${fileName}`;
        res.json({ success: true, url: fileUrl });

    } catch (e) {
        console.error("Local upload failed", e);
        res.status(500).json({ success: false, message: 'Server upload failed: ' + e.message });
    }
});

// List All Uploads Endpoint (Admin Only - simplified check)
app.get('/api/admin/uploads', (req, res) => {
    // In a real app, verify admin session token here.
    // For now, we trust the frontend UI hiding mechanism (Admin Dashboard).

    try {
        if (!fs.existsSync(UPLOAD_DIR)) {
            return res.json({ success: true, files: [] });
        }

        const files = fs.readdirSync(UPLOAD_DIR);
        // Filter for images
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext);
        });

        // Search for user ID in filename (assuming FORMAT: USERID_TIMESTAMP.ext)
        // We will map to user names for better UI
        const users = readJSON(USERS_FILE);
        const userMap = {};
        users.forEach(u => userMap[u.id] = u.name);

        const fileData = imageFiles.map(file => {
            const userId = file.split('_')[0]; // Extract ID
            return {
                url: `/uploads/${file}`,
                filename: file,
                userId: userId,
                userName: userMap[userId] || 'Unknown User'
            };
        });

        res.json({ success: true, files: fileData });

    } catch (e) {
        console.error("List uploads failed", e);
        res.status(500).json({ success: false, message: 'Server error listing files' });
    }
});
// --- End Admin API ---
app.delete('/api/upload', (req, res) => {
    const { userId, url } = req.body;

    if (!userId || !url) {
        return res.status(400).json({ success: false, message: 'Missing userId or url' });
    }

    try {
        // Extract filename from URL: /uploads/FILENAME.png
        const fileName = url.split('/').pop();
        const filePath = path.join(UPLOAD_DIR, fileName);

        // Security check: Ensure we are deleting a file belonging to this user (simple prefix check)
        if (!fileName.startsWith(userId + '_')) {
            return res.status(403).json({ success: false, message: 'Unauthorized deletion' });
        }

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Deleted file: ${filePath}`);
            res.json({ success: true });
        } else {
            res.json({ success: true, message: 'File not found, cleared from state' });
        }
    } catch (e) {
        console.error("Delete file failed", e);
        res.status(500).json({ success: false, message: 'Server delete failed' });
    }
});


// Login
app.post('/api/login', (req, res) => {
    const { id, password } = req.body;
    const users = readJSON(USERS_FILE);

    // Find user by ID first
    const user = users.find(u => u.id === id);

    if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if First Time Setup is needed (Empty Password)
    if (user.password === "") {
        return res.json({ success: false, requireSetup: true, message: 'First time setup required' });
    }

    // Normal Login Check
    if (user.password === password) {
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Set Password (First Time Setup)
app.post('/api/set-password', (req, res) => {
    const { id, password } = req.body;

    if (!id || !password || !/^\d{6}$/.test(password)) {
        return res.status(400).json({ success: false, message: 'Password must be 6 digits' });
    }

    const users = readJSON(USERS_FILE);
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Only allow setting if currently empty (or allow reset if needed, but per req, this is for first time)
    // We'll allow it generally for this authenticated-by-ID flow as it implies the user passed the initial check or is being set now.
    // Ideally we'd verify "old password" but here the old is null.

    users[userIndex].password = password;

    if (writeJSON(USERS_FILE, users)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ success: false, message: 'Failed to update password' });
    }
});

// Get Users (Admin only - middleware omitted for simplicity, but logic exists in frontend)
app.get('/api/users', (req, res) => {
    const users = readJSON(USERS_FILE);
    res.json(users);
});

// Add User
app.post('/api/users', (req, res) => {
    const users = readJSON(USERS_FILE);
    const { id, name, role, password } = req.body;

    if (users.some(u => u.id === id)) {
        return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Allow empty password for "Setup Later"
    const finalPassword = password ? password : "";

    const newUser = { id, name, role, password: finalPassword };
    users.push(newUser);
    if (writeJSON(USERS_FILE, users)) {
        res.json({ success: true, user: newUser });
    } else {
        res.status(500).json({ success: false, message: 'Failed to save user' });
    }
});

// Bulk Add Users
app.post('/api/users/bulk', (req, res) => {
    const newUsers = req.body; // Expecting Array of {id, name, role, password}
    if (!Array.isArray(newUsers) || newUsers.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid data format' });
    }

    let users = readJSON(USERS_FILE);
    let addedCount = 0;
    let errors = [];

    newUsers.forEach((u, index) => {
        if (!u.id || !u.name) {
            errors.push(`Row ${index + 1}: Missing ID or Name`);
            return;
        }
        if (users.some(existing => existing.id === u.id)) {
            // Option: Skip or Update? Let's Skip duplicates to be safe
            errors.push(`Row ${index + 1}: ID ${u.id} already exists`);
            return;
        }

        // Default Role
        const role = ['admin', 'player'].includes(u.role) ? u.role : 'player';
        const password = u.password ? String(u.password) : ""; // Default empty

        users.push({
            id: String(u.id),
            name: String(u.name),
            role: role,
            password: password
        });
        addedCount++;
    });

    if (addedCount > 0) {
        if (writeJSON(USERS_FILE, users)) {
            res.json({ success: true, added: addedCount, errors: errors });
        } else {
            res.status(500).json({ success: false, message: 'Failed to write to database' });
        }
    } else {
        res.json({ success: false, message: 'No users added', errors: errors });
    }
});

// Delete User
// Delete User
app.delete('/api/users/:id', (req, res) => {
    const { id } = req.params;
    let users = readJSON(USERS_FILE);
    const initialLength = users.length;
    users = users.filter(u => u.id !== id);

    if (users.length < initialLength) {
        writeJSON(USERS_FILE, users);

        // --- Cleanup User Data ---
        try {
            // 1. Delete Game State
            const gameStates = readJSON(GAMESTATES_FILE, {});
            if (gameStates[id]) {
                delete gameStates[id];
                writeJSON(GAMESTATES_FILE, gameStates);
                console.log(`Deleted game state for user ${id}`);
            }

            // 2. Delete Uploaded Images
            if (fs.existsSync(UPLOAD_DIR)) {
                const files = fs.readdirSync(UPLOAD_DIR);
                files.forEach(file => {
                    if (file.startsWith(`${id}_`)) {
                        fs.unlinkSync(path.join(UPLOAD_DIR, file));
                        console.log(`Deleted file: ${file}`);
                    }
                });
            }
        } catch (e) {
            console.error("Error cleaning up user data:", e);
            // Non-critical error, user is deleted anyway
        }
        // --- End Cleanup ---

        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'User not found' });
    }
});

// Get Game State
app.get('/api/game/:userId', (req, res) => {
    const { userId } = req.params;
    const gameStates = readJSON(GAMESTATES_FILE, {});
    const state = gameStates[userId] || null;
    res.json({ success: true, state });
});

// Save Game State
app.post('/api/game/:userId', (req, res) => {
    const { userId } = req.params;
    const state = req.body;
    const gameStates = readJSON(GAMESTATES_FILE, {});

    gameStates[userId] = state;

    if (writeJSON(GAMESTATES_FILE, gameStates)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ success: false, message: 'Failed to save game state' });
    }
});

// Get All Game States (For Admin Report)
app.get('/api/all-gamestates', (req, res) => {
    const gameStates = readJSON(GAMESTATES_FILE, {});
    res.json(gameStates);
});

// Initialize Default Data if missing
if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = [
        { id: '000000', name: 'System Admin', role: 'admin', password: '000000' },
        { id: '600996', name: 'Pornsit', role: 'player', password: '123456' },
        { id: '600997', name: 'User 600997', role: 'player', password: '123456' },
        { id: '600998', name: 'User 600998', role: 'player', password: '123456' },
        { id: '600999', name: 'User 600999', role: 'player', password: '123456' },
        { id: '450880', name: 'Kked', role: 'player', password: '123456' },
        { id: '001146', name: 'Sabishiyo', role: 'player', password: '123456' },
        { id: '000568', name: 'kaejung', role: 'player', password: '123456' }
    ];
    writeJSON(USERS_FILE, defaultUsers);
    console.log('Initialized users.json');
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
