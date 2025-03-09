package benchvis

import (
	"crypto/sha1"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"benchvis/pkg/benchtab"

	"benchvis/pkg/benchfmt"
	"benchvis/pkg/benchmath"
	"benchvis/pkg/benchproc"

	"github.com/samber/lo"
	"github.com/stretchr/testify/require"
)

func TestParseBenchmarkFiles(t *testing.T) {
	data, err := os.ReadFile("./testdata/sha.txt")
	require.NoError(t, err)

	res, _, err := ParseBenchmarkFiles([]string{"test-file.text"}, []string{string(data)})
	require.NoError(t, err)

	resBy, err := json.MarshalIndent(res, "", "   ")
	require.NoError(t, err)
	println(string(resBy))
}

func TestParseBenchstat(t *testing.T) {
	old, err := os.ReadFile("./testdata/crc-old-small.txt")
	require.NoError(t, err)

	new, err := os.ReadFile("./testdata/crc-new-small.txt")
	require.NoError(t, err)

	res, err := BuildBenchstat(Config{
		Row: lo.ToPtr("/size"),
		Col: lo.ToPtr("/poly"),
	}, []string{"old.txt", "new.txt"}, []string{string(old), string(new)})
	require.NoError(t, err)
	require.NoError(t, res.ToJSON(os.Stdout))
}

func TestBenchvis(t *testing.T) {
	var parser benchproc.ProjectionParser
	filter, err := benchproc.NewFilter("*")
	if err != nil {
		panic(err)
	}
	var parseErr error
	mustParse := func(name, val string, unit bool) *benchproc.Projection {
		var proj *benchproc.Projection
		var err error
		if unit {
			proj, _, err = parser.ParseWithUnit(val, filter)
		} else {
			proj, err = parser.Parse(val, filter)
		}
		if err != nil && parseErr == nil {
			parseErr = fmt.Errorf("parsing %s: %s", name, err)
		}
		return proj
	}
	tableBy := mustParse("-table", ".config", true)
	rowBy := mustParse("-row", "/size", false)
	colBy := mustParse("-col", "/align", false)
	mustParse("-ignore", "", false)
	residue := parser.Residue()
	if parseErr != nil {
		panic(parseErr)
	}

	files := benchfmt.Files{Paths: []string{
		"./testdata/crc-old-small.txt",
		"./testdata/crc-new-small.txt",
	}, AllowStdin: false, AllowLabels: true}
	stat := benchtab.NewBuilder(tableBy, rowBy, colBy, residue)
	for files.Scan() {
		switch rec := files.Result(); rec := rec.(type) {
		case *benchfmt.SyntaxError:
			// Non-fatal result parse error. Warn
			// but keep going.
			fmt.Println(rec)
		case *benchfmt.Result:
			if ok, err := filter.Apply(rec); !ok {
				if err != nil {
					// Print the reason we rejected this result.
					fmt.Println(err)
				}
				continue
			}

			stat.Add(rec)
		}
	}

	tables := stat.ToTables(benchtab.TableOpts{
		Confidence: 0.95,
		Thresholds: &benchmath.DefaultThresholds,
		Units:      files.Units(),
	})

	tables.ToJSON(os.Stdout)
}

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
	}
}

func BenchmarkMarshal(b *testing.B) {
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

				res, err := json.Marshal(str)
				require.NoError(b, err)

				_ = fmt.Sprintf("%s ", string(res))
			}
		})
	}
}
