const VALID_TYPES = new Set(['rash_driving', 'tow', 'collision', 'toppling']);

/**
 * Returns server-stamped event objects derived from a device frame.
 * Primary detection lives on the ESP32; here we just pass through frame.events[]
 * and attach a serverTs to each for accurate DB timestamps.
 *
 * @param {object} frame         - parsed frame from the ESP32
 * @param {object} previousFrame - last accepted frame (unused for now, reserved)
 * @returns {Array<object>}
 */
function classifyFrame(frame, previousFrame) {
  if (!Array.isArray(frame.events) || frame.events.length === 0) return [];

  const serverTs = Date.now();

  return frame.events
    .filter((ev) => VALID_TYPES.has(ev.type))
    .map((ev) => ({
      type: ev.type,
      severity: ev.severity ?? 'unknown',
      metrics: ev.metrics ?? {},
      deviceTs: ev.deviceTs ?? frame.deviceTs ?? null,
      serverTs,
    }));
}

module.exports = { classifyFrame };
