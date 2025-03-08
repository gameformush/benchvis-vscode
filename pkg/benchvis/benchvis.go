package benchvis

import (
	"benchvis/pkg/benchfmt"
	"benchvis/pkg/benchmath"
	"benchvis/pkg/benchproc"
	"benchvis/pkg/benchtab"
	"errors"
	"fmt"

	"github.com/samber/lo"
)

type Result struct {
	Config []RConfig `json:"config"`
	Name   string    `json:"name"`
	Iters  int       `json:"iters"`
	Values []Value   `json:"values"`
}

type RConfig struct {
	Key   string `json:"key"`
	Value string `json:"value"`
	File  bool   `json:"file"`
}

type Value struct {
	Value float64 `json:"value"`
	Unit  string  `json:"unit"`

	OrigValue float64 `json:"orig_value"`
	OrigUnit  string  `json:"orig_unit"`
}

func ParseBenchmarkFiles(paths []string, data []string) ([]*benchfmt.Result, map[benchfmt.UnitMetadataKey]*benchfmt.UnitMetadata, error) {
	res := make([]*benchfmt.Result, len(data))
	var errs error
	files := benchfmt.Files{Paths: paths, Data: data, AllowStdin: false, AllowLabels: true}
	for files.Scan() {
		switch rec := files.Result(); rec := rec.(type) {
		case *benchfmt.SyntaxError:
			// Non-fatal result parse error. Warn
			// but keep going.
			errs = errors.Join(errs, rec)
		case *benchfmt.Result:
			res = append(res, rec)
		}
	}

	errs = errors.Join(errs, files.Err())

	return res, files.Units(), errs
}

func BenchFmtResultToResult(r []*benchfmt.Result) []Result {
	results := make([]Result, 0, len(r))
	for _, res := range r {
		if res == nil {
			println("res nil")
			continue
		}
		results = append(results, Result{
			Config: lo.Map(res.Config, func(c benchfmt.Config, _ int) RConfig {
				return RConfig{
					Key:   c.Key,
					Value: string(c.Value),
					File:  c.File,
				}
			}),
			Name:  string(res.Name),
			Iters: res.Iters,
			Values: lo.Map(res.Values, func(v benchfmt.Value, _ int) Value {
				return Value{
					Value:     v.Value,
					Unit:      v.Unit,
					OrigValue: v.OrigValue,
					OrigUnit:  v.OrigUnit,
				}
			}),
		})
	}
	fmt.Printf("%#v", results)
	return results
}

type Config struct {
	Filter       *string
	Row          *string
	Col          *string
	Ignore       *string
	Table        *string
	Confidence   *float64
	CompareAlpha *float64
}

func (c *Config) Defaults() {
	if c.Filter == nil {
		c.Filter = lo.ToPtr("*")
	}
	if c.Row == nil {
		c.Row = lo.ToPtr(".fullname")
	}
	if c.Col == nil {
		c.Col = lo.ToPtr(".file")
	}
	if c.Ignore == nil {
		c.Ignore = lo.ToPtr("")
	}
	if c.Table == nil {
		c.Table = lo.ToPtr(".config")
	}
	if c.Confidence == nil {
		c.Confidence = lo.ToPtr(0.95)
	}
	if c.CompareAlpha == nil {
		c.CompareAlpha = &benchmath.DefaultThresholds.CompareAlpha
	}
}

func BuildBenchstat(cfg *Config, benchs []*benchfmt.Result, units map[benchfmt.UnitMetadataKey]*benchfmt.UnitMetadata) (*benchtab.Tables, error) {
	cfg.Defaults()

	var parser benchproc.ProjectionParser
	filter, err := benchproc.NewFilter(*cfg.Filter)
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
	tableBy := mustParse("-table", *cfg.Table, true)
	rowBy := mustParse("-row", *cfg.Row, false)
	colBy := mustParse("-col", *cfg.Col, false)
	mustParse("-ignore", *cfg.Ignore, false)
	residue := parser.Residue()
	if parseErr != nil {
		return nil, parseErr
	}

	stat := benchtab.NewBuilder(tableBy, rowBy, colBy, residue)
	for _, bench := range benchs {
		if ok, err := filter.Apply(bench); !ok {
			if err != nil {
				// Print the reason we rejected this result.
				fmt.Println(err)
			}
			continue
		}

		stat.Add(bench)
	}

	tables := stat.ToTables(benchtab.TableOpts{
		Confidence: *cfg.Confidence,
		Thresholds: &benchmath.Thresholds{
			CompareAlpha: *cfg.CompareAlpha,
		},
		Units: units,
	})

	return tables, nil
}
