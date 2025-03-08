package main

import (
	"benchvis/pkg/benchvis"
	"bytes"
	"encoding/json"
	"syscall/js"
)

type benchFilesArgs struct {
	Paths []string `json:"paths"`
	Data  []string `json:"data"`
}
type benchStatArgs struct {
	Paths  []string        `json:"paths"`
	Data   []string        `json:"data"`
	Config benchvis.Config `json:"config"`
}

func parseBenchmarkFiles(this js.Value, callArgs []js.Value) any {
	var args benchFilesArgs
	err := json.Unmarshal([]byte(callArgs[0].String()), &args)
	if err != nil {
		return js.ValueOf(map[string]any{
			"error": err.Error(),
		})
	}

	results, _, err := benchvis.ParseBenchmarkFiles(args.Paths, args.Data)
	if err != nil {
		return js.ValueOf(map[string]any{
			"error": err.Error(),
		})
	}

	dataBy, err := json.Marshal(benchvis.BenchFmtResultToResult(results))
	if err != nil {
		return js.ValueOf(map[string]any{
			"error": err.Error(),
		})
	}

	return js.ValueOf(map[string]any{
		"data":  string(dataBy),
		"error": nil,
	})
}

func BuildBenchstat(this js.Value, callArgs []js.Value) any {
	var args benchStatArgs
	err := json.Unmarshal([]byte(callArgs[0].String()), &args)
	if err != nil {
		return js.ValueOf(map[string]any{
			"error": err.Error(),
		})
	}

	results, units, err := benchvis.ParseBenchmarkFiles(args.Paths, args.Data)
	if err != nil {
		return js.ValueOf(map[string]any{
			"error": err.Error(),
		})
	}
	stats, err := benchvis.BuildBenchstat(&args.Config, results, units)
	if err != nil {
		return js.ValueOf(map[string]any{
			"error": err.Error(),
		})
	}

	buffer := bytes.NewBuffer(nil)
	err = stats.ToJSON(buffer)
	return js.ValueOf(map[string]any{
		"data":  buffer.String(),
		"error": err.Error(),
	})
}

func main() {
	js.Global().Set("parseBenchmarkFiles", js.FuncOf(parseBenchmarkFiles))
	js.Global().Set("buildBenchstat", js.FuncOf(BuildBenchstat))

	println("wait")

	select {}
}
