import { PhotosScreen } from '@/components/photo/photos-screen';

/** Photos tab (M18 — W18.1). */
export const metadata = { title: 'รูปภาพ' };

export default async function PhotosPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <PhotosScreen tripId={tripId} />;
}
