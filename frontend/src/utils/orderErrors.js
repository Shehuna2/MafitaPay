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
  
  // Create regex pattern based on order type
  const pattern = new RegExp(
    `You already have an active ${orderType} order.*Order #(\\d+)`,
    'i'
  );
  
  const match = errorMessage.match(pattern);
  
  if (match && match[1]) {
    return {
      orderId: match[1],
    };
  }
  
  return null;
}
