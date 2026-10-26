// Calculate in hundredths, then convert the final sum to rating points.
const weights = { clear: 100, fc: 105, ap: 110 };

function chartRatingHundredths(level, status) {
  return level * (weights[status] || 0);
}

export function calculateChartRating(level, status) {
  return chartRatingHundredths(level, status) / 100;
}

export function calculateRating(songs, records) {
  const scores = [];
  for (const song of songs) {
    let bestScore = 0;
    for (const [difficulty, level] of Object.entries(song.levels)) {
      bestScore = Math.max(bestScore, chartRatingHundredths(level, records.get(`${song.id}:${difficulty}`)));
    }
    if (bestScore) scores.push(bestScore);
  }
  return scores.sort((a, b) => b - a).slice(0, 50).reduce((total, score) => total + score, 0) / 100;
}
