package main

import (
	"benchvis/benchtab"
	"fmt"
	"os"

	"golang.org/x/perf/benchfmt"
	"golang.org/x/perf/benchmath"
	"golang.org/x/perf/benchproc"
)

func main() {
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
	}, AllowStdin: true, AllowLabels: true}
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
