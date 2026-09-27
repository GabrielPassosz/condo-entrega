function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(value.year),
    month: Number(value.month),
    day: Number(value.day),
    hour: Number(value.hour),
    minute: Number(value.minute),
    second: Number(value.second),
  };
}

function localDateTimeToUtc(
  input: { year: number; month: number; day: number },
  timeZone: string,
) {
  const target = Date.UTC(input.year, input.month - 1, input.day);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    guess += target - represented;
  }
  return new Date(guess);
}

export function localDayRange(timeZone: string, now = new Date()) {
  let current;
  try {
    current = zonedParts(now, timeZone);
  } catch {
    current = zonedParts(now, "UTC");
    timeZone = "UTC";
  }
  const nextCalendarDay = new Date(
    Date.UTC(current.year, current.month - 1, current.day + 1),
  );
  return {
    start: localDateTimeToUtc(current, timeZone).toISOString(),
    end: localDateTimeToUtc(
      {
        year: nextCalendarDay.getUTCFullYear(),
        month: nextCalendarDay.getUTCMonth() + 1,
        day: nextCalendarDay.getUTCDate(),
      },
      timeZone,
    ).toISOString(),
  };
}

export function expiryDate(days: number, now = new Date()) {
  return new Date(
    now.getTime() + Math.max(1, Math.min(days, 3650)) * 86_400_000,
  ).toISOString();
}
