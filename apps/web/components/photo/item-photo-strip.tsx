'use client';

import { useState } from 'react';
import Image from 'next/image';

import { UploadPhotoButton } from '@/components/photo/photos-screen';
import { usePhotos, useUploadPhoto } from '@/features/media/queries';
import { photoFromFile } from '@/lib/image';

/**
 * The photos taken at one stop (M18 — W18.2/W18.3).
 *
 * Sits on the item card and is the IG-style grid for that POI: this is the
 * place where "we went here" turns into "here is what it looked like", which
 * is exactly why the upload button lives beside the picture rather than on a
 * separate tab you have to remember to visit.
 */
export function ItemPhotoStrip({ tripId, itemId }: { tripId: string; itemId: string }) {
  const { data: photos = [] } = usePhotos(tripId, { itemId });
  const upload = useUploadPhoto(tripId);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File) => {
    setError(null);
    try {
      upload.mutate({ file: await photoFromFile(file), itemId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อัปโหลดไม่สำเร็จ');
    }
  };

  return (
    <div className="mt-2.5">
      {photos.length > 0 ? (
        <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
          {photos.map((photo) => (
            <span
              key={photo.id}
              className="bg-surface relative size-16 shrink-0 overflow-hidden rounded-xl"
            >
              {photo.url ? (
                <Image
                  src={photo.url}
                  alt={photo.caption || ''}
                  fill
                  unoptimized
                  sizes="64px"
                  className="object-cover"
                />
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      <UploadPhotoButton
        pending={upload.isPending}
        onPick={pick}
        variant="soft"
        label={photos.length > 0 ? 'เพิ่มอีกรูป' : 'เพิ่มรูปที่นี่'}
      />

      {error ? <p className="text-warning mt-1.5 text-[11px]">{error}</p> : null}
    </div>
  );
}
