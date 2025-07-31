/** Misc. general purpose utilities and helpers. */

window.utils = (function()
{
  /**
   * Map values between 0 and 100 to min-max logarithmically or exponentially.
   * @param {number} min output at 0%
   * @param {number} max output at 100%
   * @param {number} percent input 0–100
   * @param {number} [curve=4] 1 = linear, higher = more resolution near min
   * @returns {number} scaled value
   */
  function percentToExp(min, max, percent, curve = 4) {
    if (min >= max || percent < 0 || percent > 100) {
      throw new Error(`invalid params: ${min}-${max}, ${percent}`);
    }

    const t = percent / 100;
    const adjusted = Math.pow(t, curve);
    return min + (max - min) * adjusted;
  }


  /**
   * Map exponential values between min-max to 0–100 slider percentage.
   * @param {number} min input min -> 0
   * @param {number} max input max -> 100
   * @param {number} value actual value
   * @param {number} [curve=4] 1 = linear, higher = more resolution near min
   * @returns {number} slider percent (0–100)
   */
  function expToPercent(min, max, value, curve = 4) {
    if (min >= max || value < min || value > max) {
      throw new Error(`invalid params: ${min}-${max}, ${value}`);
    }

    const linearT = (value - min) / (max - min);
    const percent = Math.pow(linearT, 1 / curve);
    return percent * 100;
  }


  /**
   * Transform a range value to a text input value.
   * @param {number} val current range input value
   * @param {{min: number, max: number }|null} logScaling parameters for log scaling; null = linear
   * @param {number|null} decimals fixed number of decimals, null = not applied
   * @returns {number}
   */
  function rangeToText(val, logScaling=null, decimals=null) {
    const resolvedValue =
      logScaling
      ? percentToExp(logScaling.min, logScaling.max, val)
      : Number(val);
    return (
      decimals === null
      ? resolvedValue
      : resolvedValue.toFixed(decimals)
    );
  }


  /**
   * Attempt to map a text input value to a range value. Returns null on invalid input.
   * @param {string} val current text input value
   * @param {number} min lowest permissible value
   * @param {number} max highest permissible value
   * @param {boolean} isLog whether to apply logarithmic scaling
   * @param {number|null} decimals fixed number of decimals, null = not applied
   * @returns {number|null} null on failure
   */
  function textToRange(val, min, max, isLog=false, decimals=null) {
    const numVal = Number(val);
    if (isNaN(numVal) || numVal < min || numVal > max) {
      ui.makeToast("error", `Value must be a number between ${min} and ${max}!`);
      return null;
    }
    const resolvedValue =
      isLog
      ? expToPercent(min, max, numVal)
      : numVal;
    return (
      decimals === null
      ? resolvedValue
      : resolvedValue.toFixed(decimals)
    );
  }


  return {
    qs: (sel) => document.querySelector(sel),
    qsa: (sel) => document.querySelectorAll(sel),
    rangeToText,
    textToRange,
  }
})();
