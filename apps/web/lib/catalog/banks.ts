/**
 * Banks a creator can be paid into (Feedback #4 — D-22). The API stores the
 * code as given, so this list is the one place the options live.
 */
export const THAI_BANKS = [
  { code: 'KBANK', name: 'กสิกรไทย' },
  { code: 'SCB', name: 'ไทยพาณิชย์' },
  { code: 'BBL', name: 'กรุงเทพ' },
  { code: 'KTB', name: 'กรุงไทย' },
  { code: 'BAY', name: 'กรุงศรีอยุธยา' },
  { code: 'TTB', name: 'ทีทีบี' },
  { code: 'GSB', name: 'ออมสิน' },
  { code: 'BAAC', name: 'ธ.ก.ส.' },
  { code: 'GHB', name: 'อาคารสงเคราะห์' },
  { code: 'UOB', name: 'ยูโอบี' },
  { code: 'CIMBT', name: 'ซีไอเอ็มบี ไทย' },
  { code: 'KKP', name: 'เกียรตินาคินภัทร' },
  { code: 'LHB', name: 'แลนด์ แอนด์ เฮ้าส์' },
  { code: 'TISCO', name: 'ทิสโก้' },
] as const;

export function bankName(code: string) {
  return THAI_BANKS.find((bank) => bank.code === code)?.name ?? code;
}

/** "กสิกรไทย ••1234" or "พร้อมเพย์ ••1234". */
export function accountLabel(kind: string, bankCode: string, last4: string) {
  const where = kind === 'promptpay' ? 'พร้อมเพย์' : bankName(bankCode);
  return last4 ? `${where} ••${last4}` : where;
}
