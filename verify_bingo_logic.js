
// Mock Logic from script.js
const GRID_SIZE = 9;
const TOTAL_CELLS = 81;
const FREE_CELL_INDEX = 40;

function calculateStatus(uploadedIndices) {
    let lineCount = 0;

    // Logic from script.js
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

    // Determine Title
    let winTitle = "-";
    // IMPORTANT: imagesCount in script.js is uploadedIndices.length
    // But logic check is (imagesCount === TOTAL_CELLS) which implies ALL 81 cells filled.
    // Wait, FREE cell is NOT uploaded. So imagesCount for Full Board would be 80?
    // Let's check script.js logic: 
    // "imagesCount = uploadedIndices.length;"
    // "if (imagesCount === TOTAL_CELLS) { winTitle = ... }"
    // IF total cells is 81. And Free cell is skipped. Max uploads is 80.
    // BUG FOUND? If Free cell is never uploaded, count max is 80.
    // 80 === 81 is FALSE.
    // So "Full" win might never trigger if logic is naive.
    // Let's test this hypothesis in this script.

    // Fix logic for "Full" in simulation to match script.js exactly
    const imagesCount = uploadedIndices.length;

    // Fixed Logic:
    if (imagesCount >= TOTAL_CELLS - 1) {
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
    return { lineCount, winTitle, imagesCount };
}

// --- Test Cases ---

console.log("--- Testing Bingo Logic ---\n");

// 1. One Row (Row 0)
const row0 = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const res1 = calculateStatus(row0);
console.log(`[1 Row] Expected: 1 Line. Result: ${res1.lineCount} Lines -> ${res1.winTitle}`);

// 2. Center Row (Row 4) - Includes Free Cell (Index 40)
// We provide all EXCEPT 40.
const row4 = [36, 37, 38, 39, 41, 42, 43, 44];
const res2 = calculateStatus(row4);
console.log(`[Center Row (Free Cell)] Expected: 1 Line. Result: ${res2.lineCount} Lines -> ${res2.winTitle}`);

// 3. 3 Rows (Row 0, 1, 2)
const rows3 = [...Array(27).keys()]; // 0-26
const res3 = calculateStatus(rows3);
console.log(`[3 Rows] Expected: 3 Lines. Result: ${res3.lineCount} Lines -> ${res3.winTitle}`);

// 4. 6 Rows (Row 0-5)
const rows6 = [...Array(54).keys()]; // 0-53
const res4 = calculateStatus(rows6);
console.log(`[6 Rows] Expected: 6 Lines. Result: ${res4.lineCount} Lines -> ${res4.winTitle}`);

// 5. Full Board (All 81 cells EXCEPT 40 if user doesn't upload it, or WITH 40?)
// Usually users don't upload to Free cell (it's not clickable or pre-filled).
// If script says "imagesCount = uploadedIndices.length", and we need count === 81...
// We need to see if 80 works.
// Test with 80 cells (all except 40)
const allExceptFree = [...Array(81).keys()].filter(x => x !== 40);
const res5 = calculateStatus(allExceptFree);
console.log(`[Full Board (80 items)] Expected: Full. Result: count=${res5.imagesCount}, Title=${res5.winTitle}`);

// Test with 81 cells (someone hacked/uploaded to free?)
const all81 = [...Array(81).keys()];
const res6 = calculateStatus(all81);
console.log(`[Full Board (81 items)] Expected: Full. Result: count=${res6.imagesCount}, Title=${res6.winTitle}`);
