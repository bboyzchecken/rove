/**
 * Feedback #4 — F9/D-13: opening an ongoing trip goes straight to Trip Mode.
 * "ดูทั้งห้อง" is the one way out of that loop, and it has to stick for the
 * rest of the visit — sessionStorage is the natural home for "not for this
 * tab reload, but not forever either."
 */
const KEY_PREFIX = 'rove:room-view:';

export function markRoomViewed(tripId: string) {
  try {
    sessionStorage.setItem(KEY_PREFIX + tripId, '1');
  } catch {
    // Private browsing or storage blocked — the redirect may fire again,
    // which is a minor annoyance, not a broken flow.
  }
}

export function hasViewedRoom(tripId: string) {
  try {
    return sessionStorage.getItem(KEY_PREFIX + tripId) === '1';
  } catch {
    return false;
  }
}
