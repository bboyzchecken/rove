import { TripShell } from '@/components/trip/trip-shell';

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  return <TripShell tripId={tripId}>{children}</TripShell>;
}
