// Calculate in hundredths, then convert the final sum to rating points.
const weights = { clear: 200, fc: 210, ap: 220 };

function chartRatingHundredths(level, status) {
  return level * (weights[status] || 0);
}

export function calculateChartRating(level, status) {
  return chartRatingHundredths(level, status) / 100;
}

export function getRatingBreakdown(songs, records) {
  const bestCharts = [];
  for (const song of songs) {
    let best = null;
    for (const [difficulty, level] of Object.entries(song.levels)) {
      const status = records.get(`${song.id}:${difficulty}`);
      const score = chartRatingHundredths(level, status);
      // On a tie, preserve the catalog's difficulty order (Expert first).
      if (score > (best?.score ?? 0)) best = { songId: song.id, difficulty, level, status, score };
    }
    if (best) bestCharts.push(best);
  }
  // Stable sorting also preserves catalog order when songs have equal scores.
  const top = bestCharts.sort((a, b) => b.score - a.score).slice(0, 50);
  return {
    total: top.reduce((total, chart) => total + chart.score, 0) / 100,
    entries: top.map(({ score, ...chart }) => ({ ...chart, rating: score / 100 }))
  };
}

export function calculateRating(songs, records) {
  return getRatingBreakdown(songs, records).total;
}
