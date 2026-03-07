const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeString(value) {
  return TIME_PATTERN.test(String(value || '').trim());
}

export function isValidTimezone(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  try {
    const supported = Intl.supportedValuesOf('timeZone');
    return supported.includes(value);
  } catch {
    return false;
  }
}

export function getDateInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(date);
}

export function getTimeInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return formatter.format(date);
}

export function isDueAtMinute(date, timezone, targetHHMM) {
  return getTimeInTimezone(date, timezone) === targetHHMM;
}
