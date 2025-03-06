package benchvis

import (
	"crypto/sha1"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func BenchmarkTest(b *testing.B) {
	sizes := []int{1, 10, 100, 1000, 10000}

	for _, size := range sizes {
		b.Run(fmt.Sprintf("%d", size), func(b *testing.B) {
			b.ReportAllocs()
			b.ReportMetric(float64(size), "size")

			for i := 0; i < b.N; i++ {
				str := make([]byte, size)
				for j := 0; j < size; j++ {
					str[j] = byte(j % 256)
				}

				hash := sha1.New()
				hash.Write(str)
			}
		})

		b.Run(fmt.Sprintf("%d", size), func(b *testing.B) {
			b.ReportAllocs()
			b.ReportMetric(float64(size), "size")

			for i := 0; i < b.N; i++ {
				str := make([]byte, size)
				for j := 0; j < size; j++ {
					str[j] = byte(j % 256)
				}

				res, err := json.Marshal(str)
				require.NoError(b, err)

				_ = fmt.Sprintf("%s ", string(res))
			}
		})

	}
}
