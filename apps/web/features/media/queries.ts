'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { repo } from '@/lib/data';
import type { UploadDocumentInput, UploadPhotoInput } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/**
 * Photos (M18) and the document folder (M19).
 *
 * Both upload real files, so neither is optimistic: showing a picture before
 * the bytes have landed is how a UAT tester ends up with a grid of images that
 * disappear on reload.
 */

export function usePhotos(tripId: string, filter?: { dayId?: string; itemId?: string }) {
  const key = filter?.itemId ?? filter?.dayId ?? '';
  return useQuery({
    queryKey: queryKeys.photos(tripId, key),
    queryFn: () => repo.photos.list(tripId, filter),
    enabled: Boolean(tripId),
  });
}

export function useUploadPhoto(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadPhotoInput) => repo.photos.upload(tripId, input),
    onSuccess: (_photo, input) => {
      track('photo_uploaded', { from_item: Boolean(input.itemId) });
      // Every filtered view of the same trip is now stale.
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId, 'photos'] });
    },
  });
}

export function useRemovePhoto(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => repo.photos.remove(tripId, photoId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId, 'photos'] }),
  });
}

export function useDocuments(tripId: string) {
  return useQuery({
    queryKey: queryKeys.documents(tripId),
    queryFn: () => repo.documents.list(tripId),
    enabled: Boolean(tripId),
  });
}

export function useUploadDocument(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadDocumentInput) => repo.documents.upload(tripId, input),
    onSuccess: (doc) => {
      track('document_uploaded', { category: doc.category });
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents(tripId) });
    },
  });
}

export function useRemoveDocument(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => repo.documents.remove(tripId, documentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents(tripId) }),
  });
}
