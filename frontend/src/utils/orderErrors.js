/**
 * Parses duplicate order error messages from the backend
 * @param {string} errorMessage - The error message from the API response
 * @param {string} orderType - The type of order ('deposit' or 'withdraw')
 * @returns {Object|null} - Returns { orderId: string } if duplicate order error, null otherwise
 */
export function parseDuplicateOrderError(errorMessage, orderType) {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return null;
  }
  
  // Try primary pattern first (exact match)
  const exactPattern = new RegExp(
    `You already have an active ${orderType} order.*Order #(\\d+)`,
    'i'
  );
  
  let match = errorMessage.match(exactPattern);
  
  // Fallback to more generic pattern if exact doesn't match
  if (!match) {
    const genericPattern = /already have an active.*order.*#(\d+)/i;
    match = errorMessage.match(genericPattern);
  }
  
  if (match && match[1]) {
    return {
      orderId: match[1],
    };
  }
  
  return null;
}
