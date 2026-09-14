import { redirect } from 'next/navigation';

/**
 * "ทริปของฉัน" merged into the home screen (Feedback #2 — D-6). Invite mails
 * and bookmarks still say /trips, so the address keeps answering.
 */
export default function TripsPage() {
  redirect('/home');
}
