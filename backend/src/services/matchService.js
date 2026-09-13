/**
 * Server-authoritative Run Calculation Formula (Matches Unity Client)
 */
function calculateRuns(timing, direction, batsmanPower = 25) {
    const timingLower = (timing || '').toLowerCase();
    const dirLower = (direction || '').toLowerCase();

    if (timingLower === 'perfect' || timingLower === '0') {
        if (dirLower === 'loft' && batsmanPower >= 28 && Math.random() < 0.75) {
            return 6;
        }
        if (dirLower === 'defensive') {
            return Math.random() < 0.6 ? 2 : 1;
        }
        return Math.random() < 0.65 ? 4 : 6;
    }

    if (timingLower === 'good' || timingLower === '1') {
        if (dirLower === 'loft') {
            return Math.random() < 0.5 ? 4 : 2;
        }
        if (dirLower === 'defensive') {
            return 1;
        }
        return Math.random() < 0.5 ? 2 : 1;
    }

    // Early or Late timing
    if (Math.random() < 0.08) {
        return -1; // Wicket / Caught Out
    }
    return 0; // Dot Ball
}

module.exports = { calculateRuns };
