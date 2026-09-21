const { ApiError } = require('./response');

// Opening hours are stored per vendor as JSON:
//   { mon: { open: "08:00", close: "21:00" }, tue: {...}, ..., sun: null }
// A day set to null is closed all day. A vendor with NO opening_hours (NULL)
// is treated as always open, so existing vendors don't vanish when this ships.
// A close time earlier than the open time means the shop closes after
// midnight (e.g. 18:00 -> 02:00). All times are Lagos time.

const TIMEZONE = 'Africa/Lagos';
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// "21:00" -> "9:00 PM"
const formatTime = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
};

// Validates + normalises what a vendor submits. Returns the clean object, or
// null when the vendor is switching opening hours off (always open).
const validateOpeningHours = (input) => {
  if (input === null || input === undefined || input === '') return null;

  let value = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new ApiError(422, 'opening_hours must be valid JSON.');
    }
  }
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(422, 'opening_hours must be an object with a key for each day (mon-sun).');
  }

  const normalized = {};
  for (const key of DAY_KEYS) {
    const day = value[key];
    if (day === null || day === undefined) {
      normalized[key] = null;
      continue;
    }
    if (typeof day !== 'object' || !TIME_RE.test(String(day.open)) || !TIME_RE.test(String(day.close))) {
      throw new ApiError(422, `${DAY_LABELS[key]}: use 24-hour times like "08:00" for open and close.`);
    }
    if (day.open === day.close) {
      throw new ApiError(422, `${DAY_LABELS[key]}: opening and closing time can't be the same.`);
    }
    normalized[key] = { open: day.open, close: day.close };
  }

  if (DAY_KEYS.every((k) => normalized[k] === null)) {
    throw new ApiError(
      422,
      'Set at least one open day, or switch off opening hours to stay open all the time. To stop taking orders for now, use "Pause orders".'
    );
  }
  return normalized;
};

const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Day-of-week (0 = Monday) and minutes since midnight in Lagos.
const getLagosClock = (date = new Date()) => {
  const parts = clockFormatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekday = String(get('weekday')).toLowerCase().slice(0, 3);
  return {
    dayIndex: DAY_KEYS.indexOf(weekday),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
};

const parseHours = (hours) => {
  if (!hours) return null;
  if (typeof hours === 'string') {
    try {
      return JSON.parse(hours);
    } catch {
      return null;
    }
  }
  return hours;
};

// -> { is_open, status: 'open' | 'closed' | 'paused', label }
// label is customer-facing: "Open until 9:00 PM", "Opens tomorrow 8:00 AM",
// "Not taking orders right now", or null when there are no hours to describe.
const getOpenStatus = (vendor, now = new Date()) => {
  if (vendor?.orders_paused) {
    return { is_open: false, status: 'paused', label: 'Not taking orders right now' };
  }

  const hours = parseHours(vendor?.opening_hours);
  if (!hours) return { is_open: true, status: 'open', label: null };

  const { dayIndex, minutes } = getLagosClock(now);
  const today = hours[DAY_KEYS[dayIndex]];
  const yesterday = hours[DAY_KEYS[(dayIndex + 6) % 7]];

  const open = (until) => ({ is_open: true, status: 'open', label: `Open until ${formatTime(until)}` });
  const closed = (label) => ({ is_open: false, status: 'closed', label });

  // Still inside yesterday's after-midnight window?
  if (yesterday && toMinutes(yesterday.close) < toMinutes(yesterday.open) && minutes < toMinutes(yesterday.close)) {
    return open(yesterday.close);
  }

  if (today) {
    const o = toMinutes(today.open);
    const c = toMinutes(today.close);
    const overnight = c < o;
    const isOpen = overnight ? minutes >= o : minutes >= o && minutes < c;
    if (isOpen) return open(today.close);
    if (minutes < o) return closed(`Opens ${formatTime(today.open)}`);
  }

  for (let i = 1; i <= 7; i += 1) {
    const key = DAY_KEYS[(dayIndex + i) % 7];
    const day = hours[key];
    if (day) {
      return closed(i === 1 ? `Opens tomorrow ${formatTime(day.open)}` : `Opens ${DAY_LABELS[key]} ${formatTime(day.open)}`);
    }
  }
  return closed('Closed');
};

// Sentence used when checkout is blocked, e.g.
// "Mama Put is closed right now. Opens 8:00 AM."
const closedMessage = (businessName, status) => {
  const name = businessName || 'A vendor';
  if (status.status === 'paused') return `${name} isn't taking orders right now.`;
  return `${name} is closed right now.${status.label ? ` ${status.label}.` : ''}`;
};

module.exports = { TIMEZONE, DAY_KEYS, validateOpeningHours, getOpenStatus, closedMessage, formatTime };
