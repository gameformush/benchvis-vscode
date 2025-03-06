package benchvis

import (
	"crypto/sha1"
	"testing"
)

func BenchmarkTest(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		sha1.New().vr
	}
}
