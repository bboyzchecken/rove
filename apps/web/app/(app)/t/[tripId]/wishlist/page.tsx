import { WishlistScreen } from '@/components/wishlist/wishlist-screen';

/** Wishlist tab (M3 — W3.2 editor + W3.3 coverage board + W3.4 nudge). */
export const metadata = { title: 'ที่อยากไป' };

export default async function WishlistPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <WishlistScreen tripId={tripId} />;
}
