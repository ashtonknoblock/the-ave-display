// Major US holidays that people usually have off. Computed, no internet needed.
function nthWeekday(year, month, weekday, n) {
  // n >= 1: nth weekday of month; n = -1: last one
  if (n > 0) {
    const first = new Date(year, month, 1);
    return new Date(year, month, 1 + ((7 + weekday - first.getDay()) % 7) + (n - 1) * 7);
  }
  const last = new Date(year, month + 1, 0);
  return new Date(year, month, last.getDate() - ((7 + last.getDay() - weekday) % 7));
}

function holidaysFor(year) {
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  return [
    { date: new Date(year, 0, 1), name: "New Year's Day" },
    { date: nthWeekday(year, 0, 1, 3), name: "MLK Day" },
    { date: nthWeekday(year, 4, 1, -1), name: "Memorial Day" },
    { date: new Date(year, 5, 19), name: "Juneteenth" },
    { date: new Date(year, 6, 4), name: "Independence Day" },
    { date: nthWeekday(year, 8, 1, 1), name: "Labor Day" },
    { date: thanksgiving, name: "Thanksgiving" },
    { date: new Date(year, 10, thanksgiving.getDate() + 1), name: "Day after Thanksgiving" },
    { date: new Date(year, 11, 24), name: "Christmas Eve" },
    { date: new Date(year, 11, 25), name: "Christmas" },
    { date: new Date(year, 11, 31), name: "New Year's Eve" },
  ];
}

// Holidays between two dates (inclusive)
function holidaysBetween(from, to) {
  const out = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    for (const h of holidaysFor(y)) if (h.date >= from && h.date <= to) out.push(h);
  }
  return out;
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

module.exports = { holidaysBetween, dayKey };
