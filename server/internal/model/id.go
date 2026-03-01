package model

import (
	"crypto/rand"
	"encoding/hex"
)

// GenerateID creates a CUID-like identifier compatible with Prisma's cuid() default.
// Uses 12 random bytes encoded as 24-character hex for simplicity and collision resistance.
func GenerateID() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		panic("failed to generate random ID: " + err.Error())
	}
	return hex.EncodeToString(b)
}
