import { CreatorScreen } from '@/components/public/creator-screen';
import { isSignedIn } from '@/lib/session';

/** Creator profile (M11 — W11.2). */
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return { title: `@${handle}` };
}

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return <CreatorScreen handle={handle} signedIn={await isSignedIn()} />;
}
