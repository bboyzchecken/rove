import { KycDetailScreen } from '@/components/admin/kyc-detail-screen';

export default async function AdminKycDetailPage({
  params,
}: {
  params: Promise<{ verificationId: string }>;
}) {
  const { verificationId } = await params;
  return <KycDetailScreen verificationId={verificationId} />;
}
