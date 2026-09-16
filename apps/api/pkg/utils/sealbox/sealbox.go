// Package sealbox encrypts the identity and bank numbers a creator hands over
// to get paid (Feedback #4 — F11). AES-256-GCM for the value, HMAC-SHA256 with a
// derived key for the lookup hash, so uniqueness checks never decrypt.
package sealbox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
)

type Box struct {
	aead    cipher.AEAD
	hashKey []byte
}

var ErrKeyTooShort = errors.New("sealbox: key must be at least 32 bytes")

// New derives separate encryption and hashing keys from one secret, so the
// hash that sits in an indexed column is not keyed with the encryption key.
func New(secret []byte) (*Box, error) {
	if len(secret) < 32 {
		return nil, ErrKeyTooShort
	}
	encKey := derive(secret, "rove-kyc-encrypt")
	block, err := aes.NewCipher(encKey)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead: aead, hashKey: derive(secret, "rove-kyc-hash")}, nil
}

func derive(secret []byte, label string) []byte {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(label))
	return mac.Sum(nil)
}

func (b *Box) Seal(plain string) (string, error) {
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := b.aead.Seal(nonce, nonce, []byte(plain), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

func (b *Box) Open(sealed string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(sealed)
	if err != nil {
		return "", err
	}
	size := b.aead.NonceSize()
	if len(raw) < size {
		return "", errors.New("sealbox: ciphertext too short")
	}
	plain, err := b.aead.Open(nil, raw[:size], raw[size:], nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// Hash is deterministic: the same number always hashes the same way.
func (b *Box) Hash(value string) string {
	mac := hmac.New(sha256.New, b.hashKey)
	mac.Write([]byte(value))
	return hex.EncodeToString(mac.Sum(nil))
}
